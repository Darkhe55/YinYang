/**
 * 阴阳 —— 规则引擎
 *
 * 三条安全规则（全部是「必然结论」，可安全用于生成、提示与逻辑回放）：
 *   R1  2×2 区域不能四格同色：若已有三格同色，第四格必为反色。
 *   R2  黑/白必须各自连通：若某色的一块连通区被反色完全包围，
 *       而该色在别处还存在，则这块区域里的空格都不能填该色。
 *   R3  连通性割点：在「该色格 + 空格」组成的图里，若某个空格是割点，
 *       去掉它会让同一连通块里的该色格分成两块，那么这一格必须填该色
 *       （否则该色的两块永远连不起来）。对黑、白各做一遍。
 */

import { BLACK, EMPTY, WHITE } from './types.ts'

export type RuleKind = 'block' | 'connect' | 'cut'

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

    // —— R3：连通性割点 ——
    if (!cutPropagate(cells, w, h, onSet, () => (changed = true))) return false
  }

  return true
}

/**
 * R3：连通性割点。
 *
 * 对每种颜色构造图 G =「该色格 + 空格」。若空格 v 是 G 的割点，
 * 且去掉 v 后同一连通块里出现 ≥2 个「含有该色格」的分量，
 * 那么 v 必须填该色：最终该色格必须四连通，而所有可能路径都在 G 里，
 * 横跨这些分量的通道只有 v。
 *
 * Tarjan 线性判定：DFS 树里去掉 v 后，孩子 u 满足 low[u] >= tin[v] 才是独立分量；
 * 否则它会经回边和祖先一侧并在一起。
 */
function cutPropagate(
  cells: Int8Array | number[],
  w: number,
  h: number,
  onSet: SetCallback | undefined,
  markChanged: () => void,
): boolean {
  const n = w * h
  const tin = new Int32Array(n)
  const low = new Int32Array(n)
  const parentOf = new Int32Array(n)
  const subColor = new Int32Array(n)
  const sepChildCount = new Int32Array(n)
  const mergedColorSum = new Int32Array(n)
  const order: number[] = []
  let timer = 0

  for (const color of [BLACK, WHITE] as const) {
    tin.fill(-1)
    const forced: number[] = []
    const isNode = (i: number): boolean => cells[i] === color || cells[i] === EMPTY

    for (let root = 0; root < n; root++) {
      if (tin[root] >= 0 || !isNode(root)) continue
      tin[root] = low[root] = timer++
      parentOf[root] = -1
      subColor[root] = cells[root] === color ? 1 : 0
      sepChildCount[root] = 0
      mergedColorSum[root] = 0
      order.length = 0
      order.push(root)
      const stack: Array<{ v: number; child: number }> = [{ v: root, child: 0 }]

      while (stack.length) {
        const frame = stack[stack.length - 1]!
        const v = frame.v
        const x = v % w
        const y = (v / w) | 0
        const neighbors = [
          x > 0 ? v - 1 : -1,
          x + 1 < w ? v + 1 : -1,
          y > 0 ? v - w : -1,
          y + 1 < h ? v + w : -1,
        ]
        let descended = false
        for (; frame.child < 4; frame.child++) {
          const j = neighbors[frame.child]!
          if (j < 0 || !isNode(j)) continue
          if (tin[j] < 0) {
            tin[j] = low[j] = timer++
            parentOf[j] = v
            subColor[j] = cells[j] === color ? 1 : 0
            sepChildCount[j] = 0
            mergedColorSum[j] = 0
            order.push(j)
            stack.push({ v: j, child: 0 })
            descended = true
            break
          }
          if (j !== parentOf[v] && tin[j] < low[v]) low[v] = tin[j]
        }
        if (descended) continue

        stack.pop()
        const parent = parentOf[v]!
        if (parent >= 0) {
          if (low[v] < low[parent]) low[parent] = low[v]
          subColor[parent] = subColor[parent]! + subColor[v]!
          if (low[v] >= tin[parent]) {
            if (subColor[v]! > 0) sepChildCount[parent] = sepChildCount[parent]! + 1
          } else {
            mergedColorSum[parent] = mergedColorSum[parent]! + subColor[v]!
          }
        }
      }

      const totalColor = subColor[root]!
      for (const v of order) {
        if (cells[v] !== EMPTY) continue
        let branches = sepChildCount[v]!
        if (v !== root) {
          const restColor = totalColor - subColor[v]! + mergedColorSum[v]!
          if (restColor > 0) branches++
        }
        if (branches >= 2) forced.push(v)
      }
    }

    for (const v of forced) {
      if (cells[v] === EMPTY) {
        cells[v] = color
        onSet?.(v, color, 'cut')
        markChanged()
      } else if (cells[v] !== color) {
        return false
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

  return (
    componentsOf(cells, w, h, BLACK).length === 1 &&
    componentsOf(cells, w, h, WHITE).length === 1
  )
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
