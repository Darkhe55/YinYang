/**
 * 自定义题库（通用）
 *
 * 题库条目 = Puzzle 的 JSON 序列化。游戏特有题面字段由
 * GameAdapter.custom.encodePuzzle / decodePuzzle 负责编解码。
 */

import type { Puzzle } from './types'
import { readLibrary, writeLibrary, type LibraryEntry } from './store'

export interface SavedPuzzle extends Puzzle {
  savedAt: number
}

export interface PuzzleCodec {
  encode(p: Puzzle): Record<string, unknown>
  decode(record: Record<string, unknown>): Puzzle | null
}

function toEntry(p: SavedPuzzle, codec: PuzzleCodec): LibraryEntry {
  return {
    id: p.id,
    name: p.name,
    width: p.width,
    height: p.height,
    difficulty: p.difficulty,
    savedAt: p.savedAt,
    ...codec.encode(p),
  }
}

function fromEntry(x: LibraryEntry, codec: PuzzleCodec): SavedPuzzle | null {
  const decoded = codec.decode(x as Record<string, unknown>)
  if (!decoded) return null
  return {
    ...decoded,
    id: x.id,
    name: x.name || `自定义 · ${x.width}×${x.height}`,
    difficulty: (x.difficulty as Puzzle['difficulty']) || 'custom',
    savedAt: typeof x.savedAt === 'number' ? x.savedAt : Date.now(),
  }
}

/** 题库数据来自项目内 data/library.json（降级时才是 localStorage） */
export function loadSavedPuzzles(codec: PuzzleCodec): SavedPuzzle[] {
  const out: SavedPuzzle[] = []
  for (const x of readLibrary()) {
    if (!x || !x.id || typeof x.width !== 'number' || typeof x.height !== 'number') continue
    const p = fromEntry(x, codec)
    if (p) out.push(p)
  }
  return out
}

export function persistSavedPuzzles(list: SavedPuzzle[], codec: PuzzleCodec): void {
  writeLibrary(list.map((p) => toEntry(p, codec)))
}

/** 追加或覆盖同 id，返回最新列表 */
export function savePuzzleToLibrary(p: Puzzle, codec: PuzzleCodec): SavedPuzzle[] {
  const list = loadSavedPuzzles(codec)
  const item: SavedPuzzle = { ...p, difficulty: 'custom', savedAt: Date.now() }
  const i = list.findIndex((x) => x.id === p.id)
  if (i >= 0) list[i] = item
  else list.push(item)
  persistSavedPuzzles(list, codec)
  return list
}

export function removeSavedPuzzle(id: string, codec: PuzzleCodec): SavedPuzzle[] {
  const list = loadSavedPuzzles(codec).filter((p) => p.id !== id)
  persistSavedPuzzles(list, codec)
  return list
}