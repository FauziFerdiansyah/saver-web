import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from "firebase/firestore"
import { db } from "@/firebase"
import { faviconUrl } from "@/lib/format"
import {
  categoriesWithFallback,
  nextCategoryOrder,
  seedCategoryRows,
  slugifyCategory,
  uniqueCategoryId,
} from "@/lib/categories"
import { createStore, useStore } from "@/lib/store"
import type { Bookmark, BookmarkIcon, Breadcrumb, CategoryScope, SavedCategory, SavedKey, TOTPAccount } from "@/types"
import { liveCollection, read, report, settingsDoc, stamps, touch, userCollection, type LiveCollection } from "./core"

type Raw = Record<string, unknown>

function icon(data: Raw, fallbackType: BookmarkIcon["type"], fallbackValue: string): BookmarkIcon {
  const map = read.map(data, "icon")
  if (!map) return { type: fallbackType, value: fallbackValue }
  const type = read.str(map, "type", fallbackType)
  return {
    type: type === "favicon" || type === "custom" || type === "lucide" ? type : fallbackType,
    value: read.str(map, "value", fallbackValue),
  }
}

interface Crud<T extends { id: string }> {
  /** Saves a new row when the id is empty, otherwise updates it. Returns the document id. */
  save: (item: T) => string | null
  /** Re-creates a deleted row under its old id, for the "Batalkan" action. */
  restore: (item: T) => void
  patch: (id: string, data: Raw, what?: string) => void
  remove: (id: string) => void
  setOrders: (orders: Map<string, number>) => void
}

function crud<T extends { id: string }>(root: string, noun: string, fields: (item: T) => Raw): Crud<T> {
  return {
    save: (item) => {
      const col = userCollection(root)
      if (!col) return null
      if (!item.id) {
        const ref = doc(col)
        report(setDoc(ref, { ...fields(item), ...stamps() }), `Menyimpan ${noun}`)
        return ref.id
      }
      report(updateDoc(doc(col, item.id), { ...fields(item), ...touch() }), `Memperbarui ${noun}`)
      return item.id
    },
    restore: (item) => {
      const col = userCollection(root)
      if (col) report(setDoc(doc(col, item.id), { ...fields(item), ...stamps() }), `Mengembalikan ${noun}`)
    },
    patch: (id, data, what = `Memperbarui ${noun}`) => {
      const col = userCollection(root)
      if (col) report(updateDoc(doc(col, id), { ...data, ...touch() }), what)
    },
    remove: (id) => {
      const col = userCollection(root)
      if (col) report(deleteDoc(doc(col, id)), `Menghapus ${noun}`)
    },
    setOrders: (orders) => {
      const col = userCollection(root)
      if (!db || !col || orders.size === 0) return
      const batch = writeBatch(db)
      orders.forEach((order, id) => batch.update(doc(col, id), { order, ...touch() }))
      report(batch.commit(), `Mengurutkan ${noun}`)
    },
  }
}

export const links: LiveCollection<Bookmark> & Crud<Bookmark> = {
  ...liveCollection<Bookmark>(
    "bookmarks",
    (id, d) => ({
      id,
      url: read.str(d, "url"),
      alias: read.str(d, "alias"),
      description: read.str(d, "description"),
      type: read.str(d, "type", "link"),
      category: read.str(d, "category"),
      icon: icon(d, "lucide", "Link"),
      color: read.str(d, "color", "#64748b"),
      pinned: read.bool(d, "pinned"),
      order: read.num(d, "order"),
      tags: read.strings(d, "tags"),
      createdAt: read.millis(d, "createdAt"),
      updatedAt: read.millis(d, "updatedAt"),
    }),
    { orderByField: "order" },
  ),
  ...crud<Bookmark>("bookmarks", "link", (b) => ({
    url: b.url, alias: b.alias, description: b.description, type: b.type, category: b.category,
    icon: b.icon, color: b.color, pinned: b.pinned, order: b.order, tags: b.tags,
  })),
}

export const breadcrumbs: LiveCollection<Breadcrumb> & Crud<Breadcrumb> = {
  ...liveCollection<Breadcrumb>(
    "breadcrumbs",
    (id, d) => {
      const url = read.str(d, "url")
      return {
        id,
        url,
        title: read.str(d, "title"),
        category: read.str(d, "category"),
        description: read.str(d, "description"),
        icon: icon(d, "favicon", faviconUrl(url)),
        color: read.str(d, "color", "#64748b"),
        order: read.num(d, "order"),
        createdAt: read.millis(d, "createdAt"),
        updatedAt: read.millis(d, "updatedAt"),
      }
    },
    { orderByField: "order" },
  ),
  ...crud<Breadcrumb>("breadcrumbs", "breadcrumb", (b) => ({
    url: b.url, title: b.title, category: b.category, description: b.description,
    icon: b.icon, color: b.color, order: b.order,
  })),
}

export const keys: LiveCollection<SavedKey> & Crud<SavedKey> = {
  ...liveCollection<SavedKey>(
    "keys",
    (id, d) => ({
      id,
      title: read.str(d, "title"),
      keyValue: read.str(d, "keyValue"),
      validUntil: read.numOrNull(d, "validUntil"),
      lifetime: read.bool(d, "lifetime"),
      category: read.str(d, "category"),
      icon: icon(d, "lucide", "Key"),
      color: read.str(d, "color", "#64748b"),
      note: read.str(d, "note"),
      pinned: read.bool(d, "pinned"),
      order: read.num(d, "order"),
      createdAt: read.millis(d, "createdAt"),
      updatedAt: read.millis(d, "updatedAt"),
    }),
    { orderByField: "order" },
  ),
  ...crud<SavedKey>("keys", "key", (k) => ({
    title: k.title, keyValue: k.keyValue, validUntil: k.validUntil, lifetime: k.lifetime, category: k.category,
    icon: k.icon, color: k.color, note: k.note, pinned: k.pinned, order: k.order,
  })),
}

function algorithm(value: string): TOTPAccount["algorithm"] {
  return value === "SHA256" || value === "SHA512" ? value : "SHA1"
}

export const authenticator: LiveCollection<TOTPAccount> & Crud<TOTPAccount> = {
  ...liveCollection<TOTPAccount>(
    "authenticator",
    (id, d) => ({
      id,
      issuer: read.str(d, "issuer"),
      accountName: read.str(d, "accountName"),
      secret: read.str(d, "secret"),
      algorithm: algorithm(read.str(d, "algorithm", "SHA1")),
      digits: read.num(d, "digits", 6),
      period: read.num(d, "period", 30),
      otpType: read.str(d, "otpType", "totp") === "hotp" ? "hotp" : "totp",
      counter: read.num(d, "counter"),
      icon: { type: "lucide", value: "ShieldCheck" },
      color: read.str(d, "color", "#64748b"),
      pinned: read.bool(d, "pinned"),
      order: read.num(d, "order"),
      createdAt: read.millis(d, "createdAt"),
      updatedAt: read.millis(d, "updatedAt"),
    }),
    { orderByField: "order" },
  ),
  ...crud<TOTPAccount>("authenticator", "akun", (a) => ({
    issuer: a.issuer, accountName: a.accountName, secret: a.secret, algorithm: a.algorithm, digits: a.digits,
    period: a.period, otpType: a.otpType, counter: a.counter, icon: { type: "lucide", value: "ShieldCheck" },
    color: a.color, pinned: a.pinned, order: a.order,
  })),
}

const categoryRows = liveCollection<SavedCategory>("categories", (id, d) => {
  const createdAt = read.millis(d, "createdAt")
  return {
    id,
    label: read.str(d, "label") || id,
    icon: read.str(d, "icon") || "Tag",
    color: read.str(d, "color"),
    scopes: read.strings(d, "scopes") as CategoryScope[],
    order: read.num(d, "order"),
    createdAt,
    updatedAt: read.millis(d, "updatedAt", createdAt),
  }
})

/** True once the "already seeded" marker was read or written, so an empty list is taken at face value. */
const seededStore = createStore(false)
let seedCheck: string | null = null

function writeSeed(): Promise<void> | null {
  const col = userCollection("categories")
  const settings = settingsDoc()
  if (!db || !col || !settings) return null
  const batch = writeBatch(db)
  seedCategoryRows().forEach(({ id, createdAt: _c, updatedAt: _u, ...rest }) => batch.set(doc(col, id), { ...rest, ...stamps() }))
  batch.set(settings, { categoriesSeeded: true }, { merge: true })
  return batch.commit()
}

/**
 * Seeds an empty collection once per account. The marker lives on
 * `settings/{uid}` so deleting every category on purpose is respected.
 */
async function seedIfNeeded(): Promise<void> {
  const settings = settingsDoc()
  if (!settings || seedCheck === settings.id) return
  seedCheck = settings.id
  let already = false
  try {
    const snapshot = await getDoc(settings)
    already = snapshot.exists() && snapshot.data()?.categoriesSeeded === true
  } catch (error) {
    console.warn("Seed marker could not be read", error)
  }
  if (!already) {
    const task = writeSeed()
    if (task) report(task, "Menyiapkan kategori")
  }
  seededStore.set(true)
}

categoryRows.store.subscribe(() => {
  const state = categoryRows.store.get()
  if (state.status !== "ready") return
  if (state.value.length > 0) seededStore.set(true)
  else void seedIfNeeded()
})

function resolvedCategories(): SavedCategory[] {
  const state = categoryRows.store.get()
  const remote = state.status === "ready" ? state.value : []
  return categoriesWithFallback(remote, {
    loading: state.status === "loading",
    error: state.status === "failed",
    seeded: seededStore.get(),
  }).sort((a, b) => a.order - b.order)
}

export const categories = {
  /** What pickers and filters show: stored rows, or the built-in list while loading or on failure. */
  use: (): SavedCategory[] => {
    categoryRows.use()
    useStore(seededStore)
    return resolvedCategories()
  },
  useFailed: (): boolean => categoryRows.use().status === "failed",
  add: (label: string, scope: CategoryScope | null, iconName = "Tag", color = ""): string | null => {
    const col = userCollection("categories")
    const clean = label.trim()
    if (!col || !clean) return null
    const current = resolvedCategories()
    const id = uniqueCategoryId(current, slugifyCategory(clean))
    report(
      setDoc(doc(col, id), {
        label: clean, icon: iconName, color, scopes: scope ? [scope] : [], order: nextCategoryOrder(current), ...stamps(),
      }),
      "Menambah kategori",
    )
    return id
  },
  /** `set` + merge, because a row may still be a built-in default that was never written. */
  update: (id: string, patch: Partial<Pick<SavedCategory, "label" | "icon" | "color" | "scopes">>): void => {
    const col = userCollection("categories")
    if (col) report(setDoc(doc(col, id), { ...patch, ...touch() }, { merge: true }), "Memperbarui kategori")
  },
  remove: (id: string): void => {
    const col = userCollection("categories")
    const settings = settingsDoc()
    if (!col || !settings) return
    report(deleteDoc(doc(col, id)), "Menghapus kategori")
    setDoc(settings, { categoriesSeeded: true }, { merge: true }).catch((error: unknown) =>
      console.warn("Seed marker write failed", error),
    )
  },
  saveOrder: (moved: SavedCategory[]): void => {
    const col = userCollection("categories")
    if (!db || !col || moved.length === 0) return
    const batch = writeBatch(db)
    moved.forEach((item) => batch.set(doc(col, item.id), { order: item.order, ...touch() }, { merge: true }))
    report(batch.commit(), "Mengurutkan kategori")
  },
  restoreDefaults: (): void => {
    const task = writeSeed()
    if (task) report(task, "Memulihkan kategori bawaan")
  },
}
