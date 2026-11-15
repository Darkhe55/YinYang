/**
 * 题库审计（模板）
 *
 * 不依赖具体游戏规则，只做「数据结构级」检查：
 * - RAW_PUZZLES 条目格式合法（id 唯一 / 宽高为正 / 难度合法 / board 长度匹配）
 * - 有题库时给出提示，建议去浏览器 /__audit 页做「参考解合法 + 逻辑计划」深度审计
 *
 * 深度审计（涉及具体游戏规则）在 dev server 的 /__audit 页面完成：
 *   npm run dev 后访问 http://127.0.0.1:<端口>/__audit
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const DATA_FILE = path.resolve('src/game/puzzles-data.ts')
const text = readFileSync(DATA_FILE, 'utf8')

// 从生成的 TS 源码里提取 RAW_PUZZLES 数组条目
const entries = []
const re = /^\s*\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*width:\s*(\d+),\s*height:\s*(\d+),\s*difficulty:\s*'([^']+)',\s*series:\s*"([^"]+)",\s*board:\s*"([^"]*)",\s*solution:\s*"([^"]*)"\s*\}/gm
let m
while ((m = re.exec(text)) !== null) {
  entries.push({
    id: m[1],
    name: m[2],
    width: Number(m[3]),
    height: Number(m[4]),
    difficulty: m[5],
    series: m[6],
    board: m[7],
    solution: m[8],
  })
}

let errors = 0
const ids = new Set()

for (const e of entries) {
  if (ids.has(e.id)) {
    console.error(`[check] 重复 id: ${e.id}`)
    errors++
  }
  ids.add(e.id)
  if (!e.name) {
    console.error(`[check] ${e.id} 缺 name`)
    errors++
  }
  if (e.width <= 0 || e.height <= 0) {
    console.error(`[check] ${e.id} 宽高非法: ${e.width}×${e.height}`)
    errors++
  }
  if (!['easy', 'medium', 'hard', 'custom'].includes(e.difficulty)) {
    console.error(`[check] ${e.id} 难度非法: ${e.difficulty}`)
    errors++
  }
  if (e.board.length !== e.width * e.height) {
    console.error(`[check] ${e.id} board 长度 ${e.board.length} != ${e.width}×${e.height}`)
    errors++
  }
  if (e.solution && e.solution.length !== e.width * e.height) {
    console.error(`[check] ${e.id} solution 长度 ${e.solution.length} != ${e.width}×${e.height}`)
    errors++
  }
}

console.log(`[check] 共 ${entries.length} 题，错误 ${errors}`)
if (entries.length === 0) {
  console.warn('[check] 题库为空（模板空壳）。实现游戏适配器后运行 npm run gen 生成题库。')
}
if (errors > 0) process.exitCode = 1