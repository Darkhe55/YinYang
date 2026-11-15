/**
 * 阴阳 —— SVG 渲染与命中
 */

import type { BoardMetrics, GameState, Puzzle, ValidationResult } from '../core/types'
import { asYinState, BLACK, EMPTY, WHITE, type YinResult } from './types'

export function metricsFor(puzzle: Puzzle): BoardMetrics {
  const cell = 48
  const pad = Math.round(cell * 0.42)
  return {
    cell,
    pad,
    width: puzzle.width,
    height: puzzle.height,
    svgWidth: pad * 2 + puzzle.width * cell,
    svgHeight: pad * 2 + puzzle.height * cell,
    k: 1,
  }
}

export function renderBoard(
  puzzle: Puzzle,
  state: GameState,
  result: ValidationResult,
  _colorGrid?: unknown,
): string {
  const m = metricsFor(puzzle)
  const s = asYinState(state)
  const r = result as YinResult
  const bad = new Set<number>(r.badCells ?? [])
  const gap = Math.max(1, m.cell * 0.035)
  const inner = m.cell - gap
  const radius = m.cell * 0.16
  const dotR = m.cell * 0.085

  const parts: string[] = []
  parts.push(
    `<rect class="yy-board-bg" x="${m.pad - 9}" y="${m.pad - 9}" width="${puzzle.width * m.cell + 18}" height="${puzzle.height * m.cell + 18}" rx="${m.cell * 0.22}" />`,
  )

  for (let i = 0; i < puzzle.width * puzzle.height; i++) {
    const x = m.pad + (i % puzzle.width) * m.cell + gap / 2
    const y = m.pad + Math.floor(i / puzzle.width) * m.cell + gap / 2
    const v = s.cells[i] ?? EMPTY
    const given = s.givens[i] ?? EMPTY

    let cls = 'yy-stone'
    if (v === BLACK) cls += ' black'
    else if (v === WHITE) cls += ' white'
    else cls += ' empty'
    if (given !== EMPTY) cls += ' given'

    let content = `<rect class="${cls}" data-index="${i}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${inner.toFixed(2)}" height="${inner.toFixed(2)}" rx="${radius.toFixed(2)}" />`

    if (given !== EMPTY && (v === BLACK || v === WHITE)) {
      const dotClass = v === BLACK ? 'on-black' : 'on-white'
      content += `<circle class="yy-given-dot ${dotClass}" cx="${(x + inner / 2).toFixed(2)}" cy="${(y + inner / 2).toFixed(2)}" r="${dotR.toFixed(2)}" />`
    }

    if (bad.has(i)) {
      content += `<rect class="yy-error" x="${(x + 1).toFixed(2)}" y="${(y + 1).toFixed(2)}" width="${(inner - 2).toFixed(2)}" height="${(inner - 2).toFixed(2)}" rx="${radius.toFixed(2)}" />`
    }

    parts.push(`<g data-index="${i}">${content}</g>`)
    parts.push(
      `<rect class="cell-hit" data-index="${i}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${inner.toFixed(2)}" height="${inner.toFixed(2)}" />`,
    )
  }

  return `<svg class="board-svg" viewBox="0 0 ${m.svgWidth} ${m.svgHeight}" width="${m.svgWidth}" height="${m.svgHeight}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}

export function hitTest(
  m: BoardMetrics,
  puzzle: Puzzle,
  x: number,
  y: number,
): { index: number } | null {
  const col = Math.floor((x - m.pad) / m.cell)
  const row = Math.floor((y - m.pad) / m.cell)
  if (col < 0 || row < 0 || col >= puzzle.width || row >= puzzle.height) return null
  return { index: row * puzzle.width + col }
}
