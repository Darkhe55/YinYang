/**
 * 逻辑谜题模板 —— 通用核心类型
 *
 * 核心层完全不认识具体游戏。它只依赖下面这套「最小公共结构」：
 * - Puzzle：宽高 + id + 难度（游戏特有字段由各游戏扩展，核心不关心）
 * - GameState：棋盘状态（游戏特有字段扩展）
 * - Move：一次落子（index + from/to，from/to 用数字枚举，0 一律表示「未定」）
 * - ValidationResult：校验结果（至少含 solved）
 * - LogicPlan / PlaybackFrame：逻辑解题计划与动画帧
 *
 * 具体游戏通过实现 GameAdapter 把这些类型接进模板，详见 game/adapter.ts。
 */

/** 难度标签 */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'custom'

/** 通用题面最小结构（各游戏在此基础上扩展自己的字段） */
export interface Puzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: Difficulty
}

/** 通用棋盘状态（各游戏扩展） */
export interface GameState {
  puzzleId: string
  width: number
  height: number
}

/** 一次落子：from/to 为数字枚举，0 = Unknown（所有游戏统一约定） */
export interface Move {
  /** 目标索引：格子 / 边 / 顶点，由游戏定义 */
  index: number
  from: number
  to: number
}

/** 校验结果：游戏扩展错误明细，至少给出 solved */
export interface ValidationResult {
  solved: boolean
}

/** 逻辑解题动画帧（回放的最小单位） */
export interface PlaybackFrame {
  /** 规则编号或 id（显示在状态栏） */
  rule: number | string
  /** 人类可读的推理说明 */
  label: string
  /** 这一帧落下的子 */
  move: Move
  /** 同规则连拍序号（1 起），用于音高抬升 / 动画加速 */
  streak: number
}

/** 逻辑解题计划：推理期一次性算完，回放期只读 */
export interface LogicPlan {
  puzzleId: string
  frames: PlaybackFrame[]
  /** 推理终态（与逐帧施加后一致） */
  finalState: GameState | null
  /** 规则步数（含无落子的推导步） */
  ruleSteps: number
  /** 是否已推到规则不动点 */
  saturated: boolean
}

/** 回溯求解结果 */
export interface SolveResult {
  solved: boolean
  solution: GameState | null
  /** 搜索节点数（状态栏/调试用） */
  nodes: number
  timedOut: boolean
}

/** 棋盘渲染度量：所有描边/字号按 10×10 基准格距等比缩放 */
export interface BoardMetrics {
  cell: number
  pad: number
  width: number
  height: number
  svgWidth: number
  svgHeight: number
  k: number
}

/** 命中目标（目前只含索引；渲染/命中由游戏自行实现） */
export interface HitTarget {
  index: number
}

/** 游戏元信息：模板用它生成品牌区、快捷键说明、存储键、端口等 */
export interface GameMeta {
  /** 标题（顶栏 h1） */
  title: string
  /** 副标题（顶栏 p） */
  tagline: string
  /** 底部提示 */
  footerNote: string
  /** localStorage 旧键前缀（data/ 文件名不依赖它） */
  storageKeyPrefix: string
  /** 自定义题 id 前缀，如 'custom-' */
  customIdPrefix: string
  /** 自定义题板宽高范围 */
  customMinW: number
  customMinH: number
  customMaxW: number
  customMaxH: number
}

/** 自定义题板支持：核心提供通用编辑器，游戏只需声明「值集合」和编解码 */
export interface CustomSupport {
  /** 点击循环的值序列（null 表示空格；0 = Unknown 约定由 core 处理，编辑器不显式出现 0） */
  valueCycle: Array<number | null>
  /** 编辑器按键 0-9 对应的值：返回 undefined 表示该键不用 */
  keyForDigit(digit: number): number | null | undefined
  /** 编辑器格子显示文案 */
  cellLabel(v: number | null): string
  /** 编辑器格子附加 CSS 类（可选） */
  cellClass?(v: number | null): string
  /** 自定义题板提示文字 */
  hint: string
  /** 把已保存的题面还原成编辑器网格（编辑功能用）；不支持则省略或返回 null */
  toGrid?(p: Puzzle): { width: number; height: number; grid: Array<number | null> } | null
  /** 从编辑器网格构造 Puzzle（existingId 给稳定 id 用） */
  makePuzzle(w: number, h: number, grid: Array<number | null>, existingId?: string): Puzzle
  /** 把题面序列化成 library 条目字段（JSON 友好） */
  encodePuzzle(p: Puzzle): Record<string, unknown>
  /** 从 library 条目还原题面；不合法返回 null */
  decodePuzzle(record: Record<string, unknown>): Puzzle | null
}

/**
 * 游戏适配器契约 —— 模板核心只依赖这个接口。
 *
 * 新游戏 = 实现一个 GameAdapter + 一份题库数据 + 一个入口 main.ts。
 */
export interface GameAdapter {
  meta: GameMeta
  /** 内置题库 */
  builtinPuzzles: Puzzle[]
  /** 参考解（提示一格 / 显示解用）；没有返回 null */
  getReferenceSolution(id: string): GameState | null

  // —— 棋盘状态 ——
  createEmptyState(puzzle: Puzzle): GameState
  cloneState(state: GameState): GameState
  /** 左键点击循环后的值（如 0→1→2→0） */
  cycleValue(state: GameState, target: HitTarget): number
  /** 右键直接写入的值（默认语义 = 打叉/排除，各游戏可覆盖） */
  rightClickValue(state: GameState, target: HitTarget): number
  applyMove(state: GameState, move: Move): void
  invertMove(move: Move): Move
  /** 读取某索引当前值（state 内部数组的取值入口） */
  valueAt(state: GameState, index: number): number
  serializeState(state: GameState): Record<string, unknown>
  deserializeState(data: Record<string, unknown>): GameState | null

  // —— 校验 ——
  validate(state: GameState, puzzle: Puzzle): ValidationResult
  /** 把校验结果转成状态栏片段（如 ['3 处三连', '第 2 行不平衡']） */
  statusBits(result: ValidationResult): string[]

  // —— 渲染与命中 ——
  metricsFor(puzzle: Puzzle): BoardMetrics
  renderBoard(puzzle: Puzzle, state: GameState, result: ValidationResult, colorGrid?: unknown): string
  hitTest(m: BoardMetrics, puzzle: Puzzle, x: number, y: number): HitTarget | null

  // —— 逻辑解题 ——
  planLogicSolve(puzzle: Puzzle, state: GameState): LogicPlan

  // —— 回溯求解 ——
  solvePuzzle(puzzle: Puzzle, maxNodes?: number): SolveResult

  // —— 提示一格 ——
  firstHintMove(state: GameState, solution: GameState): Move | null

  // —— 自定义题板 ——
  custom: CustomSupport

  // —— 音效 / 特效 ——
  /** 根据 move 播放音效（from===0 通常表示落子=拨弦，否则=水滴） */
  playForMove(move: Move, streak: number): void
  /** 落子 SVG 特效；不实现则用 core/fx 的通用弦振/涟漪/pop */
  flashForMove?(svg: SVGSVGElement, move: Move, streak: number, m: BoardMetrics): void
}