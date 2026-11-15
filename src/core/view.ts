/**
 * 通用画布缩放 / 平移（viewBox 管理）
 */

import type { BoardMetrics } from './types'

export function clientToViewBox(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}

export class ViewController {
  private _zoom = 1
  private panX = 0
  private panY = 0
  private onZoom?: (label: string) => void

  constructor(private metrics: () => BoardMetrics, onZoom?: (label: string) => void) {
    this.onZoom = onZoom
  }

  get zoom(): number {
    return this._zoom
  }

  reset(): void {
    this._zoom = 1
    this.panX = 0
    this.panY = 0
  }

  baseVB(): { w: number; h: number } {
    const m = this.metrics()
    return { w: m.svgWidth, h: m.svgHeight }
  }

  apply(svg?: SVGSVGElement | null): void {
    if (!svg) {
      svg = document.querySelector<SVGSVGElement>('svg.board-svg')
    }
    if (!svg) return
    const { w, h } = this.baseVB()
    const vw = w / this._zoom
    const vh = h / this._zoom
    this.panX = Math.max(0, Math.min(this.panX, w - vw))
    this.panY = Math.max(0, Math.min(this.panY, h - vh))
    svg.setAttribute('viewBox', `${this.panX} ${this.panY} ${vw} ${vh}`)
    this.onZoom?.(`${Math.round(this._zoom * 100)}%`)
  }

  setZoom(next: number, anchor?: { x: number; y: number }): void {
    const { w, h } = this.baseVB()
    const oldZoom = this._zoom
    const z = Math.max(1, Math.min(5, next))
    if (anchor) {
      // 锚点（viewBox 坐标）在缩放后保持不动
      const u = (anchor.x - this.panX) / (w / oldZoom)
      const v = (anchor.y - this.panY) / (h / oldZoom)
      this._zoom = z
      this.panX = anchor.x - u * (w / this._zoom)
      this.panY = anchor.y - v * (h / this._zoom)
    } else {
      this._zoom = z
      // 以视口中心为锚
      const cx = this.panX + w / oldZoom / 2
      const cy = this.panY + h / oldZoom / 2
      this.panX = cx - w / this._zoom / 2
      this.panY = cy - h / this._zoom / 2
    }
    this.apply()
  }

  zoomIn(): void {
    this.setZoom(this._zoom * 1.25)
  }

  zoomOut(): void {
    this.setZoom(this._zoom / 1.25)
  }

  panBy(dx: number, dy: number, svg: SVGSVGElement, clientWidth: number, clientHeight: number): void {
    const { w, h } = this.baseVB()
    const scaleX = w / this._zoom / clientWidth
    const scaleY = h / this._zoom / clientHeight
    this.panX -= dx * scaleX
    this.panY -= dy * scaleY
    this.apply(svg)
  }
}