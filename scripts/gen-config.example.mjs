/**
 * 题库生成器示例配置 —— 复制为 scripts/gen-config.mjs 后按你的游戏修改。
 *
 * generatePuzzles() 返回题库条目数组。board / solution 的编码格式由你的
 * src/game/puzzles.ts 负责解析（模板的 gen-puzzles.mjs 只校验长度）。
 */

export const NAME = '示例生成器'

export async function generatePuzzles() {
  // 示例：一道 4×4 的占位题（没有任何规则含义，只是演示格式）
  // 实际游戏里请在这里用你的生成算法（回溯 + 唯一解校验）产出题目。
  return [
    {
      id: 'demo-4x4-a',
      name: '示例 · 4×4 A',
      width: 4,
      height: 4,
      difficulty: 'easy',
      series: 'builtin',
      // 编码串：16 个字符，含义由你的 puzzles.ts 解析
      board: '....'.repeat(4),
      solution: '',
    },
  ]
}