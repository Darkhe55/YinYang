/**
 * 通用落子特效（SVG，无框架）
 *
 * 三套效果：
 *   1. 弦振（落子、正元素是线段）：把线段换成 path，沿法向做阻尼正弦抖动 + 光晕
 *   2. 形变（落子、正元素是圆/矩形/多边形）：scale+rotate 轻微抖动 + 光晕
 *   3. 排除：弹跳 pop（scale 0.4→1.35→1）+ 三圈扩散涟漪
 *
 * 约定：落子元素必须带 data-index="${move.index}"。
 * 音效由 GameAdapter.playForMove 负责，这里只做视觉。
 */

import type { BoardMetrics, Move } from './types'

/** 一次完整弦振/涟漪的名义时长 */
export const FX_ANIM_MS = 720

const NS = 'http://www.w3.org/2000/svg'

/* ———————————————————— 弦振（线段） ———————————————————— */

function vibrateLine(line: SVGLineElement, streak: number): void {
  const x1 = Number(line.getAttribute('x1'))
  const y1 = Number(line.getAttribute('y1'))
  const x2 = Number(line.getAttribute('x2'))
  const y2 = Number(line.getAttribute('y2'))
  const cls = line.getAttribute('class') ?? ''
  const dataIndex = line.getAttribute('data-index')

  const path = document.createElementNS(NS, 'path')
  path.setAttribute('class', `${cls} fx-string`)
  if (dataIndex) path.setAttribute('data-index', dataIndex)
  path.setAttribute('fill', 'none')
  line.replaceWith(path)

  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  // 连拍越多振幅略收，避免叠得太乱
  const amp0 = Math.min(len * 0.22, 14) / Math.sqrt(streak)
  const duration = FX_ANIM_MS
  const t0 = performance.now()

  const frame = (now: number) => {
    const elapsed = now - t0
    const u = elapsed / duration
    if (u >= 1) {
      path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`)
      path.classList.remove('fx-string')
      return
    }
    const damp = Math.exp(-4.2 * u)
    const amp = amp0 * damp
    const phase = u * 7.5 * Math.PI * 2
    const N = 14
    let d = `M ${x1} ${y1}`
    for (let i = 1; i < N; i++) {
      const t = i / N
      const envelope = Math.sin(Math.PI * t)
      const off = amp * envelope * Math.sin(phase - t * 2.2 * Math.PI)
      d += ` L ${x1 + dx * t + nx * off} ${y1 + dy * t + ny * off}`
    }
    d += ` L ${x2} ${y2}`
    path.setAttribute('d', d)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

/* ———————————————————— 形变（非线段元素） ———————————————————— */

function wobble(el: SVGElement, streak: number): void {
  const amp = 0.06 / Math.sqrt(streak)
  const rot = 2.4 / Math.sqrt(streak)
  el.classList.add('fx-glow')
  const anim = el.animate(
    [
      { transform: 'scale(1) rotate(0deg)' },
      { transform: `scale(${1 + amp}) rotate(${rot}deg)` },
      { transform: `scale(${1 - amp * 0.5}) rotate(${-rot}deg)` },
      { transform: 'scale(1) rotate(0deg)' },
    ],
    { duration: FX_ANIM_MS, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
  )
  anim.onfinish = () => el.classList.remove('fx-glow')
  anim.oncancel = () => el.classList.remove('fx-glow')
}

/* ———————————————————— 涟漪 ———————————————————— */

function ripple(svg: SVGSVGElement, center: { x: number; y: number }, streak: number): void {
  for (let k = 0; k < 3; k++) {
    setTimeout(() => {
      const ring = document.createElementNS(NS, 'circle')
      ring.setAttribute('class', 'fx-ripple')
      ring.setAttribute('cx', String(center.x))
      ring.setAttribute('cy', String(center.y))
      ring.setAttribute('r', '4')
      svg.appendChild(ring)
      const anim = ring.animate(
        [
          { r: 4, opacity: 0.95, strokeWidth: 5 },
          { r: 28, opacity: 0.35, strokeWidth: 2 },
          { r: 48, opacity: 0, strokeWidth: 1 },
        ],
        {
          duration: 560 / Math.sqrt(streak),
          easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
          fill: 'forwards',
        },
      )
      anim.onfinish = () => ring.remove()
      anim.oncancel = () => ring.remove()
    }, k * (120 / streak))
  }
}

/* ———————————————————— 对外接口 ———————————————————— */

function elementCenter(svg: SVGSVGElement, el: SVGElement): { x: number; y: number } {
  try {
    const bb = (el as SVGGraphicsElement).getBBox?.()
    if (bb && (bb.width > 0 || bb.height > 0)) {
      return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }
    }
  } catch {
    /* 忽略 */
  }
  const vb = svg.viewBox.baseVal
  return { x: vb.width / 2, y: vb.height / 2 }
}

/** 通用默认特效：落子（from===0）→ 拨弦音 + 弦振/形变；排除 → pop + 涟漪 */
export function flashForMove(
  svg: SVGSVGElement,
  move: Move,
  streak: number,
  _m?: BoardMetrics,
): void {
  const selector = `[data-index="${move.index}"]`
  if (move.from === 0) {
    const el = svg.querySelector<SVGElement>(selector)
    if (!el) return
    if (el instanceof SVGLineElement) vibrateLine(el, streak)
    else wobble(el, streak)
    return
  }
  // 排除
  const el = svg.querySelector<SVGElement>(selector)
  if (el) {
    const group = el.closest('g')
    const target = group ?? el
    target.classList.add('fx-pop')
    setTimeout(() => target.classList.remove('fx-pop'), 650)
  }
  if (svg) {
    const center = el ? elementCenter(svg, el) : { x: 0, y: 0 }
    ripple(svg, center, streak)
  }
}