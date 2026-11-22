import { categories as seedCategories } from "@/constants/categories"
import type { CategoryScope, SavedCategory } from "@/types"

export const CATEGORY_SCOPES: { id: CategoryScope; label: string }[] = [
  { id: "links", label: "Links" },
  { id: "breadcrumb", label: "Breadcrumb" },
  { id: "keys", label: "Keys" },
]

/** Turns a typed label into a stable document id: "UI / UX" → "ui-ux". */
export function slugifyCategory(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

/** Appends a counter until the id is free, so two "Kerja" cannot collide. */
export function uniqueCategoryId(list: SavedCategory[], base: string): string {
  const taken = new Set(list.map((item) => item.id))
  const seed = base || "kategori"
  if (!taken.has(seed)) return seed
  let counter = 2
  while (taken.has(`${seed}-${counter}`)) counter += 1
  return `${seed}-${counter}`
}

/**
 * Categories a tab should offer, in display order. A category with no scopes
 * belongs everywhere — that is how the seeded defaults keep behaving exactly
 * like the old static list.
 */
export function categoriesForScope(
  list: SavedCategory[],
  scope: CategoryScope,
): SavedCategory[] {
  return list
    .filter((item) => item.scopes.length === 0 || item.scopes.includes(scope))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

/**
 * Label for a stored category id. Items keep their id when a category is
 * deleted, so the fallback prettifies the raw id instead of losing the
 * information ("ui-ux" → "Ui ux").
 */
export function resolveCategoryLabel(
  list: SavedCategory[],
  id: string,
): string {
  if (!id) return ""
  const found = list.find((item) => item.id === id)
  if (found) return found.label
  const words = id.replace(/[-_]+/g, " ").trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id
}

/** Next free slot, so a new category lands at the end of the list. */
export function nextCategoryOrder(list: SavedCategory[]): number {
  return list.reduce((max, item) => Math.max(max, item.order + 1), 0)
}

/**
 * The rows written for a brand-new account: the previous hard-coded list, with
 * the same ids so bookmarks and keys saved earlier still resolve their label.
 */
export function seedCategoryRows(now = Date.now()): SavedCategory[] {
  return seedCategories.map((category, index) => ({
    id: category.id,
    label: category.label,
    icon: category.icon,
    color: "",
    scopes: [],
    order: index,
    createdAt: now,
    updatedAt: now,
  }))
}

/** Reorders a category one step up or down, returning the rows that moved. */
export function moveCategory(
  list: SavedCategory[],
  id: string,
  direction: -1 | 1,
): SavedCategory[] {
  const sorted = [...list].sort((a, b) => a.order - b.order)
  const index = sorted.findIndex((item) => item.id === id)
  const target = index + direction
  if (index === -1 || target < 0 || target >= sorted.length) return []
  const swapped = [...sorted]
  ;[swapped[index], swapped[target]] = [swapped[target], swapped[index]]
  return swapped
    .map((item, position) => ({ ...item, order: position }))
    .filter((item, position) => sorted[position].id !== item.id)
}

/**
 * What the UI should show for a category list.
 *
 * The remote list wins whenever it has rows. An empty list only means "the user
 * deleted everything" once we know the seed already ran (`seeded`) and the
 * listener is healthy. While the first snapshot is in flight, or when Firestore
 * refuses the read (rules not deployed yet, offline), the built-in defaults are
 * shown instead — a filter row and a form with no categories at all would look
 * like the data was lost.
 */
export function categoriesWithFallback(
  remote: SavedCategory[],
  state: { loading: boolean; error: boolean; seeded: boolean },
): SavedCategory[] {
  if (remote.length > 0) return remote
  if (state.loading || state.error || !state.seeded) return seedCategoryRows()
  return []
}
