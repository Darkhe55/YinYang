import { chromium } from 'playwright-core'
import { PORT } from './_port.mjs'

const executablePath =
  process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const browser = await chromium.launch({ headless: true, executablePath })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
let failures = 0
page.on('pageerror', (e) => errors.push(e.message))

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board-svg')

// 1) 检查每道题的参考解
const report = await page.evaluate(() => {
  const g = window.__game
  const a = g.adapter
  const rows = []
  for (const p of a.builtinPuzzles) {
    const sol = a.getReferenceSolution(p.id)
    const r = sol ? a.validate(sol, p) : null
    rows.push({ id: p.id, name: p.name, solved: r?.solved ?? false, empty: r?.empty ?? -1 })
  }
  return rows
})
console.log('reference solutions:', report)
if (!report.every((r) => r.solved)) {
  failures++
  console.error('FAIL: 有参考解未通过校验')
}

// 2) 逻辑解题：选最小题，运行回放
await page.locator('.puzzle-item', { hasText: '两仪初分' }).first().click()
await page.waitForTimeout(100)
const before = await page.evaluate(() => {
  const s = window.__game.getSession()
  return { id: s.puzzle.id, empty: s.state.cells.filter((v) => v === 0).length }
})
console.log('selected:', before)

const t0 = Date.now()
await page.click('#btn-logic')
await page.waitForFunction(
  () => {
    const btn = document.querySelector('#btn-logic')
    return btn && !btn.disabled && btn.textContent === '逻辑解题'
  },
  { timeout: 120000 },
)
await page.waitForTimeout(300)
const afterLogic = await page.evaluate(() => {
  const g = window.__game
  const s = g.getSession()
  return {
    id: s.puzzle.id,
    empty: s.state.cells.filter((v) => v === 0).length,
    solved: g.adapter.validate(s.state, s.puzzle).solved,
    status: document.querySelector('#status').textContent,
  }
})
console.log('logic solve ms:', Date.now() - t0, afterLogic)
if (!afterLogic.solved || afterLogic.empty !== 0) {
  failures++
  console.error('FAIL: 逻辑解题没有解完')
}

// 3) 显示解 + 清空 + 用户落子 + 撤销
await page.click('#btn-solve')
await page.waitForTimeout(80)
const afterSolve = await page.evaluate(() => {
  const g = window.__game
  const s = g.getSession()
  return { solved: g.adapter.validate(s.state, s.puzzle).solved, status: document.querySelector('#status').textContent }
})
console.log('show solution:', afterSolve)
if (!afterSolve.solved) {
  failures++
  console.error('FAIL: 显示解没有通过校验')
}
await page.click('#btn-clear')
await page.waitForTimeout(80)

// 找一个空格并点击
const afterClear = await page.evaluate(() => {
  const g = window.__game
  const s = g.getSession()
  return g.adapter.validate(s.state, s.puzzle).empty
})
const emptyIndex = await page.evaluate(() => {
  const s = window.__game.getSession()
  return s.state.cells.findIndex((v) => v === 0)
})
console.log('empty index:', emptyIndex)
const box = await page.locator('svg.board-svg').boundingBox()
const metrics = await page.evaluate(() => {
  const s = window.__game.getSession()
  return window.__game.adapter.metricsFor(s.puzzle)
})
const col = emptyIndex % metrics.width
const row = Math.floor(emptyIndex / metrics.width)
const scale = await page.evaluate(() => {
  const svg = document.querySelector('svg.board-svg')
  const r = svg.getBoundingClientRect()
  const vb = svg.viewBox.baseVal
  return { sx: r.width / vb.width, sy: r.height / vb.height, vx: vb.x, vy: vb.y, rx: r.x, ry: r.y }
})
const px = box.x + (metrics.pad + col * metrics.cell + metrics.cell / 2 - scale.vx) * scale.sx
const py = box.y + (metrics.pad + row * metrics.cell + metrics.cell / 2 - scale.vy) * scale.sy
await page.mouse.click(px, py)
await page.waitForTimeout(80)
const afterClick = await page.evaluate(() => {
  const g = window.__game
  const s = g.getSession()
  return {
    value: s.state.cells.filter((v, i) => v !== s.state.givens[i]).length,
    empty: g.adapter.validate(s.state, s.puzzle).empty,
    status: document.querySelector('#status').textContent,
  }
})
console.log('after click:', afterClick)
if (afterClick.value !== 1 || afterClick.empty !== afterClear - 1) {
  failures++
  console.error('FAIL: 点击空格没有正确落子')
}
await page.click('#btn-undo')
await page.waitForTimeout(80)
const afterUndo = await page.evaluate(() => {
  const s = window.__game.getSession()
  return { filled: s.state.cells.filter((v, i) => v !== s.state.givens[i]).length }
})
console.log('after undo:', afterUndo)
if (afterUndo.filled !== 0) {
  failures++
  console.error('FAIL: 撤销没有回到给定盘面')
}

// 4) 自定义题板
await page.click('#btn-custom')
await page.waitForTimeout(80)
await page.fill('#custom-w', '5')
await page.fill('#custom-h', '5')
await page.click('#custom-regen')
await page.waitForTimeout(80)
await page.locator('.custom-cell').nth(0).click()
await page.locator('.custom-cell').nth(1).click()
await page.click('#custom-apply')
await page.waitForTimeout(120)
const custom = await page.evaluate(() => {
  const s = window.__game.getSession()
  return {
    w: s.puzzle.width,
    h: s.puzzle.height,
    givens: s.state.givens.filter((v) => v !== 0).length,
  }
})
console.log('custom:', custom)
await page.click('#custom-close')

await page.screenshot({ path: 'output/playwright/05-verified.png', fullPage: true })
console.log('pageErrors:', errors)
console.log('failures:', failures)
await browser.close()
if (errors.length || failures > 0) process.exitCode = 1
