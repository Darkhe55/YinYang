/**
 * 通用逻辑解题回放器
 *
 * 相位 1：一次性调用 GameAdapter.planLogicSolve 推完整份计划（不落子）；
 * 相位 2：逐帧回放 —— 每帧 pushMove → 重绘 → 特效/音效 → 状态栏，可暂停/停止。
 *
 * 回放期间其它按钮与盘面交互由 app 层屏蔽。
 */

import type { GameAdapter, GameState, Move, Puzzle } from './types'

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
  /** 播放结束后需要额外做的事（如收尾状态栏） */
  onFinished?(saturated: boolean, frames: number): void
}

const LOGIC_ANIM_MS = 720

export class LogicPlayer {
  private token = 0
  private _playing = false
  private _paused = false
  private frame = 0
  private total = 0

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

  stop(): void {
    this.token++
    this._playing = false
    this._paused = false
    this.hooks.setButtonsDisabled(false)
  }

  /** 暂停 / 继续（快捷键 P） */
  togglePause(): void {
    if (!this._playing) return
    this._paused = !this._paused
    if (this._paused) {
      this.hooks.setStatus(`回放已暂停 [${this.progress()}] · 按 P 或点“逻辑解题”继续`, 'solving')
    } else {
      this.hooks.setStatus(`回放继续 [${this.progress()}]…`, 'solving')
    }
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

  /** 从当前盘面快照开始推理并回放 */
  async start(puzzle: Puzzle, snapshot: GameState): Promise<void> {
    if (this._playing) return
    this.token++
    const token = this.token
    this._playing = true
    this._paused = false
    this.frame = 0
    this.total = 0
    this.hooks.setButtonsDisabled(true)
    this.hooks.setStatus('逻辑解题：推理中…', 'solving')
    await this.sleep(16, token)
    if (token !== this.token) return

    const plan = this.adapter.planLogicSolve(puzzle, snapshot)
    if (token !== this.token) return

    if (!plan.frames.length) {
      this._playing = false
      this.hooks.setButtonsDisabled(false)
      this.hooks.setStatus('逻辑规则暂无新推演（可能已卡关或已全部确定）。')
      return
    }

    this.total = plan.frames.length
    this.hooks.setStatus(
      `推理完成：${plan.frames.length} 帧 / ${plan.ruleSteps} 条规则步，开始回放…`,
      'solving',
    )
    this.hooks.render()
    await this.sleep(280, token)
    if (token !== this.token) return

    for (let i = 0; i < plan.frames.length; i++) {
      if (token !== this.token) return
      if (!this.hooks.samePuzzle(puzzle.id)) return

      const frame = plan.frames[i]!
      this.hooks.pushMove(frame.move)
      this.hooks.render()
      this.hooks.flash(frame.move, frame.streak)

      this.frame = i + 1
      this.hooks.setStatus(
        `回放 [${this.frame}/${this.total}] 规则${frame.rule} · ${frame.label}`,
        'solving',
      )

      if (i < plan.frames.length - 1) {
        const gap = Math.max(50, Math.round(LOGIC_ANIM_MS / frame.streak))
        const more = await this.sleepPausable(gap, token)
        if (!more) return
      }
    }
    await this.sleepPausable(LOGIC_ANIM_MS, token)
    if (token !== this.token) return

    this._playing = false
    this._paused = false
    this.hooks.setButtonsDisabled(false)
    this.hooks.onFinished?.(plan.saturated, plan.frames.length)
  }
}