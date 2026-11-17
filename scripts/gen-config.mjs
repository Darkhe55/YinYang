/**
 * 阴阳题库生成器
 *
 * 思路：
 *   1. 先生成一个合法的完整盘面（黑/白各自连通、无 2×2 同色）；
 *   2. 从完整解里逐个拿掉给定格，只有当「规则引擎仍能唯一推到完整解」时才保留；
 *   3. 输出 0/1/2 编码的题面与参考解。
 *
 * 规则引擎（生成器内置的是保守子集，保证生成的题一定能被游戏逻辑解完整推出）：
 *   R1 2×2 三连同色 → 第四格反色
 *   R2 某色连通区被反色包围 → 该区域空格只能是反色
 *   R3 反证：试填一色后规则矛盾 → 必为另一色
 * 游戏里的 src/game/rules.ts 还额外实现了「连通性割点」定式，只会更强；
 * 因此用本生成器产出的题，游戏端一定也能纯规则推完（而且反证次数更少）。
 *
 * 只要规则能推满，解就是唯一的（每一步都是必然结论）。
 */

export const NAME = '阴阳规则生成器'

/* ────────────────────────── 随机数 ────────────────────────── */

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BLACK = 1
const WHITE = 2
const EMPTY = 0

/* ────────────────────────── 合法盘面 ────────────────────────── */

function connected(grid, w, h, color) {
  let start = -1
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === color) {
      start = i
      break
    }
  }
  if (start < 0) return true

  const n = w * h
  const seen = new Uint8Array(n)
  const stack = [start]
  seen[start] = 1
  let count = 0
  while (stack.length) {
    const i = stack.pop()
    count++
    const x = i % w
    const y = (i / w) | 0
    if (x > 0 && !seen[i - 1] && grid[i - 1] === color) {
      seen[i - 1] = 1
      stack.push(i - 1)
    }
    if (x + 1 < w && !seen[i + 1] && grid[i + 1] === color) {
      seen[i + 1] = 1
      stack.push(i + 1)
    }
    if (y > 0 && !seen[i - w] && grid[i - w] === color) {
      seen[i - w] = 1
      stack.push(i - w)
    }
    if (y + 1 < h && !seen[i + w] && grid[i + w] === color) {
      seen[i + w] = 1
      stack.push(i + w)
    }
  }
  let total = 0
  for (const v of grid) if (v === color) total++
  return count === total
}

function isValidFull(grid, w, h) {
  for (let y = 0; y + 1 < h; y++) {
    const row = y * w
    for (let x = 0; x + 1 < w; x++) {
      const a = row + x
      if (grid[a] === grid[a + 1] && grid[a] === grid[a + w] && grid[a] === grid[a + w + 1]) {
        return false
      }
    }
  }
  return connected(grid, w, h, BLACK) && connected(grid, w, h, WHITE)
}

/**
 * 梳齿形合法盘面：
 *   第 0 行全黑、最后一行全白，中间每行按列交替。
 * 这是生成随机完整盘的种子。
 */
function combSeed(w, h) {
  const g = new Array(w * h).fill(WHITE)
  for (let x = 0; x < w; x++) g[x] = BLACK
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) g[y * w + x] = x % 2 === 0 ? BLACK : WHITE
  }
  return g
}

function flipRows(grid, w, h) {
  const out = grid.slice()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = grid[(h - 1 - y) * w + x]
  }
  return out
}

function flipCols(grid, w, h) {
  const out = grid.slice()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = grid[y * w + (w - 1 - x)]
  }
  return out
}

function transpose(grid, w) {
  const out = grid.slice()
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = grid[x * w + y]
  }
  return out
}

/** 从梳齿种子做随机两格翻色游走，保持合法 */
function generateFull(w, h, seed) {
  const rng = mulberry32(seed)
  let grid = combSeed(w, h)
  const attempts = w * h * 90
  let accepted = 0
  const acceptCap = Math.max(300, Math.floor(attempts * 0.02))

  for (let it = 0; it < attempts && accepted < acceptCap; it++) {
    const x = Math.floor(rng() * (w - 1))
    const y = Math.floor(rng() * (h - 1))
    const cells = [y * w + x, y * w + x + 1, (y + 1) * w + x, (y + 1) * w + x + 1]
    const i = cells[Math.floor(rng() * 4)]
    const j = cells[Math.floor(rng() * 4)]
    if (i === j) continue

    const oi = grid[i]
    const oj = grid[j]
    grid[i] = oi === BLACK ? WHITE : BLACK
    grid[j] = oj === BLACK ? WHITE : BLACK
    if (isValidFull(grid, w, h)) accepted++
    else {
      grid[i] = oi
      grid[j] = oj
    }
  }

  // 随机翻转/转置，增加题面变化
  if (rng() < 0.5) grid = flipRows(grid, w, h)
  if (rng() < 0.5) grid = flipCols(grid, w, h)
  if (w === h && rng() < 0.5) grid = transpose(grid, w)
  if (rng() < 0.5) grid = grid.map((v) => (v === BLACK ? WHITE : BLACK))

  if (!isValidFull(grid, w, h)) {
    // 极端情况下退回基础梳齿盘
    grid = combSeed(w, h)
  }
  return grid
}

/* ────────────────────────── 规则引擎 ────────────────────────── */

const NB = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * 规则传播到不动点。
 * 返回 false 表示发现矛盾。
 */
function propagate(grid, w, h) {
  const n = w * h
  let changed = true

  while (changed) {
    changed = false

    // R1: 2×2 三连同色
    for (let y = 0; y + 1 < h; y++) {
      const row = y * w
      for (let x = 0; x + 1 < w; x++) {
        const a = row + x
        const b = a + 1
        const c = a + w
        const d = c + 1
        let black = 0
        let white = 0
        let unknown = -1
        for (const q of [a, b, c, d]) {
          if (grid[q] === BLACK) black++
          else if (grid[q] === WHITE) white++
          else unknown = q
        }
        if (black === 4 || white === 4) return false
        if (unknown >= 0) {
          if (black === 3) {
            grid[unknown] = WHITE
            changed = true
          } else if (white === 3) {
            grid[unknown] = BLACK
            changed = true
          }
        }
      }
    }

    // R2: 连通性
    for (const color of [BLACK, WHITE]) {
      let exists = false
      for (let i = 0; i < n; i++) {
        if (grid[i] === color) {
          exists = true
          break
        }
      }
      if (!exists) continue

      const seen = new Uint8Array(n)
      let coloredRegions = 0
      const colorless = []

      for (let start = 0; start < n; start++) {
        if (seen[start]) continue
        if (grid[start] !== color && grid[start] !== EMPTY) continue

        const region = []
        let hasColor = false
        const stack = [start]
        seen[start] = 1
        while (stack.length) {
          const i = stack.pop()
          region.push(i)
          if (grid[i] === color) hasColor = true
          const x = i % w
          const y = (i / w) | 0
          for (const [dx, dy] of NB) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            const j = ny * w + nx
            if (seen[j]) continue
            if (grid[j] !== color && grid[j] !== EMPTY) continue
            seen[j] = 1
            stack.push(j)
          }
        }
        if (hasColor) coloredRegions++
        else colorless.push(region)
      }

      if (coloredRegions > 1) return false
      if (coloredRegions === 1) {
        const opposite = color === BLACK ? WHITE : BLACK
        for (const region of colorless) {
          for (const i of region) {
            if (grid[i] === EMPTY) {
              grid[i] = opposite
              changed = true
            }
          }
        }
      }
    }
  }

  return true
}

/** 规则 + 反证探测；只有推满才返回 ok */
function solveByRules(given, w, h) {
  const grid = Int8Array.from(given)
  const n = w * h

  for (let round = 0; round < n * 3; round++) {
    if (!propagate(grid, w, h)) return { ok: false, solution: null }

    let unknown = -1
    for (let i = 0; i < n; i++) {
      if (grid[i] === EMPTY) {
        unknown = i
        break
      }
    }
    if (unknown < 0) {
      const solution = Array.from(grid)
      return isValidFull(solution, w, h)
        ? { ok: true, solution }
        : { ok: false, solution: null }
    }

    const forced = []
    for (let i = 0; i < n; i++) {
      if (grid[i] !== EMPTY) continue

      let blackImpossible = false
      let whiteImpossible = false
      {
        const trial = Int8Array.from(grid)
        trial[i] = BLACK
        if (!propagate(trial, w, h)) blackImpossible = true
      }
      {
        const trial = Int8Array.from(grid)
        trial[i] = WHITE
        if (!propagate(trial, w, h)) whiteImpossible = true
      }
      if (blackImpossible && whiteImpossible) return { ok: false, solution: null }
      if (blackImpossible !== whiteImpossible) {
        forced.push({ index: i, value: blackImpossible ? WHITE : BLACK })
      }
    }

    if (!forced.length) return { ok: false, solution: null }
    for (const { index, value } of forced) {
      if (grid[index] === EMPTY) grid[index] = value
    }
  }

  return { ok: false, solution: null }
}

/* ────────────────────────── 出题 ────────────────────────── */

function shuffle(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

const SPECS = [
  {
    w: 6,
    h: 6,
    seed: 0x6a11,
    remove: 10,
    difficulty: 'easy',
    name: '两仪初分',
    series: '入门',
  },
  {
    w: 6,
    h: 6,
    seed: 0x6a22,
    remove: 18,
    difficulty: 'medium',
    name: '黑白相依',
    series: '入门',
  },
  {
    w: 7,
    h: 7,
    seed: 0x7b11,
    remove: 16,
    difficulty: 'easy',
    name: '阴阳初判',
    series: '入门',
  },
  {
    w: 8,
    h: 8,
    seed: 0x8c21,
    remove: 32,
    difficulty: 'medium',
    name: '双鱼回旋',
    series: '进阶',
  },
  {
    w: 9,
    h: 9,
    seed: 0x9d21,
    remove: 42,
    difficulty: 'medium',
    name: '太极流转',
    series: '进阶',
  },
  {
    w: 10,
    h: 10,
    seed: 0xae31,
    remove: 62,
    difficulty: 'hard',
    name: '两仪相生',
    series: '挑战',
  },
  {
    w: 12,
    h: 12,
    seed: 0xbf31,
    remove: 92,
    difficulty: 'hard',
    name: '万象归元',
    series: '挑战',
  },
]

function makePuzzle(spec) {
  const { w, h, seed } = spec
  const full = generateFull(w, h, seed)
  if (!isValidFull(full, w, h)) throw new Error(`[gen] ${spec.name} 完整盘面不合法`)

  const rng = mulberry32(seed ^ 0x9e3779b9)
  const givens = full.slice()
  const order = shuffle(
    Array.from({ length: w * h }, (_, i) => i),
    rng,
  )

  let removed = 0
  for (const i of order) {
    if (removed >= spec.remove) break
    const old = givens[i]
    givens[i] = EMPTY
    const result = solveByRules(givens, w, h)
    if (result.ok && result.solution) {
      // 规则推出来的解必须就是完整解，否则说明规则引擎或盘面有问题
      let same = true
      for (let k = 0; k < full.length; k++) {
        if (result.solution[k] !== full[k]) {
          same = false
          break
        }
      }
      if (same) {
        removed++
      } else {
        givens[i] = old
      }
    } else {
      givens[i] = old
    }
  }

  const clues = givens.filter((v) => v !== EMPTY).length
  console.log(
    `[gen] ${spec.name} ${w}×${h} 线索 ${clues}/${w * h}（拿掉 ${removed} 格）`,
  )

  return {
    id: `yinyang-${w}x${h}-${seed.toString(36)}`,
    name: spec.name,
    width: w,
    height: h,
    difficulty: spec.difficulty,
    series: spec.series,
    board: givens.map((v) => String(v)).join(''),
    solution: full.map((v) => String(v)).join(''),
  }
}

export async function generatePuzzles() {
  return SPECS.map(makePuzzle)
}
