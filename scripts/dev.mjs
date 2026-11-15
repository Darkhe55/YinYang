/**
 * 本地启动：先等 dev server 真正能响应，再用默认浏览器打开。
 * 端口读 package.json 的 puzzle.port（与 vite.config.ts / ui-check.mjs 同源）。
 */
import { spawn } from 'node:child_process'
import { PORT } from './_port.mjs'

const url = process.env.DEV_URL || `http://127.0.0.1:${PORT}/`
const READY_TIMEOUT_MS = 60_000

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
  stdio: 'inherit',
})
const stop = (code) => process.exit(code ?? 1)
vite.on('exit', stop)
vite.on('error', (err) => {
  console.error('[dev] 无法启动 vite：', err.message)
  stop(1)
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitReady() {
  const started = Date.now()
  for (;;) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) return true
    } catch {
      /* 还没起来 */
    }
    if (Date.now() - started > READY_TIMEOUT_MS) return false
    await sleep(150)
  }
}

if (process.env.DEV_NO_OPEN) {
  console.log(`\n[dev] 服务就绪：${url}（DEV_NO_OPEN 已设置，跳过打开浏览器）`)
} else if (await waitReady()) {
  console.log(`\n[dev] 服务就绪，正在打开浏览器：${url}`)
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]]
  const opener = spawn(cmd, args, { stdio: 'ignore', detached: true })
  opener.on('error', (err) => console.error('[dev] 打开浏览器失败：', err.message))
  opener.unref()
} else {
  console.error(`\n[dev] ${url} 在 ${READY_TIMEOUT_MS / 1000}s 内未就绪，请手动访问该地址`)
}