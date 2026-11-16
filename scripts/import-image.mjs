/**
 * 阴阳（Yin-Yang）—— 从题面图片自动识别并导入题库
 *
 * 用法：
 *   node scripts/import-image.mjs <图片路径> [选项]
 *
 * 选项：
 *   --name 名称        题库中显示的名称（默认：识图 · W×H）
 *   --id ID            指定题目 id
 *   --series 系列      系列名（默认：图片导入）
 *   --difficulty 级别  easy / medium / hard / custom（默认 hard）
 *   --size N           正方形网格边长（自动识别失败时手动指定）
 *   --width N / --height N  非正方形题图的宽/高，可只给一边
 *   --swap             交换黑/白圆点的含义（黑圈=白、白圈=黑）
 *   --map r,c=值       人工覆盖某格（行列均从 1 开始，值 0/1/2；可重复或逗号分隔）
 *   --append           写入 src/game/imported-puzzles.ts（题库不会被 npm run gen 覆盖）
 *   --verify           求解并检查唯一解（大网格可能超时，会给出警告）
 *   --dry              只识别网格与圆点，不求解、不写入
 *   --max-nodes N      唯一性搜索节点上限（默认 400000）
 *   --timeout MS       唯一性搜索时间上限毫秒（默认 20000）
 *   --edge PATH        指定 Edge 可执行文件路径（默认自动探测）
 *
 * 识别原理（Playwright + Edge，无网络、无外部服务）：
 *   1. 把图片画到 canvas 取像素；
 *   2. 投影暗像素得到贯穿整幅图的网格线，取最长的等距线序列，得到网格尺寸；
 *   3. 每格中心圆点：中心暗度判断实心黑圈，圆环墨迹判断空心白圈，都没有则是空格；
 *   4. 生成题面串（0 空 / 1 黑 / 2 白），预览，可 --append 写入题库。
 *
 * 题图预期：黑白圆点表示给定格的阴阳题图（黑圈=黑格、白圈=白格），
 * 网格外允许有坐标标签等文字（不会影响识别）。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

// ───────────────────── 让 Node 能直接 import 项目里的 .ts ─────────────────────
// 项目源码使用无扩展名相对导入（Vite 可解析），Node 需要补 .ts；type-only 导入会被擦除。
const tsResolveLoader = `export async function resolve(specifier, context, next) {
  try { return await next(specifier, context) } catch (err) {
    if (specifier.startsWith('.') && !/\\.[cm]?[jt]s$/.test(specifier)) {
      try { return await next(specifier + '.ts', context) } catch {}
    }
    throw err
  }
}`
register('data:text/javascript;base64,' + Buffer.from(tsResolveLoader).toString('base64'))

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

function resolveEdge() {
  for (const p of EDGE_CANDIDATES) if (existsSync(p)) return p
  throw new Error('找不到 Microsoft Edge，可用 --edge 或环境变量 EDGE_PATH 指定路径')
}

const DATA_FILE = path.resolve('src/game/imported-puzzles.ts')

function usage(message) {
  if (message) console.error(`[import] ${message}`)
  console.error(
    '用法: node scripts/import-image.mjs <图片路径> [--name 名称] [--series 系列] [--difficulty easy|medium|hard|custom]\n' +
      '       [--size N | --width N --height N] [--swap] [--map r,c=值] [--append] [--verify] [--dry]\n' +
      '       [--max-nodes N] [--timeout MS] [--id ID] [--edge PATH]',
  )
  process.exit(1)
}

function parseArgs(argv) {
  const opts = {
    positional: [],
    append: false,
    verify: false,
    dry: false,
    swap: false,
    size: 0,
    width: 0,
    height: 0,
    maxNodes: 400_000,
    timeout: 20_000,
    map: [],
  }
  const valueFlags = new Set(['name', 'id', 'series', 'difficulty', 'size', 'width', 'height', 'max-nodes', 'timeout', 'edge', 'map'])
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      opts.positional.push(arg)
      continue
    }
    const key = arg.slice(2)
    if (key === 'append') opts.append = true
    else if (key === 'verify') opts.verify = true
    else if (key === 'dry') opts.dry = true
    else if (key === 'swap') opts.swap = true
    else if (valueFlags.has(key)) {
      const value = argv[i + 1]
      if (value === undefined) usage(`缺少 --${key} 的值`)
      i++
      if (key === 'max-nodes') opts.maxNodes = Number(value)
      else if (key === 'timeout') opts.timeout = Number(value)
      else if (key === 'size') opts.size = Number(value)
      else if (key === 'width') opts.width = Number(value)
      else if (key === 'height') opts.height = Number(value)
      else if (key === 'map') opts.map.push(value)
      else opts[key] = value
    } else usage(`未知选项 --${key}`)
  }
  if (opts.positional.length !== 1) usage('需要且只需要一个图片路径')
  if (!Number.isFinite(opts.maxNodes) || opts.maxNodes <= 0) usage('--max-nodes 必须是正数')
  if (!Number.isFinite(opts.timeout) || opts.timeout <= 0) usage('--timeout 必须是正数')
  return opts
}

function hashId(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 6)
}

// ───────────────────────────── 图片识别 ─────────────────────────────

function dataUrlOf(file) {
  const ext = path.extname(file).toLowerCase()
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.bmp'
        ? 'image/bmp'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg'
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`
}

async function analyzeImage({ imageFile, edge, size, width, height }) {
  const { chromium } = await import('playwright-core')
  const browser = await chromium.launch({ headless: true, executablePath: edge })
  try {
    const page = await browser.newPage()
    return await page.evaluate(
      async ({ src, sizeOpt, widthOpt, heightOpt }) => {
        const img = new Image()
        img.src = src
        await img.decode()
        const W = img.naturalWidth
        const H = img.naturalHeight
        const canvas = document.createElement('canvas')
        canvas.width = W
        canvas.height = H
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0, 0, W, H).data
        const lum = new Float32Array(W * H)
        for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
          lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        }

        const groupLines = (scores, min) => {
          const out = []
          let run = []
          for (let i = 0; i < scores.length; i++) {
            if (scores[i] >= min) run.push(i)
            else if (run.length) {
              out.push(run.reduce((a, b) => a + b, 0) / run.length)
              run = []
            }
          }
          if (run.length) out.push(run.reduce((a, b) => a + b, 0) / run.length)
          return out
        }
        // 最长等距线序列（排除坐标标签、图片边框等孤立线）
        const longestRun = (lines) => {
          let best = []
          for (let i = 0; i < lines.length; i++) {
            for (let j = i + 1; j < lines.length; j++) {
              const step = (lines[j] - lines[i]) / (j - i)
              if (step < 6) continue
              const run = [lines[i]]
              let expected = lines[i] + step
              let k = i + 1
              while (k < lines.length && Math.abs(lines[k] - expected) <= step * 0.25) {
                run.push(lines[k])
                k++
                expected += step
              }
              if (run.length > best.length) best = run
            }
          }
          if (best.length < 3) return null
          return {
            first: best[0],
            last: best[best.length - 1],
            step: (best[best.length - 1] - best[0]) / (best.length - 1),
            lines: best.length,
          }
        }

        const rowScore = new Int32Array(H)
        const colScore = new Int32Array(W)
        for (let y = 0; y < H; y++) {
          const base = y * W
          let n = 0
          for (let x = 0; x < W; x++) if (lum[base + x] < 240) n++
          rowScore[y] = n
        }
        for (let x = 0; x < W; x++) {
          let n = 0
          for (let y = 0; y < H; y++) if (lum[y * W + x] < 240) n++
          colScore[x] = n
        }
        const maxRow = Math.max(...rowScore)
        const maxCol = Math.max(...colScore)
        const hLines = longestRun(groupLines(rowScore, maxRow * 0.5))
        const vLines = longestRun(groupLines(colScore, maxCol * 0.5))
        if (!hLines || !vLines) {
          return { error: '未能定位网格线；请确认图片包含完整的题面网格，或先用 --size / --width / --height 指定尺寸' }
        }

        const autoW = vLines.lines - 1
        const autoH = hLines.lines - 1
        const w = widthOpt || sizeOpt || autoW
        const h = heightOpt || sizeOpt || autoH
        if (!(w >= 2) || !(h >= 2)) {
          return { error: `无法确定网格尺寸：竖线 ${vLines.lines} 条、横线 ${hLines.lines} 条（自动识别 ${autoW}×${autoH}）` }
        }
        if (vLines.lines !== w + 1 || hLines.lines !== h + 1) {
          return {
            error:
              `网格不匹配：识别到 ${vLines.lines} 条竖线 / ${hLines.lines} 条横线，` +
              `但目标是 ${w}×${h}（需要 ${w + 1} / ${h + 1} 条线）`,
          }
        }

        const x0 = vLines.first
        const y0 = hLines.first
        const cellW = vLines.step
        const cellH = hLines.step

        const cells = new Array(w * h).fill(0)
        const ambiguous = []
        let black = 0
        let white = 0
        let empty = 0
        const cellStats = new Array(w * h)
        for (let r = 0; r < h; r++) {
          for (let c = 0; c < w; c++) {
            const cx = x0 + (c + 0.5) * cellW
            const cy = y0 + (r + 0.5) * cellH
            const rad = Math.min(cellW, cellH) * 0.3
            let dark = 0
            let total = 0
            for (let dy = -Math.ceil(rad); dy <= Math.ceil(rad); dy++) {
              for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) {
                if (dx * dx + dy * dy > rad * rad) continue
                const x = Math.round(cx + dx)
                const y = Math.round(cy + dy)
                if (x < 0 || y < 0 || x >= W || y >= H) continue
                total++
                if (lum[y * W + x] < 128) dark++
              }
            }
            const centerDark = total ? dark / total : 0
            const rIn = Math.min(cellW, cellH) * 0.32
            const rOut = Math.min(cellW, cellH) * 0.47
            let ringInk = 0
            let ringTotal = 0
            for (let dy = -Math.ceil(rOut); dy <= Math.ceil(rOut); dy++) {
              for (let dx = -Math.ceil(rOut); dx <= Math.ceil(rOut); dx++) {
                const dist = Math.hypot(dx, dy)
                if (dist < rIn || dist > rOut) continue
                const x = Math.round(cx + dx)
                const y = Math.round(cy + dy)
                if (x < 0 || y < 0 || x >= W || y >= H) continue
                ringTotal++
                if (lum[y * W + x] < 170) ringInk++
              }
            }
            const ringRatio = ringTotal ? ringInk / ringTotal : 0
            let value = 0
            if (centerDark > 0.35) value = 1
            else if (ringRatio > 0.07) value = 2
            const idx = r * w + c
            cells[idx] = value
            cellStats[idx] = { centerDark, ringRatio }
            if (value === 1) black++
            else if (value === 2) white++
            else empty++
            const nearBlack = Math.abs(centerDark - 0.35) < 0.08
            const nearWhite = value === 0 && ringRatio > 0.03 && ringRatio < 0.07
            const strongButHollow = value === 1 && ringRatio > 0.05 && centerDark < 0.7
            if (nearBlack || nearWhite || strongButHollow) {
              ambiguous.push({ r, c, centerDark: +centerDark.toFixed(3), ringRatio: +ringRatio.toFixed(3), value })
            }
          }
        }

        return {
          width: w,
          height: h,
          cells,
          cellStats,
          black,
          white,
          empty,
          ambiguous,
          grid: {
            imageW: W,
            imageH: H,
            x0,
            y0,
            cellW,
            cellH,
            autoW,
            autoH,
          },
        }
      },
      { src: dataUrlOf(imageFile), sizeOpt: size, widthOpt: width, heightOpt: height },
    )
  } finally {
    await browser.close()
  }
}

// ───────────────────────────── 求解 / 唯一性 ─────────────────────────────

const SOLVER_TIMEOUT = Symbol('timeout')

async function verifyBoard(cells, w, h, maxNodes, timeoutMs) {
  const rules = await import('../src/game/rules.ts')
  const { propagate, isValidSolution, solveByRules } = rules
  const size = w * h
  const givens = Int8Array.from(cells)

  const t0 = Date.now()
  const ruleResult = solveByRules(givens, w, h, true)
  if (ruleResult.contradiction) {
    return { ok: false, contradiction: true, message: '规则引擎发现题面自相矛盾（给定格与阴阳规则冲突）' }
  }
  if (ruleResult.ok && ruleResult.solution) {
    return {
      ok: true,
      unique: true,
      solution: ruleResult.solution,
      nodes: 0,
      timedOut: false,
      ms: Date.now() - t0,
      logicOnly: true,
      message: `规则推理直接解完（${Date.now() - t0}ms），解必定唯一`,
    }
  }

  // 规则推不满时回溯计数；大网格可能超时
  const grid = Int8Array.from(cells)
  let nodes = 0
  let timedOut = false
  let count = 0
  let firstSolution = null
  const deadline = Date.now() + timeoutMs
  const dfs = () => {
    if (timedOut || count >= 2) return
    if ((nodes & 255) === 0 && Date.now() > deadline) {
      timedOut = true
      return
    }
    nodes++
    if (nodes > maxNodes) {
      timedOut = true
      return
    }
    if (!propagate(grid, w, h)) return
    let unknown = -1
    for (let i = 0; i < size; i++) {
      if (grid[i] === 0) {
        unknown = i
        break
      }
    }
    if (unknown < 0) {
      if (isValidSolution(grid, w, h)) {
        count++
        if (!firstSolution) firstSolution = Array.from(grid)
      }
      return
    }
    const backup = Int8Array.from(grid)
    for (const v of [1, 2]) {
      grid[unknown] = v
      dfs()
      grid.set(backup)
      if (timedOut || count >= 2) return
    }
  }
  dfs()
  const ms = Date.now() - t0
  if (timedOut) {
    return {
      ok: true,
      unique: null,
      solution: firstSolution,
      nodes,
      timedOut: true,
      ms,
      count,
      message:
        `唯一性检查超时（${nodes} 节点 / ${ms}ms）：网格可能是大号题，` +
        '无法在预算内确认唯一解。可用 --max-nodes / --timeout 放宽，或减小网格。',
    }
  }
  if (count === 0) {
    return { ok: false, contradiction: true, message: '无解：识别出的题面在阴阳规则下不成立，请检查圆点识别或使用 --map 修正' }
  }
  if (count === 1) {
    return { ok: true, unique: true, solution: firstSolution, nodes, timedOut: false, ms, count, message: `唯一解确认（${nodes} 节点 / ${ms}ms）` }
  }
  return { ok: true, unique: false, solution: firstSolution, nodes, timedOut: false, ms, count, message: '存在多个解：题面线索不足，可能漏识别了圆点' }
}

// ───────────────────────────── 写入题库 ─────────────────────────────

function appendEntry(entry) {
  const line = `  { id: ${JSON.stringify(entry.id)}, name: ${JSON.stringify(entry.name)}, width: ${entry.width}, height: ${entry.height}, difficulty: '${entry.difficulty}', series: ${JSON.stringify(entry.series)}, board: ${JSON.stringify(entry.board)}, solution: ${JSON.stringify(entry.solution ?? '')} },\n`
  if (!existsSync(DATA_FILE)) {
    writeFileSync(
      DATA_FILE,
      "import type { RawPuzzle } from './puzzles-data'\n\n/** 图片识别导入的题目（npm run import-image --append 写入；npm run gen 不会覆盖） */\nexport const IMPORTED_PUZZLES: RawPuzzle[] = [\n" +
        line +
        ']\n',
      'utf8',
    )
    return
  }
  let text = readFileSync(DATA_FILE, 'utf8').replace(/\r\n/g, '\n')
  const close = text.lastIndexOf(']')
  if (close < 0) throw new Error('imported-puzzles.ts 格式异常：找不到数组结尾 ]')
  const before = text.slice(0, close)
  text = before + (before.endsWith('\n') ? '' : '\n') + line + text.slice(close)
  writeFileSync(DATA_FILE, text, 'utf8')
}

// ───────────────────────────── 主流程 ─────────────────────────────

const opts = parseArgs(process.argv.slice(2))
const imageFile = path.resolve(opts.positional[0])
if (!existsSync(imageFile)) usage(`找不到图片：${imageFile}`)
const edge = opts.edge || resolveEdge()

console.log(`[import] 识别 ${path.relative(process.cwd(), imageFile) || imageFile}`)
const detected = await analyzeImage({ imageFile, edge, size: opts.size, width: opts.width, height: opts.height })
if (detected.error) {
  console.error(`[import] ${detected.error}`)
  process.exit(1)
}

const { width, height, grid } = detected
let cells = detected.cells.slice()
const size = width * height

// --map 人工覆盖：r,c=值（行列从 1 开始）
for (const spec of opts.map) {
  for (const pair of spec.split(';')) {
    if (!pair.trim()) continue
    const m = pair.trim().match(/^(\d+)\s*,\s*(\d+)\s*=\s*([012])$/)
    if (!m) usage(`--map 格式应为 行,列=值（行列从 1 开始，值 0/1/2），收到：${pair}`)
    const r = Number(m[1]) - 1
    const c = Number(m[2]) - 1
    const v = Number(m[3])
    if (r < 0 || r >= height || c < 0 || c >= width) usage(`--map 坐标越界：${pair}（网格 ${width}×${height}）`)
    cells[r * width + c] = v
  }
}
if (opts.swap) cells = cells.map((v) => (v === 1 ? 2 : v === 2 ? 1 : 0))

const black = cells.filter((v) => v === 1).length
const white = cells.filter((v) => v === 2).length
const empty = size - black - white
console.log(
  `[import] 网格 ${width}×${height}，格子 ${grid.cellW.toFixed(2)}×${grid.cellH.toFixed(2)}px，` +
    `图片 ${grid.imageW}×${grid.imageH}；黑圈 ${black}、白圈 ${white}、空格 ${empty}`,
)
if (detected.ambiguous.length) {
  console.warn(`[import] 有 ${detected.ambiguous.length} 个格子识别不确定（可先用 --map 修正）：`)
  for (const a of detected.ambiguous.slice(0, 12)) {
    console.warn(`  第 ${a.r + 1} 行第 ${a.c + 1} 列：中心暗度 ${a.centerDark}，圆环墨迹 ${a.ringRatio} → ${a.value}`)
  }
}

console.log('[import] 题面（1 = 黑圈/黑格，2 = 白圈/白格，0 = 空）：')
for (let r = 0; r < height; r++) {
  let line = ''
  for (let c = 0; c < width; c++) {
    const v = cells[r * width + c]
    line += v === 1 ? '#' : v === 2 ? 'o' : '.'
  }
  console.log(String(r + 1).padStart(2) + ' ' + line)
}
const board = cells.join('')

const id = opts.id || `yinyang-${width}x${height}-${hashId(board)}`
const name = opts.name || `识图 · ${width}×${height}`
const difficulty = opts.difficulty || 'hard'
const series = opts.series || '图片导入'
const entry = { id, name, width, height, difficulty, series, board, solution: '' }

if (opts.dry) {
  console.log('[import] --dry：仅识别，不求解、不写入。')
  process.exit(0)
}

// 求解 / 唯一性：预览时给参考，--append 时未确认唯一解会警告
let verifyResult = null
if (opts.verify || opts.append) {
  console.log('[import] 求解 / 唯一性检查…')
  verifyResult = await verifyBoard(cells, width, height, opts.maxNodes, opts.timeout)
  if (!verifyResult.ok) {
    console.error(`[import] ${verifyResult.message}`)
    process.exit(1)
  }
  if (verifyResult.solution) entry.solution = verifyResult.solution.join('')
  console.log(
    `[import] ${verifyResult.message}` +
      (verifyResult.solution ? `；参考解 ${entry.solution.length} 格` : '；未写入参考解'),
  )
  if (verifyResult.unique === false) console.warn('[import] 警告：题目不是唯一解，导入后可能无法靠逻辑完成。')
}

if (!opts.append) {
  console.log('[import] 预览模式（未写入题库）。加 --append 写入 src/game/imported-puzzles.ts。')
  console.log('[import] 题库条目：')
  console.log(JSON.stringify({ ...entry, solution: entry.solution ? entry.solution.slice(0, 24) + '…' : '' }, null, 2))
} else {
  appendEntry(entry)
  console.log(`[import] 已写入 ${path.relative(process.cwd(), DATA_FILE)}：${id} ${name}`)
  console.log('[import] 提示：若想让它进入生成器题库，可执行 npm run gen（生成的 puzzles-data.ts 与导入文件是分开的）。')
}
