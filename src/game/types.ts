/**
 * 阴阳（Yin-Yang）—— 游戏专用类型
 *
 * 约定与模板核心一致：
 *   0 = 未填 / 未定
 *   1 = 黑
 *   2 = 白
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'

export const EMPTY = 0
export const BLACK = 1
export const WHITE = 2

export type CellValue = 0 | 1 | 2

/** 题面：在模板 Puzzle 上增加 givens（每格 0/1/2） */
export interface YinPuzzle extends Puzzle {
  /** 题面给定格：0 = 空，1 = 黑，2 = 白 */
  givens: number[]
  /** 参考解（仅内置题携带；自定义题运行时求解） */
  solution?: number[]
}

/** 棋盘状态：cells 是当前盘面，givens 是锁定的题面格 */
export interface YinState extends GameState {
  cells: number[]
  givens: number[]
}

/** 校验结果 */
export interface YinResult extends ValidationResult {
  /** 仍为空的格数 */
  empty: number
  /** 2×2 同色块数量 */
  blockCount: number
  /** 2×2 同色块涉及的所有格 */
  blockCells: number[]
  /** 黑色连通块数量（完整盘面应等于 1） */
  blackParts: number
  /** 白色连通块数量（完整盘面应等于 1） */
  whiteParts: number
  /** 需要高亮的错误格（2×2、被永久隔断、给定格被改） */
  badCells: number[]
  /** 被永久隔断的格（四周没有可延伸的空格） */
  trapped: number[]
  /** 与题面给定不一致的格 */
  changedGivens: number[]
  /** 盘面是否已填满 */
  complete: boolean
}

export function asYinPuzzle(p: Puzzle): YinPuzzle {
  return p as YinPuzzle
}

export function asYinState(s: GameState): YinState {
  return s as YinState
}

/** 编码：0/1/2 数字串 */
export function encodeCells(cells: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < cells.length; i++) out += String(cells[i] | 0)
  return out
}

/** 解码：接受 0/1/2 数字串；. 或 0 表示空，B/#/b 表示黑，W/w 表示白 */
export function decodeCells(text: string, expected: number): number[] | null {
  if (typeof text !== 'string' || text.length !== expected) return null
  const out = new Array<number>(expected)
  for (let i = 0; i < expected; i++) {
    const ch = text[i]!
    if (ch === '0' || ch === '.') out[i] = EMPTY
    else if (ch === '1' || ch === 'B' || ch === 'b' || ch === '#') out[i] = BLACK
    else if (ch === '2' || ch === 'W' || ch === 'w' || ch === 'o' || ch === 'O') out[i] = WHITE
    else return null
  }
  return out
}
