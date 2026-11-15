/**
 * 题库加载
 *
 * puzzles-data.ts 由 scripts/gen-config.mjs 生成：
 *   board    = 题面（0 空 / 1 黑 / 2 白）
 *   solution = 参考解（1 / 2）
 */

import { RAW_PUZZLES } from './puzzles-data'
import { asYinPuzzle, decodeCells, type YinPuzzle, type YinState } from './types'

export const builtinPuzzles: YinPuzzle[] = []
const solutions = new Map<string, number[]>()

for (const raw of RAW_PUZZLES) {
  const size = raw.width * raw.height
  const givens = decodeCells(raw.board, size)
  if (!givens) {
    console.warn(`[阴阳] 题面解码失败：${raw.id}`)
    continue
  }
  const puzzle: YinPuzzle = {
    id: raw.id,
    name: raw.name,
    width: raw.width,
    height: raw.height,
    difficulty: raw.difficulty,
    givens,
  }
  builtinPuzzles.push(puzzle)
  if (raw.solution) {
    const solution = decodeCells(raw.solution, size)
    if (solution) {
      puzzle.solution = solution
      solutions.set(raw.id, solution)
    }
  }
}

export function getReferenceSolution(id: string): YinState | null {
  const solution = solutions.get(id)
  if (!solution) return null
  const puzzle = builtinPuzzles.find((p) => p.id === id)
  if (!puzzle) return null
  return {
    puzzleId: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    cells: solution.slice(),
    givens: puzzle.givens.slice(),
  }
}

export function puzzleById(id: string): YinPuzzle | undefined {
  return builtinPuzzles.find((p) => p.id === id)
}

/** 便于审计脚本/调试：取题面与参考解 */
export function referenceFor(puzzle: YinPuzzle): number[] | null {
  return asYinPuzzle(puzzle).solution ?? solutions.get(puzzle.id) ?? null
}
