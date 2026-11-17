/**
 * 阴阳 —— 逻辑解题回放计划
 *
 * 推理顺序：
 *   1. 2×2 三连同色 → 第四格反色
 *   2. 某色连通区被反色完全包围 → 该区域空格只能是反色
 *   3. 连通性割点：某空格不填该色会切断该色区域 → 必填该色
 *   4. 反证：把某空格试填黑/白，若其中一种会立刻矛盾，则该格必为另一色
 *
 * 每一步都是必然结论；生成的题库也经过同一套规则验证，
 * 因此「逻辑解题」通常能一路推到完成。第 3 条定式会先吸收掉大部分
 * 原本只能靠反证做的连通性排除，明显减少反证次数。
 */

import type { GameState, LogicPlan, PlaybackFrame, Puzzle } from '../core/types.ts'
import { propagate, type RuleKind } from './rules.ts'
import { asYinState, BLACK, EMPTY, WHITE, type YinState } from './types.ts'

/** 逻辑回放计划 + 审计计数（计数不影响回放内容） */
export interface YinLogicPlan extends LogicPlan {
  /** 反证试探次数（每次 trial propagate 记 1） */
  probeTrials: number
  /** 反证成功命中（排除了一种颜色）的格数 */
  probeHits: number
  /** 推理结束后的空格数 */
  remaining: number
  /** 按规则统计的落帧数 */
  ruleFrames: Record<string, number>
}

const RULE_INFO: Record<RuleKind | 'probe', { rule: number; label: string }> = {
  block: { rule: 1, label: '2×2 三连通色 → 第四格必为反色' },
  connect: { rule: 2, label: '连通性：该格只能填这一色' },
  cut: { rule: 3, label: '连通性割点：这一格不填该色会切断同色区域' },
  probe: { rule: 4, label: '反证：另一种颜色会切断连通' },
}

export function planLogicSolve(puzzle: Puzzle, initialState: GameState): YinLogicPlan {
  const start = asYinState(initialState)
  const w = start.width
  const h = start.height
  const n = w * h
  const grid = Int8Array.from(start.cells)
  const displayed = start.cells.slice()
  const frames: PlaybackFrame[] = []
  let probeTrials = 0
  let probeHits = 0
  const ruleFrames: Record<string, number> = {}

  let lastKind = ''
  let streak = 0
  let contradiction = false

  const emit = (index: number, to: number, kind: RuleKind | 'probe'): void => {
    const from = displayed[index] ?? EMPTY
    if (from === to) return
    displayed[index] = to
    if (kind === lastKind) streak++
    else {
      lastKind = kind
      streak = 1
    }
    const info = RULE_INFO[kind]
    frames.push({
      rule: info.rule,
      label: info.label,
      move: { index, from, to },
      streak,
    })
    ruleFrames[kind] = (ruleFrames[kind] ?? 0) + 1
  }

  const onSet = (index: number, value: number, kind: RuleKind): void => {
    emit(index, value, kind)
  }

  const finish = (): YinLogicPlan => {
    let remaining = 0
    for (let i = 0; i < n; i++) if (grid[i] === EMPTY) remaining++
    const finalState: YinState = {
      puzzleId: start.puzzleId,
      width: w,
      height: h,
      cells: Array.from(grid),
      givens: start.givens.slice(),
    }
    return {
      puzzleId: puzzle.id,
      frames: contradiction ? [] : frames,
      finalState: contradiction ? null : finalState,
      ruleSteps: contradiction ? 0 : frames.length,
      saturated: true,
      probeTrials,
      probeHits,
      remaining,
      ruleFrames: {
        probe: ruleFrames.probe ?? 0,
        block: ruleFrames.block ?? 0,
        connect: ruleFrames.connect ?? 0,
        cut: ruleFrames.cut ?? 0,
      },
    }
  }

  if (!propagate(grid, w, h, onSet)) {
    contradiction = true
    return finish()
  }

  for (let round = 0; round < n * 2; round++) {
    let unknown = -1
    for (let i = 0; i < n; i++) {
      if (grid[i] === EMPTY) {
        unknown = i
        break
      }
    }
    if (unknown < 0) break
    if (frames.length > 4000) break

    const forced: Array<{ index: number; value: number }> = []
    for (let i = 0; i < n; i++) {
      if (grid[i] !== EMPTY) continue

      let blackImpossible = false
      let whiteImpossible = false
      {
        probeTrials++
        const trial = Int8Array.from(grid)
        trial[i] = BLACK
        if (!propagate(trial, w, h)) blackImpossible = true
      }
      {
        probeTrials++
        const trial = Int8Array.from(grid)
        trial[i] = WHITE
        if (!propagate(trial, w, h)) whiteImpossible = true
      }

      if (blackImpossible && whiteImpossible) {
        contradiction = true
        return finish()
      }
      if (blackImpossible !== whiteImpossible) {
        probeHits++
        forced.push({ index: i, value: blackImpossible ? WHITE : BLACK })
      }
    }

    if (!forced.length) break

    for (const { index, value } of forced) {
      if (grid[index] === EMPTY) {
        grid[index] = value
        emit(index, value, 'probe')
      } else if (grid[index] !== value) {
        contradiction = true
        return finish()
      }
    }

    if (!propagate(grid, w, h, onSet)) {
      contradiction = true
      return finish()
    }
  }

  return finish()
}
