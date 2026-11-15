/**
 * ════════════════════════════════════════════════════════════════════
 *  阴阳（Yin-Yang）—— 游戏适配器
 * ════════════════════════════════════════════════════════════════════
 *
 * 规则：
 *   1. 所有黑格上下左右连通成一片；
 *   2. 所有白格上下左右连通成一片；
 *   3. 任意 2×2 区域不能四格同色。
 *
 * 状态用 0/1/2：0 = 未填，1 = 黑，2 = 白。
 */

import { playDrop, playPluck } from '../core/audio'
import type {
  CustomSupport,
  GameAdapter,
  Move,
  Puzzle,
  SolveResult,
} from '../core/types'
import { planLogicSolve } from './logic'
import { builtinPuzzles, getReferenceSolution } from './puzzles'
import { hitTest, metricsFor, renderBoard } from './render'
import { solvePuzzle } from './solver'
import {
  applyMove,
  cloneState,
  createEmptyState,
  cycleValue,
  deserializeState,
  firstHintMove,
  invertMove,
  rightClickValue,
  serializeState,
  valueAt,
} from './state'
import { statusBits, validate } from './validate'
import {
  BLACK,
  decodeCells,
  EMPTY,
  encodeCells,
  WHITE,
  type YinPuzzle,
} from './types'

const meta = {
  title: '阴阳',
  tagline: '黑与白各自连通，且不出现 2×2 同色 —— 在太极盘上填出两仪',
  footerNote:
    '规则：所有黑格连通、所有白格连通；任意 2×2 区域都不能四格同色。淡色小圆点是题面给定格，不能修改。',
  storageKeyPrefix: 'yinyang',
  customIdPrefix: 'yinyang-custom-',
  customMinW: 4,
  customMinH: 4,
  customMaxW: 60,
  customMaxH: 60,
}

const VALUE_CYCLE: Array<number | null> = [null, BLACK, WHITE]

function readGivens(value: unknown, size: number): number[] | null {
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

const custom: CustomSupport = {
  valueCycle: VALUE_CYCLE,

  keyForDigit: (digit) => {
    if (digit === 0) return null
    if (digit === BLACK) return BLACK
    if (digit === WHITE) return WHITE
    return undefined
  },

  cellLabel: (v) => (v === BLACK ? '黑' : v === WHITE ? '白' : '空'),

  cellClass: (v) => (v === BLACK ? 'v-black' : v === WHITE ? 'v-white' : ''),

  hint: '点格子循环：空 → 黑 → 白；键盘 1 填黑、2 填白、0 清空。给定格在题面中不可修改。',

  toGrid: (p) => {
    const givens = (p as YinPuzzle).givens
    if (!Array.isArray(givens) || givens.length !== p.width * p.height) return null
    return {
      width: p.width,
      height: p.height,
      grid: givens.map((v) => (v === BLACK || v === WHITE ? v : null)),
    }
  },

  makePuzzle: (w, h, grid, existingId) => {
    const givens = grid.map((v) => (v === BLACK || v === WHITE ? v : EMPTY))
    return {
      id: existingId ?? `${meta.customIdPrefix}${w}x${h}-${Date.now()}`,
      name: `自定义 · ${w}×${h}`,
      width: w,
      height: h,
      difficulty: 'custom',
      givens,
    } satisfies YinPuzzle
  },

  encodePuzzle: (p) => ({
    givens: encodeCells((p as YinPuzzle).givens ?? []),
  }),

  decodePuzzle: (record) => {
    if (typeof record.id !== 'string') return null
    if (typeof record.width !== 'number' || typeof record.height !== 'number') return null
    const w = record.width
    const h = record.height
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null
    const givens = readGivens(record.givens, w * h)
    if (!givens) return null
    return {
      id: record.id,
      name: typeof record.name === 'string' ? record.name : `自定义 · ${w}×${h}`,
      width: w,
      height: h,
      difficulty: 'custom',
      givens,
    }
  },
}

function playForMove(move: Move, streak: number): void {
  if (move.from === EMPTY) {
    // 黑子略低、白子略高，落子像拨动琴弦
    playPluck(streak, move.to === BLACK ? 1.12 : 0.88)
  } else {
    playDrop(streak)
  }
}

export const adapter: GameAdapter = {
  meta,
  builtinPuzzles,
  getReferenceSolution,
  createEmptyState,
  cloneState,
  cycleValue,
  rightClickValue,
  applyMove,
  invertMove,
  valueAt,
  serializeState,
  deserializeState,
  validate,
  statusBits,
  metricsFor,
  renderBoard,
  hitTest,
  planLogicSolve,
  solvePuzzle: (puzzle: Puzzle, maxNodes?: number): SolveResult => solvePuzzle(puzzle, maxNodes),
  firstHintMove,
  custom,
  playForMove,
}
