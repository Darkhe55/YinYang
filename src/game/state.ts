/**
 * 阴阳 —— 棋盘状态
 */

import type { GameState, HitTarget, Move, Puzzle } from '../core/types.ts'
import { asYinPuzzle, asYinState, decodeCells, encodeCells, EMPTY, WHITE, type YinState } from './types.ts'

export function createEmptyState(puzzle: Puzzle): YinState {
  const p = asYinPuzzle(puzzle)
  const size = p.width * p.height
  const givens = new Array<number>(size).fill(EMPTY)
  for (let i = 0; i < size; i++) {
    const v = p.givens?.[i] ?? EMPTY
    givens[i] = v === 1 || v === 2 ? v : EMPTY
  }
  return {
    puzzleId: p.id,
    width: p.width,
    height: p.height,
    cells: givens.slice(),
    givens,
  }
}

export function cloneState(state: GameState): YinState {
  const s = asYinState(state)
  return {
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    cells: s.cells.slice(),
    givens: s.givens.slice(),
  }
}

export function cycleValue(state: GameState, target: HitTarget): number {
  const s = asYinState(state)
  const given = s.givens[target.index] ?? EMPTY
  if (given !== EMPTY) return given
  const v = s.cells[target.index] ?? EMPTY
  return (v + 1) % 3
}

export function rightClickValue(state: GameState, target: HitTarget): number {
  const s = asYinState(state)
  const given = s.givens[target.index] ?? EMPTY
  if (given !== EMPTY) return given
  return s.cells[target.index] === WHITE ? EMPTY : WHITE
}

export function applyMove(state: GameState, move: Move): void {
  const s = asYinState(state)
  if (move.index < 0 || move.index >= s.cells.length) return
  if ((s.givens[move.index] ?? EMPTY) !== EMPTY) return
  s.cells[move.index] = move.to === 1 || move.to === 2 ? move.to : EMPTY
}

export function invertMove(move: Move): Move {
  return { index: move.index, from: move.to, to: move.from }
}

export function valueAt(state: GameState, index: number): number {
  return asYinState(state).cells[index] ?? EMPTY
}

export function serializeState(state: GameState): Record<string, unknown> {
  const s = asYinState(state)
  return {
    version: 1,
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    cells: encodeCells(s.cells),
    givens: encodeCells(s.givens),
  }
}

function readCells(value: unknown, size: number): number[] | null {
  if (typeof value === 'string') return decodeCells(value, size)
  if (Array.isArray(value)) {
    if (value.length !== size) return null
    const out: number[] = []
    for (const v of value) {
      const n = Number(v)
      if (n !== 0 && n !== 1 && n !== 2) return null
      out.push(n)
    }
    return out
  }
  return null
}

export function deserializeState(data: Record<string, unknown>): YinState | null {
  if (typeof data.puzzleId !== 'string') return null
  if (typeof data.width !== 'number' || typeof data.height !== 'number') return null
  const w = data.width
  const h = data.height
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null
  const size = w * h

  const cells = readCells(data.cells, size)
  if (!cells) return null
  const givens = readCells(data.givens, size) ?? new Array<number>(size).fill(EMPTY)

  // 给定格永远以题面锁定值为准，避免旧存档把给定格覆盖掉
  for (let i = 0; i < size; i++) {
    if (givens[i] !== EMPTY) cells[i] = givens[i]!
  }

  return { puzzleId: data.puzzleId, width: w, height: h, cells, givens }
}

/** 提示：找第一个空格（或填错的格），返回把它改成参考解的 move */
export function firstHintMove(state: GameState, solution: GameState): Move | null {
  const s = asYinState(state)
  const sol = asYinState(solution)
  const size = Math.min(s.cells.length, sol.cells.length)
  for (let i = 0; i < size; i++) {
    if (s.givens[i] !== EMPTY) continue
    if (s.cells[i] === EMPTY && sol.cells[i] !== EMPTY) {
      return { index: i, from: EMPTY, to: sol.cells[i]! }
    }
  }
  for (let i = 0; i < size; i++) {
    if (s.givens[i] !== EMPTY) continue
    if (s.cells[i] !== sol.cells[i]) {
      return { index: i, from: s.cells[i]!, to: sol.cells[i]! }
    }
  }
  return null
}
