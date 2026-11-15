/**
 * 冒烟测试（Playwright，模板通用）
 *
 * 用法：先 `npx vite preview --port <端口>` 或 `npm run dev`，
 *      再 `node scripts/ui-check.mjs`。
 * 端口读 package.json 的 puzzle.port（与 vite.config.ts / dev.mjs 同源）；
 * 可用环境变量 EDGE_PATH 指定 Edge 可执行文件路径。
 *
 * 空壳模板也能通过：题库为空时只验证页面骨架不崩溃、按钮可点。
 */
import { chromium } from 'playwright-core'
import { PORT } from './_port.mjs'

const executablePath =
  process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const browser = await chromium.launch({ headless: true, executablePath })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
let pageErrors = 0
page.on('pageerror', (e) => {
  pageErrors++
  console.log('PAGEERROR', e.message)
})
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE', msg.text())
})

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' })
await page.screenshot({ path: 'output/playwright/01-initial.png', fullPage: true })

const puzzleCount = await page.locator('.puzzle-item').count()
const hasBoard = (await page.locator('svg.board-svg').count()) > 0
const hasStatus = (await page.locator('#status').count()) > 0
console.log({ puzzleCount, hasBoard, hasStatus })

// 工具栏按钮存在且可点
for (const id of ['btn-check', 'btn-undo', 'btn-redo', 'btn-clear', 'btn-mute', 'btn-logic']) {
  const btn = page.locator(`#${id}`)
  const disabled = (await btn.getAttribute('disabled')) !== null
  if (disabled) continue
  await btn.click()
  await page.waitForTimeout(60)
}
await page.screenshot({ path: 'output/playwright/02-toolbar.png', fullPage: true })

// 自定义题板编辑器
await page.click('#btn-custom')
await page.waitForTimeout(80)
await page.screenshot({ path: 'output/playwright/03-custom.png', fullPage: true })
await page.click('#custom-regen')
await page.waitForTimeout(80)
await page.click('#custom-close')
await page.waitForTimeout(80)

// 有题时：选第一题并截图
if (puzzleCount > 0) {
  await page.locator('.puzzle-item').first().click()
  await page.waitForTimeout(120)
  await page.screenshot({ path: 'output/playwright/04-puzzle.png', fullPage: true })
}

console.log('pageErrors:', pageErrors)
await browser.close()
if (pageErrors > 0) process.exitCode = 1
console.log('OK')