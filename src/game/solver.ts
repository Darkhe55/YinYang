/**
 * 阴阳 —— 回溯求解器
 *
 * 先尝试纯规则（含反证）求解；推不动时再用带回溯的搜索。
 * 主要用于自定义题板的「显示解 / 求解」。
 */

import type { Puzzle, SolveResult } from '../core/types'
import { isValidSolution, propagate, solveByRules } from './rules'
import { asYinPuzzle, BLACK, EMPTY, WHITE, type YinState } from './types'

export function solvePuzzle(puzzle: Puzzle, maxNodes = 1_500_000): SolveResult {
  const p = asYinPuzzle(puzzle)
  const w = p.width
  const h = p.height
  const size = w * h
  const givens = new Array<number>(size).fill(EMPTY)
  for (let i = 0; i < size; i++) {
    const v = p.givens?.[i] ?? EMPTY
    givens[i] = v === 1 || v === 2 ? v : EMPTY
  }

  const ruleResult = solveByRules(givens, w, h, true)
  if (ruleResult.ok && ruleResult.solution) {
    return { solved: true, solution: makeState(p.id, w, h, ruleResult.solution, givens), nodes: 0, timedOut: false }
  }
  if (ruleResult.contradiction) {
    return { solved: false, solution: null, nodes: 0, timedOut: false }
  }

  const grid = Int8Array.from(givens)
  let nodes = 0
  let timedOut = false

  const dfs = (): number[] | null => {
    if (timedOut) return null
    nodes++
    if (nodes > maxNodes) {
      timedOut = true
      return null
    }

    if (!propagate(grid, w, h)) return null

    let unknown = -1
    for (let i = 0; i < size; i++) {
      if (grid[i] === EMPTY) {
        unknown = i
        break
      }
    }
    if (unknown < 0) {
      return isValidSolution(grid, w, h) ? Array.from(grid) : null
    }

    const backup = Int8Array.from(grid)
    for (const v of [BLACK, WHITE] as const) {
      grid[unknown] = v
      const solution = dfs()
      if (solution) return solution
      grid.set(backup)
      if (timedOut) return null
    }
    return null
  }

  const solution = dfs()
  return {
    solved: !!solution,
    solution: solution ? makeState(p.id, w, h, solution, givens) : null,
    nodes,
    timedOut,
  }
}

function makeState(
  puzzleId: string,
  width: number,
  height: number,
  cells: number[],
  givens: number[],
): YinState {
  return {
    puzzleId,
    width,
    height,
    cells: cells.slice(),
    givens: givens.slice(),
  }
}
