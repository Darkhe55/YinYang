/**
 * 题库生成器（模板）
 *
 * 模板本身不包含任何谜题生成逻辑 —— 那是每个游戏自己的事。
 * 本脚本只负责「把生成结果写进 src/game/puzzles-data.ts」。
 *
 * 接入你的游戏：
 *   1. 新建 scripts/gen-config.mjs，导出 generatePuzzles()：
 *       返回 [{ id, name, width, height, difficulty, series, board, solution }]
 *     其中 board 是题面编码串（如数字串 / 墙串），solution 是参考解编码串，
 *     编码格式由你的 src/game/puzzles.ts 解析。
 *   2. 运行 npm run gen，自动生成 src/game/puzzles-data.ts。
 *
 * 没有 gen-config.mjs 时本脚本生成空题库（模板空壳可正常运行）。
 */
import { writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const DATA_FILE = path.resolve('src/game/puzzles-data.ts')
const CONFIG_FILE = path.resolve('scripts/gen-config.mjs')

let items = []
let generatorName = ''

if (existsSync(CONFIG_FILE)) {
  // 动态 import 加 query 避免 node 缓存旧模块
  const cfg = await import(`./gen-config.mjs?t=${Date.now()}`)
  if (cfg && typeof cfg.generatePuzzles === 'function') {
    items = (await cfg.generatePuzzles()) || []
    generatorName = cfg.NAME || '自定义生成器'
  }
} else {
  console.warn(
    '[gen] 未找到 scripts/gen-config.mjs，将生成空题库。参考 scripts/gen-config.example.mjs。',
  )
}

// 校验基本结构
for (const p of items) {
  if (!p || typeof p.id !== 'string' || !p.name || !p.width || !p.height) {
    throw new Error('[gen] 无效的题面条目：' + JSON.stringify(p))
  }
  if (typeof p.board !== 'string' || p.board.length !== p.width * p.height) {
    throw new Error(`[gen] ${p.id} 的 board 长度不等于 ${p.width}×${p.height}`)
  }
  if (p.solution && p.solution.length !== p.width * p.height) {
    throw new Error(`[gen] ${p.id} 的 solution 长度不等于 ${p.width}×${p.height}`)
  }
}

const lines = []
lines.push('/* 自动生成，勿手改。运行 npm run gen 重新生成。 */')
lines.push('export interface RawPuzzle {')
lines.push('  id: string')
lines.push('  name: string')
lines.push('  width: number')
lines.push('  height: number')
lines.push(`  difficulty: 'easy' | 'medium' | 'hard' | 'custom'`)
lines.push('  series: string')
lines.push('  /** 题面编码串（格式由 src/game/puzzles.ts 解析） */')
lines.push('  board: string')
lines.push('  /** 参考解编码串（没有则留空） */')
lines.push('  solution?: string')
lines.push('}')
lines.push('')
lines.push('export const RAW_PUZZLES: RawPuzzle[] = [')
for (const p of items) {
  lines.push(
    `  { id: ${JSON.stringify(p.id)}, name: ${JSON.stringify(p.name)}, width: ${p.width}, height: ${p.height}, difficulty: '${p.difficulty}', series: ${JSON.stringify(p.series || 'builtin')}, board: ${JSON.stringify(p.board)}, solution: ${JSON.stringify(p.solution || '')} },`,
  )
}
lines.push(']')
lines.push('')
writeFileSync(DATA_FILE, lines.join('\n'))
console.log(
  `[gen] 写入 ${DATA_FILE}：${items.length} 题${generatorName ? '（' + generatorName + '）' : ''}`,
)