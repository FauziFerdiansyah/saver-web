import { describe, expect, it } from "vitest"
import { applyVisibleOrder, changedOrders } from "@/lib/reorder"

const row = (id: string, order: number) => ({ id, order })

describe("applyVisibleOrder", () => {
  it("renumbers a full list when everything is visible", () => {
    const all = [row("a", 0), row("b", 1), row("c", 2)]
    const dropped = [all[2], all[0], all[1]]
    expect(applyVisibleOrder(all, dropped)).toEqual([
      { id: "c", order: 0 },
      { id: "a", order: 1 },
      { id: "b", order: 2 },
    ])
  })

  it("keeps filtered-out rows in place", () => {
    // b and d are hidden by a category filter; only a, c, e are on screen.
    const all = [row("a", 0), row("b", 1), row("c", 2), row("d", 3), row("e", 4)]
    const visible = [all[0], all[2], all[4]]
    const dropped = [visible[2], visible[0], visible[1]] // e, a, c

    const result = applyVisibleOrder(all, dropped)
    expect(result.map((item) => item.id)).toEqual(["e", "b", "a", "d", "c"])
    // The hidden rows still sit in slots 1 and 3, exactly where they were.
    expect(result.find((item) => item.id === "b")?.order).toBe(1)
    expect(result.find((item) => item.id === "d")?.order).toBe(3)
  })

  it("survives a stale visible list", () => {
    const all = [row("a", 0), row("b", 1)]
    expect(applyVisibleOrder(all, [row("a", 0), row("ghost", 9)]).map((r) => r.id)).toEqual([
      "a",
      "b",
    ])
  })
})

describe("changedOrders", () => {
  it("returns only the rows that actually moved", () => {
    const previous = [row("a", 0), row("b", 1), row("c", 2)]
    const next = [row("a", 0), row("c", 1), row("b", 2)]
    expect(changedOrders(previous, next).map((item) => item.id)).toEqual(["c", "b"])
  })

  it("returns nothing when the order is unchanged", () => {
    const rows = [row("a", 0), row("b", 1)]
    expect(changedOrders(rows, rows)).toEqual([])
  })
})
