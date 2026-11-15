import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { PORT } from './scripts/_port.mjs'

/**
 * 模板的 Vite 配置：完全通用，不需要为具体游戏修改。
 *
 * 负责：
 * 1. 端口（读 package.json 的 puzzle.port，strictPort 保证不会悄悄换端口）
 * 2. 所有响应 no-cache / no-store，文档导航清缓存（避免 Vite 缓存串味）
 * 3. 项目内 data/ 存储中间件 /__store（题库 + 进度 + 上次题目）
 * 4. 启动失败回传 /__boot-failure（配合 index.html 兜底脚本）
 * 5. 题板审计页 /__audit（在浏览器里跑适配器，把结果 post 回终端）
 */

const DATA_DIR = path.resolve(__dirname, 'data')
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json')
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json')
const LAST_PUZZLE_FILE = path.join(DATA_DIR, 'last-puzzle.json')

function readJson(file: string, fallback: unknown): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function readStoreFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  return {
    version: 1,
    library: readJson(LIBRARY_FILE, []),
    progress: readJson(PROGRESS_FILE, {}),
    lastPuzzle: (readJson(LAST_PUZZLE_FILE, null) as string | null) ?? null,
  }
}

function writeStoreFiles(data: {
  library?: unknown
  progress?: unknown
  lastPuzzle?: string | null
}) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const write = (file: string, value: unknown) => {
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
    fs.renameSync(tmp, file)
  }
  if (data.library !== undefined) write(LIBRARY_FILE, data.library)
  if (data.progress !== undefined) write(PROGRESS_FILE, data.progress)
  write(LAST_PUZZLE_FILE, data.lastPuzzle ?? null)
}

/** 开发/预览都不允许浏览器缓存任何响应 */
const noCacheHeaders = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
}

/**
 * 题板审计页（dev-only）：在浏览器里直接 import 游戏适配器，
 * 逐题检查参考解合法 + 逻辑解题计划可生成，结果 post 回终端。
 */
function auditPageHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>题板审计</title>
<style>
body{font:13px/1.6 "Segoe UI","Microsoft YaHei",sans-serif;background:#f6f2ea;color:#1c1b18;margin:0;padding:24px}
pre{white-space:pre-wrap;word-break:break-all;background:#fffdf8;border:1px solid #d9d2c3;border-radius:12px;padding:16px}
h1{font-size:16px;margin:0 0 12px}
</style>
</head>
<body>
<h1>题板审计（开发期工具，不影响游戏）</h1>
<pre id="out">running…</pre>
<script type="module">
const out = document.getElementById('out')
const say = (s) => { out.textContent += (out.textContent==='running…'?'':'\\n') + s }
const { adapter } = await import('/src/game/adapter.ts')

// 1) 参考解合法
let refBad = 0
for (const p of adapter.builtinPuzzles) {
  const sol = adapter.getReferenceSolution(p.id)
  if (!sol) { say('缺参考解: ' + p.id); refBad++; continue }
  const r = adapter.validate(sol, p)
  if (!r.solved) { say('参考解不合法: ' + p.id + ' => ' + JSON.stringify(r)); refBad++ }
  else say('参考解 OK: ' + p.id + ' ' + p.width + 'x' + p.height)
}

// 2) 逻辑解题计划
let planFrames = 0
for (const p of adapter.builtinPuzzles) {
  const st = adapter.createEmptyState(p)
  const plan = adapter.planLogicSolve(p, st)
  planFrames += plan.frames.length
  if (plan.frames.length) say('逻辑计划 ' + p.id + ': ' + plan.frames.length + ' 帧 / ' + plan.ruleSteps + ' 规则步')
}

say('共 ' + adapter.builtinPuzzles.length + ' 题；参考解非法 ' + refBad + '；逻辑计划总帧数 ' + planFrames)
const report = { puzzles: adapter.builtinPuzzles.length, refBad, planFrames }
try { await fetch('/__audit-result', { method: 'POST', body: JSON.stringify(report) }) } catch (e) {}
</script>
</body>
</html>`
}

function devGuards(): Plugin {
  return {
    name: 'puzzle-template-dev-guards',
    configureServer(server) {
      // ① 文档导航时清掉该 origin 的 HTTP 缓存
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (path === '/' || path === '/index.html') {
          res.setHeader('Clear-Site-Data', '"cache"')
        }
        next()
      })

      // ② 启动失败回传
      server.middlewares.use('/__boot-failure', (req, res) => {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          server.config.logger.error(`[boot] 页面启动失败：${body || '(无详情)'}`)
          res.statusCode = 204
          res.end()
        })
      })

      // ③ 项目内存储：题库 / 进度 / 上次题目
      server.middlewares.use('/__store', (req, res, next) => {
        const p = (req.url || '').split('?')[0]
        if (p !== '/' && p !== '') return next()
        if (req.method === 'GET') {
          try {
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(readStoreFiles()))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(e) }))
          }
          return
        }
        if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => (body += chunk))
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}')
              writeStoreFiles({
                library: Array.isArray(data.library) ? data.library : [],
                progress: data.progress && typeof data.progress === 'object' ? data.progress : {},
                lastPuzzle: typeof data.lastPuzzle === 'string' ? data.lastPuzzle : null,
              })
              res.statusCode = 204
            } catch (e) {
              res.statusCode = 400
              res.end(String(e))
              return
            }
            res.end()
          })
          return
        }
        next()
      })

      // ④ 题板审计
      server.middlewares.use('/__audit', (req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (path !== '/' && path !== '') return next()
        if (req.method !== 'GET') return next()
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(auditPageHtml())
      })
      server.middlewares.use('/__audit-result', (req, res) => {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          server.config.logger.info(`[audit] ${body}`)
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [devGuards()],
  server: {
    host: '127.0.0.1',
    port: PORT,
    strictPort: true,
    headers: noCacheHeaders,
    watch: {
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/output/**'],
    },
  },
  preview: {
    headers: noCacheHeaders,
    strictPort: true,
  },
})