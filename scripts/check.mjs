/**
 * 阴阳（Yin-Yang）—— 题库 / 逻辑深度审计
 *
 * 直接在 Node 里 import 游戏模块（Node 24 原生 TS type-stripping），不依赖浏览器：
 *   1. 题库结构：id 唯一、宽高/题面长度一致；
 *   2. 参考解存在且通过实时校验；
 *   3. 逻辑回放：从空盘出发能推到完成，终态与参考解一致；
 *   4. 统计每题的反证次数 / 推导帧 / 剩余空格（用于观察新定式的效果）。
 *
 * 用法：npm run check
 */
import { builtinPuzzles } from '../src/game/puzzles.ts'
import { planLogicSolve } from '../src/game/logic.ts'
import { validate } from '../src/game/validate.ts'

const errors = []
const ids = new Set()
const rows = []
let totalProbe = 0
let totalFrames = 0
let totalMs = 0
let pureCount = 0

for (const p of builtinPuzzles) {
  const size = p.width * p.height
  if (ids.has(p.id)) errors.push(`重复 id：${p.id}`)
  ids.add(p.id)
  if (!Number.isInteger(p.width) || !Number.isInteger(p.height) || p.width <= 0 || p.height <= 0) {
    errors.push(`${p.id} 宽高非法：${p.width}×${p.height}`)
    continue
  }
  if (p.givens.length !== size) {
    errors.push(`${p.id} 题面长度 ${p.givens.length} != ${p.width}×${p.height}`)
    continue
  }
  if (!p.solution || p.solution.length !== size) {
    errors.push(`${p.id} 缺少参考解`)
  } else {
    const ref = {
      puzzleId: p.id,
      width: p.width,
      height: p.height,
      cells: p.solution.slice(),
      givens: p.givens.slice(),
    }
    const check = validate(ref, p)
    if (!check.solved) errors.push(`${p.id} 参考解未通过校验`)
  }

  const state = {
    puzzleId: p.id,
    width: p.width,
    height: p.height,
    cells: p.givens.slice(),
    givens: p.givens.slice(),
  }
  const t0 = performance.now()
  const plan = planLogicSolve(p, state)
  const ms = Math.round(performance.now() - t0)
  totalProbe += plan.probeTrials
  totalFrames += plan.frames.length
  totalMs += ms
  if (plan.probeTrials === 0) pureCount++

  let finalValid = false
  let matchesRef = false
  if (plan.finalState) {
    finalValid = validate(plan.finalState, p).solved
    matchesRef = plan.remaining === 0 && (p.solution ?? []).every((v, i) => plan.finalState.cells[i] === v)
  }
  if (!plan.finalState) errors.push(`${p.id} 逻辑回放没有产出终态`)
  else if (!finalValid) errors.push(`${p.id} 逻辑回放终态未通过校验`)
  else if (!matchesRef) errors.push(`${p.id} 逻辑回放终态与参考解不同`)
  if (plan.frames.length === 0) errors.push(`${p.id} 逻辑回放没有产生任何推理帧`)

  rows.push({
    题名: p.name,
    尺寸: `${p.width}×${p.height}`,
    给定: p.givens.filter((v) => v !== 0).length,
    推理帧: plan.frames.length,
    反证: plan.probeTrials,
    剩余: plan.remaining,
    终态: finalValid ? 'OK' : 'FAIL',
    与参考解一致: matchesRef ? 'OK' : 'FAIL',
    ms,
  })
}

console.log(`[check] 阴阳内置题：${rows.length} 道（${[...new Set(rows.map((r) => r.尺寸))].join(' / ')}）`)
console.table(rows)
console.log(
  `[check] 推理量：反证合计 ${totalProbe} · 帧合计 ${totalFrames} · 纯规则题 ${pureCount}/${rows.length}` +
    ` · 回放总耗时 ${totalMs}ms`,
)

if (errors.length) {
  console.error(`\n[check] 发现 ${errors.length} 个问题：`)
  for (const e of errors) console.error('  - ' + e)
} else {
  console.log('\n[check] 全部通过 ✔')
}
process.exitCode = errors.length ? 1 : 0
