import { createStore, useStore } from "@/lib/store"
import { sha256Hex } from "@/lib/format"
import type { SaverView } from "@/types"

export type ThemeMode = "system" | "light" | "dark"

export const ALL_VIEWS: SaverView[] = ["links", "keys", "authenticator", "notes", "tasks", "work", "breadcrumb", "temp"]

export const VIEW_META: Record<SaverView, { label: string; short: string; icon: string }> = {
  links: { label: "Links", short: "Links", icon: "Link2" },
  keys: { label: "Keys", short: "Keys", icon: "KeyRound" },
  authenticator: { label: "Authenticator", short: "Auth", icon: "ShieldCheck" },
  notes: { label: "Notes", short: "Notes", icon: "StickyNote" },
  tasks: { label: "Tasks", short: "Tasks", icon: "CheckSquare" },
  work: { label: "Work", short: "Work", icon: "Briefcase" },
  breadcrumb: { label: "Breadcrumb", short: "Breadcrumb", icon: "Footprints" },
  temp: { label: "Temp", short: "Temp", icon: "MessagesSquare" },
}

/** Device-local preferences, like the extension's localStorage and Android's DataStore. */
export interface LocalSettings {
  theme: ThemeMode
  defaultView: SaverView
  tabOrder: SaverView[]
  keysPassword: string | null
  requirePasswordOnCopy: boolean
  requirePasswordOnEdit: boolean
  requirePasswordOnDelete: boolean
  tempRetentionDays: number
  tempBubbleTheme: string
  tempFontSize: number
  tempEnterSends: boolean
  breadcrumbGrouped: boolean
}

const STORAGE_KEY = "saver_user_settings"
const THEME_KEY = "saver_theme"

const defaults: LocalSettings = {
  theme: "system",
  defaultView: "links",
  tabOrder: [...ALL_VIEWS],
  keysPassword: null,
  requirePasswordOnCopy: true,
  requirePasswordOnEdit: true,
  requirePasswordOnDelete: true,
  tempRetentionDays: 7,
  tempBubbleTheme: "slate",
  tempFontSize: 15,
  tempEnterSends: true,
  breadcrumbGrouped: false,
}

/** Drops unknown ids and duplicates, then appends any view that is missing. */
export function normalizeTabOrder(order: unknown): SaverView[] {
  const list = Array.isArray(order) ? (order as SaverView[]).filter((view) => ALL_VIEWS.includes(view)) : []
  const unique = Array.from(new Set(list))
  ALL_VIEWS.forEach((view) => {
    if (!unique.includes(view)) unique.push(view)
  })
  return unique
}

function read(): LocalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<LocalSettings>) : {}
    const merged = { ...defaults, ...parsed }
    merged.tabOrder = normalizeTabOrder(merged.tabOrder)
    if (!ALL_VIEWS.includes(merged.defaultView)) merged.defaultView = "links"
    if (!["system", "light", "dark"].includes(merged.theme)) merged.theme = "system"
    merged.tempFontSize = Math.min(Math.max(Math.round(Number(merged.tempFontSize) || 15), 12), 18)
    return merged
  } catch (error) {
    console.warn("Settings could not be read, using defaults", error)
    return { ...defaults }
  }
}

export const settingsStore = createStore<LocalSettings>(read())

export function applyTheme(mode: ThemeMode): void {
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.dataset.theme = dark ? "dark" : "light"
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#131417" : "#F6F1E7")
}

export function updateSettings(patch: Partial<LocalSettings>): void {
  const next = { ...settingsStore.get(), ...patch }
  settingsStore.set(next)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    localStorage.setItem(THEME_KEY, next.theme)
  } catch (error) {
    console.warn("Settings could not be saved", error)
  }
  if (patch.theme) applyTheme(next.theme)
}

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(settingsStore.get().theme))

export function useSettings(): LocalSettings {
  return useStore(settingsStore)
}

/** Stores the SHA-256 hash, the same scheme the extension and Android use. Null removes the password. */
export async function setKeysPassword(password: string | null): Promise<void> {
  updateSettings({ keysPassword: password ? await sha256Hex(password) : null })
}

export async function verifyKeysPassword(input: string): Promise<boolean> {
  const hash = settingsStore.get().keysPassword
  return !hash || hash === (await sha256Hex(input))
}

export function moveTab(view: SaverView, direction: -1 | 1): void {
  const order = [...settingsStore.get().tabOrder]
  const index = order.indexOf(view)
  const target = index + direction
  if (index < 0 || target < 0 || target >= order.length) return
  order.splice(index, 1)
  order.splice(target, 0, view)
  updateSettings({ tabOrder: order })
}
