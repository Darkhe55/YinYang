import { chromium } from 'playwright-core'
const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto('http://127.0.0.1:5179/', { waitUntil: 'networkidle' })
const results = await page.evaluate(() => {
  const a = window.__game.adapter
  return a.builtinPuzzles.map((p) => {
    const st = a.createEmptyState(p)
    const t = performance.now()
    const plan = a.planLogicSolve(p, st)
    const dt = Math.round(performance.now() - t)
    const vr = plan.finalState ? a.validate(plan.finalState, p) : null
    return {
      name: p.name,
      size: `${p.width}x${p.height}`,
      frames: plan.frames.length,
      ruleSteps: plan.ruleSteps,
      finalSolved: vr?.solved ?? false,
      finalEmpty: vr?.empty ?? -1,
      saturated: plan.saturated,
      ms: dt,
    }
  })
})
console.log(results)
await browser.close()
