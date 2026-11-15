/**
 * 阴阳 —— 规则引擎
 *
 * 两条规则：
 *   R1  2×2 区域不能四格同色：若已有三格同色，第四格必为反色。
 *   R2  黑/白必须各自连通：若某色的一块连通区被反色完全包围，
 *       而该色在别处还存在，则这块区域里的空格都不能填该色。
 *
 * 这些规则都是「必然结论」，可安全用于唯一解生成、提示与逻辑回放。
 */

import { BLACK, EMPTY, WHITE } from './types'

export type RuleKind = 'block' | 'connect'

export type SetCallback = (index: number, value: number, rule: RuleKind) => void

const NB_DX = [1, -1, 0, 0]
const NB_DY = [0, 0, 1, -1]

/** 某色的连通块；返回每块的索引数组 */
export function componentsOf(
  cells: ArrayLike<number>,
  w: number,
  h: number,
  color: number,
): number[][] {
  const n = w * h
  const seen = new Uint8Array(n)
  const out: number[][] = []
  for (let start = 0; start < n; start++) {
    if (cells[start] !== color || seen[start]) continue
    const comp: number[] = []
    const stack = [start]
    seen[start] = 1
    while (stack.length) {
      const i = stack.pop()!
      comp.push(i)
      const x = i % w
      const y = (i / w) | 0
      for (let d = 0; d < 4; d++) {
        const nx = x + NB_DX[d]!
        const ny = y + NB_DY[d]!
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (!seen[j] && cells[j] === color) {
          seen[j] = 1
          stack.push(j)
        }
      }
    }
    out.push(comp)
  }
  return out
}

/** 该位置四周是否存在空格 */
export function hasEmptyNeighbor(
  cells: ArrayLike<number>,
  w: number,
  h: number,
  index: number,
): boolean {
  const x = index % w
  const y = (index / w) | 0
  for (let d = 0; d < 4; d++) {
    const nx = x + NB_DX[d]!
    const ny = y + NB_DY[d]!
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
    if (cells[ny * w + nx] === EMPTY) return true
  }
  return false
}

/**
 * 规则传播到不动点。
 * 返回 false 表示发现矛盾；onSet 会收到每一次确定性填色。
 */
export function propagate(
  cells: Int8Array | number[],
  w: number,
  h: number,
  onSet?: SetCallback,
): boolean {
  const n = w * h
  let changed = true

  while (changed) {
    changed = false

    // —— R1：2×2 三连 ——
    for (let y = 0; y + 1 < h; y++) {
      const row = y * w
      for (let x = 0; x + 1 < w; x++) {
        const a = row + x
        const b = a + 1
        const c = a + w
        const d = c + 1
        let black = 0
        let white = 0
        let unknown = -1
        if (cells[a] === BLACK) black++
        else if (cells[a] === WHITE) white++
        else unknown = a
        if (cells[b] === BLACK) black++
        else if (cells[b] === WHITE) white++
        else unknown = b
        if (cells[c] === BLACK) black++
        else if (cells[c] === WHITE) white++
        else unknown = c
        if (cells[d] === BLACK) black++
        else if (cells[d] === WHITE) white++
        else unknown = d

        if (black === 4 || white === 4) return false
        if (unknown >= 0) {
          if (black === 3) {
            cells[unknown] = WHITE
            onSet?.(unknown, WHITE, 'block')
            changed = true
          } else if (white === 3) {
            cells[unknown] = BLACK
            onSet?.(unknown, BLACK, 'block')
            changed = true
          }
        }
      }
    }

    // —— R2：连通性封闭区域 ——
    for (const color of [BLACK, WHITE] as const) {
      let exists = false
      for (let i = 0; i < n; i++) {
        if (cells[i] === color) {
          exists = true
          break
        }
      }
      if (!exists) continue

      const seen = new Uint8Array(n)
      let coloredRegions = 0
      const colorlessRegions: number[][] = []

      for (let start = 0; start < n; start++) {
        if (seen[start]) continue
        if (cells[start] !== color && cells[start] !== EMPTY) continue

        const region: number[] = []
        let hasColor = false
        const stack = [start]
        seen[start] = 1
        while (stack.length) {
          const i = stack.pop()!
          region.push(i)
          if (cells[i] === color) hasColor = true
          const x = i % w
          const y = (i / w) | 0
          for (let d = 0; d < 4; d++) {
            const nx = x + NB_DX[d]!
            const ny = y + NB_DY[d]!
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            const j = ny * w + nx
            if (seen[j]) continue
            if (cells[j] !== color && cells[j] !== EMPTY) continue
            seen[j] = 1
            stack.push(j)
          }
        }
        if (hasColor) coloredRegions++
        else colorlessRegions.push(region)
      }

      // 同一颜色的两块连通区被反色彻底隔开 → 永远无法连上
      if (coloredRegions > 1) return false

      if (coloredRegions === 1) {
        const opposite = color === BLACK ? WHITE : BLACK
        for (const region of colorlessRegions) {
          for (const i of region) {
            if (cells[i] === EMPTY) {
              cells[i] = opposite
              onSet?.(i, opposite, 'connect')
              changed = true
            }
          }
        }
      }
    }
  }

  return true
}

/** 完整盘面是否满足全部规则（不检查题面给定） */
export function isValidSolution(cells: ArrayLike<number>, w: number, h: number): boolean {
  const n = w * h
  let black = 0
  let white = 0
  for (let i = 0; i < n; i++) {
    if (cells[i] === BLACK) black++
    else if (cells[i] === WHITE) white++
    else return false
  }
  if (black === 0 || white === 0) return false

  for (let y = 0; y + 1 < h; y++) {
    const row = y * w
    for (let x = 0; x + 1 < w; x++) {
      const a = row + x
      const b = a + 1
      const c = a + w
      const d = c + 1
      if (cells[a] === cells[b] && cells[a] === cells[c] && cells[a] === cells[d]) return false
    }
  }

  return componentsOf(cells, w, h, BLACK).length === 1 &&
    componentsOf(cells, w, h, WHITE).length === 1
}

export interface RuleSolveResult {
  ok: boolean
  /** 完整解（ok 时一定非空） */
  solution: number[] | null
  /** 当前规则是否推到了矛盾 */
  contradiction: boolean
  /** 是否用到了反证探测 */
  usedProbing: boolean
}

/**
 * 只用规则（可选反证探测）尝试解完。
 * 只要能推满，解就是唯一的：每一步都由必然规则得出。
 */
export function solveByRules(
  given: ArrayLike<number>,
  w: number,
  h: number,
  probing = true,
): RuleSolveResult {
  const grid = Int8Array.from(given as ArrayLike<number>)
  let usedProbing = false

  for (;;) {
    if (!propagate(grid, w, h)) {
      return { ok: false, solution: null, contradiction: true, usedProbing }
    }

    let unknown = -1
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === EMPTY) {
        unknown = i
        break
      }
    }
    if (unknown < 0) {
      const solution = Array.from(grid)
      const ok = isValidSolution(solution, w, h)
      return {
        ok,
        solution: ok ? solution : null,
        contradiction: false,
        usedProbing,
      }
    }
    if (!probing) {
      return { ok: false, solution: null, contradiction: false, usedProbing }
    }

    usedProbing = true
    const forced: Array<{ index: number; value: number }> = []

    for (let i = 0; i < grid.length; i++) {
      if (grid[i] !== EMPTY) continue
      let blackImpossible = false
      let whiteImpossible = false
      {
        const trial = Int8Array.from(grid)
        trial[i] = BLACK
        if (!propagate(trial, w, h)) blackImpossible = true
      }
      {
        const trial = Int8Array.from(grid)
        trial[i] = WHITE
        if (!propagate(trial, w, h)) whiteImpossible = true
      }
      if (blackImpossible && whiteImpossible) {
        return { ok: false, solution: null, contradiction: true, usedProbing }
      }
      if (blackImpossible !== whiteImpossible) {
        forced.push({ index: i, value: blackImpossible ? WHITE : BLACK })
      }
    }

    if (!forced.length) {
      return { ok: false, solution: null, contradiction: false, usedProbing }
    }

    for (const { index, value } of forced) {
      if (grid[index] === EMPTY) grid[index] = value
    }
    if (!propagate(grid, w, h)) {
      return { ok: false, solution: null, contradiction: true, usedProbing }
    }
  }
}
