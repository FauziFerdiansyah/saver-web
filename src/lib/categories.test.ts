import { describe, expect, it } from "vitest"
import {
  categoriesForScope,
  categoriesWithFallback,
  moveCategory,
  nextCategoryOrder,
  resolveCategoryLabel,
  seedCategoryRows,
  slugifyCategory,
  uniqueCategoryId,
} from "@/lib/categories"
import type { SavedCategory } from "@/types"

function category(overrides: Partial<SavedCategory> = {}): SavedCategory {
  return {
    id: "kerja",
    label: "Kerja",
    icon: "Briefcase",
    color: "",
    scopes: [],
    order: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe("slugifyCategory", () => {
  it("makes a stable id out of a typed label", () => {
    expect(slugifyCategory("UI / UX")).toBe("ui-ux")
    expect(slugifyCategory("  Dokumentasi Internal  ")).toBe("dokumentasi-internal")
    expect(slugifyCategory("API & Token")).toBe("api-token")
  })

  it("survives labels with nothing usable in them", () => {
    expect(slugifyCategory("###")).toBe("")
  })
})

describe("uniqueCategoryId", () => {
  it("keeps the slug when it is free and counts up when taken", () => {
    const list = [category({ id: "kerja" }), category({ id: "kerja-2" })]
    expect(uniqueCategoryId(list, "santai")).toBe("santai")
    expect(uniqueCategoryId(list, "kerja")).toBe("kerja-3")
    expect(uniqueCategoryId(list, "")).toBe("kategori")
  })
})

describe("categoriesForScope", () => {
  it("treats an empty scope list as every tab", () => {
    const list = [
      category({ id: "umum", order: 1 }),
      category({ id: "token", scopes: ["keys"], order: 0 }),
    ]
    expect(categoriesForScope(list, "keys").map((item) => item.id)).toEqual(["token", "umum"])
    expect(categoriesForScope(list, "links").map((item) => item.id)).toEqual(["umum"])
  })

  it("sorts by order, then label for ties", () => {
    const list = [
      category({ id: "b", label: "Beta", order: 0 }),
      category({ id: "a", label: "Alpha", order: 0 }),
    ]
    expect(categoriesForScope(list, "links").map((item) => item.id)).toEqual(["a", "b"])
  })
})

describe("resolveCategoryLabel", () => {
  it("uses the stored label when the category still exists", () => {
    expect(resolveCategoryLabel([category({ id: "kerja", label: "Kerja" })], "kerja")).toBe("Kerja")
  })

  it("prettifies the raw id when the category was deleted, keeping the info", () => {
    expect(resolveCategoryLabel([], "ui-ux")).toBe("Ui ux")
    expect(resolveCategoryLabel([], "")).toBe("")
  })
})

describe("seedCategoryRows", () => {
  it("keeps the old ids so existing links and keys still resolve", () => {
    const rows = seedCategoryRows(1000)
    expect(rows.map((row) => row.id)).toContain("general")
    expect(rows.map((row) => row.id)).toContain("other")
    expect(rows[0].order).toBe(0)
    // Seeded categories belong to every tab, matching the previous behaviour.
    expect(rows.every((row) => row.scopes.length === 0)).toBe(true)
  })
})

describe("nextCategoryOrder", () => {
  it("puts a new category after the last one", () => {
    expect(nextCategoryOrder([])).toBe(0)
    expect(nextCategoryOrder([category({ order: 0 }), category({ id: "x", order: 4 })])).toBe(5)
  })
})

describe("categoriesWithFallback", () => {
  const remote = [category({ id: "punyaku", label: "Punyaku" })]

  it("prefers the stored list whenever it has rows", () => {
    expect(
      categoriesWithFallback(remote, { loading: false, error: false, seeded: true }).map((c) => c.id),
    ).toEqual(["punyaku"])
  })

  it("shows the built-in list while loading, on error, or before the first seed", () => {
    for (const state of [
      { loading: true, error: false, seeded: false },
      // Rules for categories/ not deployed yet — an empty picker would look
      // like the categories were lost.
      { loading: false, error: true, seeded: false },
      { loading: false, error: false, seeded: false },
    ]) {
      const list = categoriesWithFallback([], state)
      expect(list.length).toBeGreaterThan(0)
      expect(list.map((item) => item.id)).toContain("general")
    }
  })

  it("respects an empty list once the seed is known to have run", () => {
    expect(categoriesWithFallback([], { loading: false, error: false, seeded: true })).toEqual([])
  })
})

describe("moveCategory", () => {
  const list = [
    category({ id: "a", order: 0 }),
    category({ id: "b", order: 1 }),
    category({ id: "c", order: 2 }),
  ]

  it("swaps with the neighbour and returns only the rows that moved", () => {
    const moved = moveCategory(list, "c", -1)
    expect(moved.map((item) => [item.id, item.order])).toEqual([
      ["c", 1],
      ["b", 2],
    ])
  })

  it("does nothing at the edges", () => {
    expect(moveCategory(list, "a", -1)).toEqual([])
    expect(moveCategory(list, "c", 1)).toEqual([])
    expect(moveCategory(list, "tidak-ada", 1)).toEqual([])
  })
})
