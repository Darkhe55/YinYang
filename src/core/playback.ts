/**
 * 通用逻辑解题回放器
 *
 * 相位 1：一次性调用 GameAdapter.planLogicSolve 推完整份计划（不落子）；
 * 相位 2：逐帧回放 —— 每帧 pushMove → 重绘 → 特效/音效 → 状态栏，可暂停/停止。
 *
 * 回放计划算完后，状态栏下方会出现可拖动进度条、步数跳转与暂停/继续按钮；
 * 跳转时按基准快照重放到目标帧，暂停后可继续，结束后可重播。
 */

import type { GameAdapter, GameState, Move, Puzzle, PlaybackFrame } from './types'

export interface PlaybackHooks {
  /** 更新状态栏 */
  setStatus(text: string, tone?: 'ok' | 'bad' | 'solving' | ''): void
  /** 把一帧落子写入会话（含撤销栈 + 存档） */
  pushMove(move: Move): void
  /** 重绘棋盘 */
  render(): void
  /** 播放落子特效 + 音效 */
  flash(move: Move, streak: number): void
  /** 当前会话是否仍是该题 */
  samePuzzle(id: string): boolean
  /** 当前会话题面 */
  currentPuzzle(): Puzzle | null
  /** 屏蔽/恢复按钮与盘面（logic 按钮除外） */
  setButtonsDisabled(disabled: boolean): void
  /** 从基准快照重放前 n 帧（进度条跳转/重播用） */
  restoreState(base: GameState, moves: Move[]): void
  /** 回放状态变化（用于同步“逻辑解题/停止回放”按钮） */
  onStateChange?(): void
  /** 进入新帧 / 回放结束（null）时通知，用于在棋盘上画出本步的候选约束 */
  onFrame?(frame: PlaybackFrame | null): void
  /** 播放结束后需要额外做的事（如收尾状态栏） */
  onFinished?(saturated: boolean, frames: number): void
}

const LOGIC_ANIM_MS = 720
/** 整段回放的期望时长上限：帧数多（大棋盘）时自动缩短单帧间隔 */
const LOGIC_TOTAL_MS = 24_000

export class LogicPlayer {
  private token = 0
  private _playing = false
  private _paused = false
  private frame = 0
  private total = 0
  private frames: PlaybackFrame[] = []
  private base: GameState | null = null
  private puzzleId = ''
  private seekTarget: number | null = null
  private syncingPanel = false
  private draggingSlider = false
  private saturated = false

  private panel: HTMLDivElement | null = null
  private range: HTMLInputElement | null = null
  private stepInput: HTMLInputElement | null = null
  private totalLabel: HTMLElement | null = null
  private pauseBtn: HTMLButtonElement | null = null

  constructor(private adapter: GameAdapter, private hooks: PlaybackHooks) {}

  get playing(): boolean {
    return this._playing
  }

  get paused(): boolean {
    return this._paused
  }

  progress(): string {
    return `${this.frame}/${this.total}`
  }

  private sleep(ms: number, token: number): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(token === this.token), ms)
    })
  }

  /** 可暂停的等待：暂停期间不计时 */
  private sleepPausable(ms: number, token: number): Promise<boolean> {
    return new Promise((resolve) => {
      let left = ms
      const step = () => {
        if (token !== this.token) return resolve(false)
        if (this._paused) {
          setTimeout(step, 60)
          return
        }
        left -= 60
        if (left <= 0) return resolve(true)
        setTimeout(step, 60)
      }
      setTimeout(step, 60)
    })
  }

  /* ———————————————————— 进度面板 ———————————————————— */

  private ensurePanel(): void {
    if (this.panel) return
    const status = document.getElementById('status')
    if (!status) return

    if (!document.getElementById('logic-progress-style')) {
      const style = document.createElement('style')
      style.id = 'logic-progress-style'
      style.textContent = `
.logic-progress {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f7f4ec;
  border: 1px solid rgba(0,0,0,.12);
  display: grid;
  gap: 8px;
  font-size: 12px;
}
.logic-progress[hidden] { display: none; }
.logic-progress input[type="range"] {
  width: 100%;
  accent-color: #b86b3d;
  cursor: pointer;
}
.logic-progress .logic-jump {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.logic-progress .logic-jump input[type="number"] {
  width: 72px;
  padding: 4px 6px;
  border: 1px solid rgba(0,0,0,.16);
  border-radius: 7px;
  background: #fff;
  color: inherit;
}
.logic-progress .btn {
  padding: 5px 10px;
}
`
      document.head.appendChild(style)
    }

    const panel = document.createElement('div')
    panel.className = 'logic-progress'
    panel.hidden = true
    panel.innerHTML = `
      <input type="range" min="0" max="0" step="1" value="0" aria-label="逻辑回放进度" />
      <div class="logic-jump">
        <span>跳到</span>
        <input type="number" min="0" max="0" step="1" value="0" aria-label="跳转步数" />
        <span>/ <b class="logic-total">0</b> 步</span>
        <button class="btn logic-jump-btn" type="button">跳转</button>
        <button class="btn logic-pause-btn" type="button">暂停</button>
      </div>
    `
    status.insertAdjacentElement('afterend', panel)
    this.panel = panel
    this.range = panel.querySelector<HTMLInputElement>('input[type="range"]')
    const number = panel.querySelector<HTMLInputElement>('input[type="number"]')
    this.stepInput = number
    this.totalLabel = panel.querySelector('.logic-total')
    this.pauseBtn = panel.querySelector('.logic-pause-btn')
    const jumpBtn = panel.querySelector('.logic-jump-btn') as HTMLButtonElement | null

    this.range?.addEventListener('pointerdown', () => {
      this.draggingSlider = true
    })
    window.addEventListener('pointerup', () => {
      this.draggingSlider = false
    })
    this.range?.addEventListener('input', () => {
      // 只响应用户拖动；程序化同步 value 时部分浏览器也会派发 input。
      if (!this.draggingSlider) return
      this.seek(Number(this.range!.value))
    })
    this.range?.addEventListener('change', () => {
      if (!this.draggingSlider) this.seek(Number(this.range!.value))
    })
    number?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.seek(Number(number.value))
      }
    })
    jumpBtn?.addEventListener('click', () => this.seek(Number(number?.value ?? 0)))
    this.pauseBtn?.addEventListener('click', () => this.togglePause())
  }

  private updatePanel(): void {
    if (!this.panel) return
    const hasFrames = this.frames.length > 0 && this.base !== null
    this.panel.hidden = !hasFrames
    if (!hasFrames) return
    this.syncingPanel = true
    if (this.range) {
      this.range.max = String(this.total)
      this.range.value = String(Math.max(0, Math.min(this.total, this.frame)))
    }
    if (this.stepInput) {
      this.stepInput.max = String(this.total)
      this.stepInput.value = String(Math.max(0, Math.min(this.total, this.frame)))
    }
    this.syncingPanel = false
    if (this.totalLabel) this.totalLabel.textContent = String(this.total)
    if (this.pauseBtn) {
      this.pauseBtn.disabled = false
      if (this._playing) this.pauseBtn.textContent = this._paused ? '继续' : '暂停'
      else if (this.frame >= this.total) this.pauseBtn.textContent = '重播'
      else this.pauseBtn.textContent = '继续'
    }
  }

  private showPanel(): void {
    this.ensurePanel()
    this.updatePanel()
  }

  private hidePanel(): void {
    if (this.panel) this.panel.hidden = true
  }

  /** 重放前 n 帧到会话；不触发状态栏变化 */
  private restoreTo(n: number): void {
    if (!this.base || !this.frames.length) return
    const count = Math.max(0, Math.min(this.frames.length, Math.floor(n)))
    this.hooks.restoreState(
      this.base,
      this.frames.slice(0, count).map((f) => f.move).filter((m): m is Move => !!m),
    )
    this.frame = count
    this.hooks.onFrame?.(count > 0 ? this.frames[count - 1]! : null)
    this.hooks.render()
    this.updatePanel()
  }

  private applySeek(): void {
    if (this.seekTarget === null) return
    const target = this.seekTarget
    this.seekTarget = null
    this.restoreTo(target)
  }

  /** 跳到第 n 帧；回放中会立即重建到目标帧，随后从目标帧继续 */
  private seek(n: number): void {
    if (this.syncingPanel) return
    if (!this.frames.length || !this.base) return
    const target = Math.max(0, Math.min(this.frames.length, Math.floor(n)))
    this.seekTarget = target
    this.restoreTo(target)
    this.seekTarget = null
    if (target > 0) {
      const f = this.frames[target - 1]!
      this.hooks.setStatus(
        `回放 [${target}/${this.total}] 规则${f.rule} · ${f.label}`,
        'solving',
      )
    } else {
      this.hooks.setStatus(`回放起点 [0/${this.total}]`, 'solving')
    }
    this.updatePanel()
  }

  /* ———————————————————— 生命周期 ———————————————————— */

  stop(): void {
    this.token++
    this._playing = false
    this._paused = false
    this.seekTarget = null
    this.frames = []
    this.base = null
    this.frame = 0
    this.total = 0
    this.hidePanel()
    this.hooks.onFrame?.(null)
    this.hooks.setButtonsDisabled(false)
    this.hooks.onStateChange?.()
  }

  /** 暂停 / 继续；结束后从当前位置重播 */
  togglePause(): void {
    if (!this._playing) {
      if (!this.frames.length || !this.base) return
      if (this.frame >= this.total) this.restoreTo(0)
      this._playing = true
      this._paused = false
      this.token++
      const token = this.token
      this.hooks.setButtonsDisabled(true)
      this.hooks.onStateChange?.()
      this.updatePanel()
      void this.playLoop(token).then(() => this.finish(token))
      return
    }
    this._paused = !this._paused
    this.updatePanel()
    // 暂停/继续不覆盖当前回放理由，状态栏保留最后一帧的规则说明。
  }

  /** 从当前盘面快照开始推理并回放 */
  async start(puzzle: Puzzle, snapshot: GameState): Promise<void> {
    if (this._playing) return
    this.token++
    const token = this.token
    this._playing = true
    this._paused = false
    this.frame = 0
    this.total = 0
    this.frames = []
    this.base = null
    this.puzzleId = puzzle.id
    this.hidePanel()
    this.hooks.setButtonsDisabled(true)
    this.hooks.onStateChange?.()
    this.hooks.setStatus('逻辑解题：推理中…', 'solving')
    await this.sleep(16, token)
    if (token !== this.token) return

    const plan = this.adapter.planLogicSolve(puzzle, snapshot)
    if (token !== this.token) return

    if (!plan.frames.length) {
      this._playing = false
      this._paused = false
      this.hooks.setButtonsDisabled(false)
      this.hooks.onFrame?.(null)
      this.hooks.onStateChange?.()
      this.hooks.setStatus('逻辑规则暂无新推演（可能已卡关或已全部确定）。')
      return
    }

    this.frames = plan.frames
    this.base = this.adapter.cloneState(snapshot)
    this.saturated = plan.saturated
    this.total = plan.frames.length
    this.frame = 0
    this.showPanel()
    this.hooks.setStatus(
      `推理完成：${plan.frames.length} 帧 / ${plan.ruleSteps} 条规则步，开始回放…`,
      'solving',
    )
    this.hooks.render()
    await this.sleep(280, token)
    if (token !== this.token) return

    await this.playLoop(token)
    this.finish(token)
  }

  private async playLoop(token: number): Promise<void> {
    const gapMs = Math.min(
      LOGIC_ANIM_MS,
      Math.max(60, Math.round(LOGIC_TOTAL_MS / Math.max(1, this.total))),
    )
    while (this.frame < this.total) {
      if (token !== this.token) return
      if (!this.hooks.samePuzzle(this.puzzleId)) return
      if (this.seekTarget !== null) {
        this.applySeek()
        continue
      }

      const frame = this.frames[this.frame]!
      // 先让渲染层拿到本帧的候选约束，再落子重绘
      this.hooks.onFrame?.(frame)
      const move = frame.move
      if (move) {
        this.hooks.pushMove(move)
        this.hooks.render()
        this.hooks.flash(move, frame.streak)
      } else {
        this.hooks.render()
      }

      this.frame++
      this.updatePanel()
      const kind = (frame as PlaybackFrame & { kind?: 'move' | 'infer' }).kind
      const ruleText = kind === 'infer' ? '推理' : `规则${frame.rule}`
      this.hooks.setStatus(
        `回放 [${this.frame}/${this.total}] ${ruleText} · ${frame.label}`,
        'solving',
      )

      if (this.frame < this.total) {
        const gap = kind === 'infer'
          ? Math.min(520, Math.max(260, Math.round(620 / frame.streak)))
          : Math.max(50, Math.round(gapMs / frame.streak))
        const more = await this.sleepPausable(gap, token)
        if (!more) return
      }
    }
  }

  private finish(token: number): void {
    if (token !== this.token) return
    if (!this.hooks.samePuzzle(this.puzzleId)) return
    this._playing = false
    this._paused = false
    this.hooks.setButtonsDisabled(false)
    this.hooks.onFrame?.(null)
    this.updatePanel()
    this.hooks.onStateChange?.()
    this.hooks.onFinished?.(this.saturated, this.total)
  }
}
