/**
 * 端口单一来源：读 package.json 的 puzzle.port 字段。
 *
 * vite.config.ts / scripts/dev.mjs / scripts/ui-check.mjs 都从这里取，
 * 建新游戏时只改 package.json 一处。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgPath = path.resolve(here, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

const port = Number(pkg?.puzzle?.port)

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`package.json 的 puzzle.port 非法：${JSON.stringify(pkg?.puzzle?.port)}`)
}

export const PORT = port
