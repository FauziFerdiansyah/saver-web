export interface Orderable {
  id: string
  order?: number
}

/**
 * Maps a reordered **visible** subset back onto the full list.
 *
 * The grids are filtered and searched, so a drop only ever reorders part of the
 * data. Numbering that subset 0..n (what the reorder used to do) would collide
 * with the `order` of the rows currently filtered out and scramble them the next
 * time the filter is cleared.
 *
 * Instead the visible rows keep the slots they occupied in the full list and are
 * redistributed in their new sequence; hidden rows never move. The result is the
 * complete list with `order` renumbered from 0, ready to persist.
 */
export function applyVisibleOrder<T extends Orderable>(all: T[], visible: T[]): T[] {
  const sorted = [...all].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const visibleIds = new Set(visible.map((item) => item.id))

  const slots: number[] = []
  sorted.forEach((item, index) => {
    if (visibleIds.has(item.id)) slots.push(index)
  })

  const next = [...sorted]
  const count = Math.min(slots.length, visible.length)
  for (let i = 0; i < count; i += 1) next[slots[i]] = visible[i]

  return next.map((item, index) => ({ ...item, order: index }))
}

/** Rows whose `order` actually changed, so a reorder writes as little as possible. */
export function changedOrders<T extends Orderable>(previous: T[], next: T[]): T[] {
  const before = new Map(previous.map((item) => [item.id, item.order ?? 0]))
  return next.filter((item) => before.get(item.id) !== (item.order ?? 0))
}

/**
 * Moves one row a step up or down inside the visible list and returns
 * id -> new order for every row whose slot changed. Hidden rows keep theirs.
 */
export function moveVisible<T extends Orderable>(all: T[], visible: T[], id: string, direction: -1 | 1): Map<string, number> {
  const index = visible.findIndex((item) => item.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= visible.length) return new Map()
  const moved = [...visible]
  moved.splice(target, 0, ...moved.splice(index, 1))
  const next = applyVisibleOrder(all, moved)
  return new Map(changedOrders(all, next).map((item) => [item.id, item.order ?? 0]))
}
