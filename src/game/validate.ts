/**
 * 阴阳 —— 实时校验
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'
import { componentsOf, hasEmptyNeighbor } from './rules'
import { asYinPuzzle, asYinState, BLACK, EMPTY, WHITE, type YinResult } from './types'

export function validate(state: GameState, puzzle: Puzzle): YinResult {
  const s = asYinState(state)
  const p = asYinPuzzle(puzzle)
  const w = s.width
  const h = s.height
  const size = w * h
  const cells = s.cells

  let empty = 0
  const changedSet = new Set<number>()
  for (let i = 0; i < size; i++) {
    if (cells[i] === EMPTY) empty++
    const expected = p.givens?.[i] ?? EMPTY
    if (expected !== EMPTY) {
      if ((s.givens?.[i] ?? EMPTY) !== expected || cells[i] !== expected) changedSet.add(i)
    }
  }

  let blockCount = 0
  const blockSet = new Set<number>()
  for (let y = 0; y + 1 < h; y++) {
    const row = y * w
    for (let x = 0; x + 1 < w; x++) {
      const a = row + x
      const b = a + 1
      const c = a + w
      const d = c + 1
      const v = cells[a]
      if (v !== EMPTY && v === cells[b] && v === cells[c] && v === cells[d]) {
        blockCount++
        blockSet.add(a)
        blockSet.add(b)
        blockSet.add(c)
        blockSet.add(d)
      }
    }
  }

  const blackComps = componentsOf(cells, w, h, BLACK)
  const whiteComps = componentsOf(cells, w, h, WHITE)
  const bad = new Set<number>(blockSet)
  for (const i of changedSet) bad.add(i)
  const trapped = new Set<number>()

  const markTrapped = (comps: number[][]) => {
    if (comps.length <= 1) return
    if (empty === 0) {
      // 已完成：所有非最大连通块都算错误
      let largest = 0
      for (let i = 1; i < comps.length; i++) {
        if (comps[i]!.length > comps[largest]!.length) largest = i
      }
      for (let i = 0; i < comps.length; i++) {
        if (i === largest) continue
        for (const idx of comps[i]!) {
          trapped.add(idx)
          bad.add(idx)
        }
      }
      return
    }
    // 未完成：只有四周再没有空格可延伸的连通块才是永久隔断
    for (const comp of comps) {
      if (comp.some((idx) => hasEmptyNeighbor(cells, w, h, idx))) continue
      for (const idx of comp) {
        trapped.add(idx)
        bad.add(idx)
      }
    }
  }

  markTrapped(blackComps)
  markTrapped(whiteComps)

  const complete = empty === 0
  const solved =
    complete &&
    blockCount === 0 &&
    blackComps.length === 1 &&
    whiteComps.length === 1 &&
    changedSet.size === 0

  return {
    solved,
    empty,
    blockCount,
    blockCells: Array.from(blockSet),
    blackParts: blackComps.length,
    whiteParts: whiteComps.length,
    badCells: Array.from(bad),
    trapped: Array.from(trapped),
    changedGivens: Array.from(changedSet),
    complete,
  }
}

export function statusBits(result: ValidationResult): string[] {
  const r = result as YinResult
  if (r.solved) return ['完成']

  const bits: string[] = []
  if (typeof r.empty === 'number' && r.empty > 0) bits.push(`还需填 ${r.empty} 格`)
  if (r.blockCount > 0) bits.push(`${r.blockCount} 处 2×2 同色`)
  if (r.complete) {
    if (r.blackParts > 1) bits.push(`黑棋 ${r.blackParts} 块未连通`)
    if (r.whiteParts > 1) bits.push(`白棋 ${r.whiteParts} 块未连通`)
  } else if (r.trapped.length > 0) {
    bits.push(`有 ${r.trapped.length} 格被永久隔断`)
  }
  if (r.changedGivens.length > 0) bits.push('题面给定格被改动')
  if (bits.length === 0) bits.push('继续填色')
  return bits
}
