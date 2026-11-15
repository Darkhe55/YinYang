/**
 * 通用 DOM 小工具
 */

/** 查询元素；查不到直接抛错（模板内的静态 DOM 保证存在） */
export function $<T extends HTMLElement = HTMLElement>(sel: string, root?: ParentNode): T {
  const base = root ?? document
  const el = base.querySelector<T>(sel)
  if (!el) throw new Error(`missing ${sel}`)
  return el
}

/** 安全绑定事件 */
export function on<K extends keyof HTMLElementEventMap>(
  el: HTMLElement | null,
  type: K,
  fn: (e: HTMLElementEventMap[K]) => void,
): void {
  if (!el) return
  el.addEventListener(type, fn as EventListener)
}