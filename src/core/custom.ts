/**
 * 通用自定义题板编辑器
 *
 * 职责：
 * - 尺寸输入（宽/高）+ 生成网格
 * - 网格编辑：点击循环 adapter.custom.valueCycle；键盘数字按 keyForDigit 直填
 * - 「载入题板」：构造 Puzzle → 交给 app 载入会话并入库
 * - 「保存到题库」：构造 Puzzle → 入库
 * - 「求解」/「逻辑解题」：委托 app 执行
 *
 * 键盘录入约定（所有游戏一致）：
 *   数字键 0-9 由 adapter.custom.keyForDigit 决定含义；
 *   . / Backspace / Delete 清空；方向键移动；Enter/Tab 下一格；
 *   Home/End 行首/行尾；Esc 关闭。
 */

import type { GameAdapter, Puzzle } from './types'

export interface CustomHost {
  setStatus(text: string, tone?: 'ok' | 'bad' | 'solving' | ''): void
  message(text: string, tone?: string): void
  loadPuzzle(p: Puzzle): void
  savePuzzle(p: Puzzle): void
  solveCurrent(): void
  runLogic(): void
}

export class CustomEditor {
  private w = 5
  private h = 5
  private grid: Array<number | null> = []
  private cursor = 0
  private adapter: GameAdapter
  private editingId: string | null = null
  private editingName: string | null = null

  constructor(adapter: GameAdapter, private host: CustomHost) {
    this.adapter = adapter
  }

  isOpen(): boolean {
    const panel = document.getElementById('custom-editor')
    return !!panel && !panel.hidden
  }

  close(): void {
    const panel = document.getElementById('custom-editor')
    if (panel) panel.hidden = true
  }

  // —— 内部工具 ——

  private setCell(i: number, value: number | null): void {
    if (i < 0 || i >= this.grid.length) return
    this.grid[i] = value
    const btn = document.querySelector<HTMLButtonElement>(`.custom-cell[data-i="${i}"]`)
    if (!btn) return
    btn.textContent = this.adapter.custom.cellLabel(value)
    btn.classList.toggle('empty', value === null)
    const cls = this.adapter.custom.cellClass?.(value) ?? ''
    btn.className = `custom-cell${cls ? ` ${cls}` : ''}${value === null ? ' empty' : ''}`
  }

  private selectCell(i: number): void {
    const max = this.w * this.h
    if (max <= 0) return
    this.cursor = Math.max(0, Math.min(max - 1, i))
    document.querySelectorAll('.custom-cell').forEach((el) => {
      const idx = Number((el as HTMLElement).dataset.i)
      el.classList.toggle('selected', idx === this.cursor)
    })
    const btn = document.querySelector<HTMLButtonElement>(`.custom-cell[data-i="${this.cursor}"]`)
    btn?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  private moveCursor(dx: number, dy: number): void {
    const w = this.w
    const row = Math.floor(this.cursor / w)
    const col = this.cursor % w
    this.selectCell((row + dy) * w + (col + dx))
  }

  private readSize(): { w: number; h: number } {
    const wEl = document.getElementById('custom-w') as HTMLInputElement | null
    const hEl = document.getElementById('custom-h') as HTMLInputElement | null
    const meta = this.adapter.meta
    const w = Math.max(meta.customMinW, Math.min(meta.customMaxW, Number(wEl?.value) || 5))
    const h = Math.max(meta.customMinH, Math.min(meta.customMaxH, Number(hEl?.value) || 5))
    if (wEl) wEl.value = String(w)
    if (hEl) hEl.value = String(h)
    return { w, h }
  }

  // —— 渲染 ——

  renderGrid(): void {
    const grid = document.getElementById('custom-grid')
    if (!grid) return
    const { w, h } = this.readSize()
    this.w = w
    this.h = h
    if (this.grid.length !== w * h) {
      this.grid = new Array<number | null>(w * h).fill(null)
    }
    grid.style.gridTemplateColumns = `repeat(${w}, 36px)`
    grid.innerHTML = this.grid
      .map((v, i) => {
        const label = this.adapter.custom.cellLabel(v)
        const cls = this.adapter.custom.cellClass?.(v) ?? ''
        const sel = i === this.cursor ? ' selected' : ''
        return `<button type="button" class="custom-cell${cls ? ` ${cls}` : ''}${v === null ? ' empty' : ''}${sel}" data-i="${i}">${label}</button>`
      })
      .join('')
    grid.querySelectorAll<HTMLButtonElement>('.custom-cell').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i)
        this.selectCell(i)
        // 点击仍保留：空 → 值序列下一个
        const cur = this.grid[i] ?? null
        const cycle = this.adapter.custom.valueCycle
        const pos = cycle.indexOf(cur)
        const next = cycle[(pos + 1) % cycle.length] ?? null
        this.setCell(i, next)
      })
      btn.addEventListener('focus', () => {
        this.selectCell(Number(btn.dataset.i))
      })
    })
    grid.tabIndex = 0
  }

  open(): void {
    const panel = document.getElementById('custom-editor')
    if (!panel) return
    panel.hidden = false
    const wEl = document.getElementById('custom-w') as HTMLInputElement | null
    const hEl = document.getElementById('custom-h') as HTMLInputElement | null
    if (wEl) wEl.value = String(this.w)
    if (hEl) hEl.value = String(this.h)
    if (this.cursor >= this.w * this.h) this.cursor = 0
    this.renderGrid()
    const editing = this.editingId ? `正在编辑「${this.editingName ?? this.editingId}」。` : ''
    this.host.message(`${editing}键盘：方向键移动 · ${this.adapter.custom.hint}`)
    document.getElementById('custom-grid')?.focus()
  }

  /** 把已保存的自定义题读回编辑器；保存时覆盖原 id */
  edit(p: Puzzle): void {
    const toGrid = this.adapter.custom.toGrid
    if (!toGrid) {
      this.host.message('本游戏不支持编辑自定义题。', 'bad')
      return
    }
    const restored = toGrid(p)
    if (!restored) {
      this.host.message('无法还原这道题的题面。', 'bad')
      return
    }
    const meta = this.adapter.meta
    if (restored.width > meta.customMaxW || restored.height > meta.customMaxH) {
      this.host.message(`题面超过最大尺寸 ${meta.customMaxW}×${meta.customMaxH}。`, 'bad')
      return
    }
    this.w = restored.width
    this.h = restored.height
    this.grid = restored.grid.slice()
    this.cursor = 0
    this.editingId = p.id
    this.editingName = p.name
    const panel = document.getElementById('custom-editor')
    if (panel) panel.hidden = false
    const wEl = document.getElementById('custom-w') as HTMLInputElement | null
    const hEl = document.getElementById('custom-h') as HTMLInputElement | null
    if (wEl) wEl.value = String(this.w)
    if (hEl) hEl.value = String(this.h)
    this.renderGrid()
    this.host.message(`正在编辑「${p.name}」。保存会覆盖原题。`, 'ok')
    panel?.scrollIntoView({ block: 'nearest' })
    document.getElementById('custom-grid')?.focus()
  }

  /** 删除题库条目时清掉编辑态 */
  clearEditing(id?: string): void {
    if (id && this.editingId !== id) return
    this.editingId = null
    this.editingName = null
  }

  regen(): void {
    this.editingId = null
    this.editingName = null
    this.grid = new Array<number | null>(this.w * this.h).fill(null)
    this.cursor = 0
    this.renderGrid()
    this.host.message(`已生成 ${this.w}×${this.h} 网格。${this.adapter.custom.hint}`)
    document.getElementById('custom-grid')?.focus()
  }

  // —— 键盘 ——

  /** 返回 true 表示已消费该按键（编辑器打开时优先处理） */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.isOpen()) return false
    const k = e.key

    if (k >= '0' && k <= '9') {
      const value = this.adapter.custom.keyForDigit(Number(k))
      if (value !== undefined) {
        e.preventDefault()
        this.setCell(this.cursor, value)
        this.moveCursor(1, 0)
        return true
      }
    }
    if (k === '.' || k === 'Backspace' || k === 'Delete' || k === ' ') {
      e.preventDefault()
      this.setCell(this.cursor, null)
      if (k === 'Backspace') this.moveCursor(-1, 0)
      else this.moveCursor(1, 0)
      return true
    }
    if (k === 'ArrowLeft') {
      e.preventDefault()
      this.moveCursor(-1, 0)
      return true
    }
    if (k === 'ArrowRight') {
      e.preventDefault()
      this.moveCursor(1, 0)
      return true
    }
    if (k === 'ArrowUp') {
      e.preventDefault()
      this.moveCursor(0, -1)
      return true
    }
    if (k === 'ArrowDown') {
      e.preventDefault()
      this.moveCursor(0, 1)
      return true
    }
    if (k === 'Enter' || k === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) this.moveCursor(-1, 0)
      else this.moveCursor(1, 0)
      return true
    }
    if (k === 'Home') {
      e.preventDefault()
      this.selectCell(Math.floor(this.cursor / this.w) * this.w)
      return true
    }
    if (k === 'End') {
      e.preventDefault()
      this.selectCell(Math.floor(this.cursor / this.w) * this.w + this.w - 1)
      return true
    }
    if (k === 'Escape') {
      e.preventDefault()
      this.close()
      return true
    }
    return false
  }

  // —— 动作 ——

  private makePuzzle(existingId?: string): Puzzle {
    return this.adapter.custom.makePuzzle(this.w, this.h, this.grid.slice(), existingId)
  }

  load(): void {
    const { w, h } = this.readSize()
    this.w = w
    this.h = h
    if (this.grid.length !== w * h) {
      this.grid = new Array<number | null>(w * h).fill(null)
      this.renderGrid()
      this.host.message('网格已重置，请先填好内容。', 'bad')
      return
    }
    // 用「宽x高」做稳定 id，重复载入同尺寸只覆盖同一条（进度按 id 存）；
    // 编辑已有题目时沿用原 id，避免另存一条
    const stableId =
      this.editingId ?? `${this.adapter.meta.customIdPrefix}${w}x${h}`
    const puzzle = this.makePuzzle(stableId)
    if (this.editingName) puzzle.name = this.editingName
    this.editingId = puzzle.id
    this.editingName = puzzle.name
    this.host.loadPuzzle(puzzle)
  }

  save(): void {
    const { w, h } = this.readSize()
    if (this.grid.length !== w * h) {
      this.host.message('请先生成网格并填好内容。', 'bad')
      return
    }
    const isEditing = !!this.editingId
    const stamp = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const name = `自定义 · ${w}×${h} · ${pad(stamp.getMonth()+1)}${pad(stamp.getDate())}${pad(stamp.getHours())}${pad(stamp.getMinutes())}`
    const puzzle = this.makePuzzle(this.editingId ?? undefined)
    puzzle.name = this.editingName ?? name
    this.host.savePuzzle(puzzle)
    this.editingId = puzzle.id
    this.editingName = puzzle.name
    this.host.message(`已${isEditing ? '更新' : '保存'}到题库：「${puzzle.name}」，下次启动仍可选用。`, 'ok')
  }

  solve(): void {
    this.host.solveCurrent()
  }

  logic(): void {
    this.close()
    this.host.runLogic()
  }
}