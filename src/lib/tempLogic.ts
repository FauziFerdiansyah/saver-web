import { startOfDay } from "@/lib/week"
import type { TempItem, TempItemKind } from "@/types"

/** Saver Temp rules, ported from the extension's `lib/temp.ts` and Android's `TempLogic`. */

export const retentionOptions = [1, 3, 7, 14, 30, 0]
export const DEFAULT_RETENTION_DAYS = 7
export const PAGE_SIZE = 30
export const COLLAPSE_LINES = 12
export const COLLAPSE_CHARS = 700
const DAY_MS = 86_400_000

export const bubbleThemes: { id: string; label: string; light: string; dark: string }[] = [
  { id: "slate", label: "Netral", light: "", dark: "" },
  { id: "green", label: "Hijau", light: "#bbf7d0", dark: "#14532d" },
  { id: "blue", label: "Biru", light: "#bfdbfe", dark: "#1e3a5f" },
  { id: "violet", label: "Ungu", light: "#ddd6fe", dark: "#3b2a6b" },
  { id: "amber", label: "Amber", light: "#fde68a", dark: "#5a4310" },
]

export type Segment = { type: "text"; value: string } | { type: "code"; value: string; language: string }

type Keep = Pick<TempItem, "pinned" | "starred">

export function retentionLabel(days: number): string {
  return days <= 0 ? "Tanpa batas" : `${days} hari`
}

/** Pinned and starred messages are kept for good. */
export function isKept(item: Keep): boolean {
  return item.pinned || item.starred
}

export function expiresAtFor(retentionDays: number, kept: boolean, now = Date.now()): number | null {
  return kept || retentionDays <= 0 ? null : now + retentionDays * DAY_MS
}

/** Counted from when the message was written, so changing retention never resets the clock. */
export function restampExpiry(item: Keep & Pick<TempItem, "retentionDays" | "createdAt">, settingDays: number): number | null {
  if (isKept(item)) return null
  const days = item.retentionDays ?? settingDays
  return days <= 0 ? null : item.createdAt + days * DAY_MS
}

export function isExpired(item: Keep & Pick<TempItem, "expiresAt">, now = Date.now()): boolean {
  return item.expiresAt !== null && !isKept(item) && item.expiresAt <= now
}

export function remainingLabel(item: Keep & Pick<TempItem, "expiresAt">, now = Date.now()): string {
  if (isKept(item)) return "Disimpan permanen"
  if (item.expiresAt === null) return "Tanpa batas waktu"
  const left = item.expiresAt - now
  if (left <= 0) return "Kedaluwarsa"
  const days = Math.floor(left / DAY_MS)
  if (days >= 1) return `Hilang dalam ${days} hari`
  const hours = Math.floor(left / 3_600_000)
  if (hours >= 1) return `Hilang dalam ${hours} jam`
  return `Hilang dalam ${Math.max(1, Math.floor(left / 60_000))} menit`
}

/** Splits a message into text runs and fenced code blocks. */
export function parseSegments(content: string): Segment[] {
  const fence = /```([\w+#-]*)[ \t]*\r?\n([\s\S]*?)```/g
  const segments: Segment[] = []
  let last = 0
  for (const match of content.matchAll(fence)) {
    const before = content.slice(last, match.index)
    if (before.trim()) segments.push({ type: "text", value: before.replace(/\n+$/, "") })
    segments.push({ type: "code", value: match[2].replace(/\n$/, ""), language: match[1].trim() })
    last = match.index + match[0].length
  }
  const rest = content.slice(last)
  if (rest.trim()) segments.push({ type: "text", value: rest.replace(/^\n+/, "") })
  return segments.length ? segments : [{ type: "text", value: content }]
}

const strongHints = [
  /^\s*(?:import|export|from|const|let|var|function|class|def|public|private|package|using|#include)\b/m,
  /^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE)\b/im,
  /^\s*(?:npm|yarn|pnpm|npx|git|docker|kubectl|curl|sudo|apt|dnf|make|mvn|gradle)\s+\S+/m,
]
const weakHints = [/=>|;\s*$|\{\s*$|\}\s*$/m, /^\s*<\/?[a-z][\w-]*(?:\s|>)/m, /^\s*[\w-]+\s*:\s*[^\s].*;\s*$/m]

function isJsonLike(text: string): boolean {
  if (!text || !"[{".includes(text[0]) || !"]}".includes(text[text.length - 1])) return false
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

export function isTrackerLink(url: string): boolean {
  return /\/browse\/[A-Za-z][A-Za-z0-9]+-\d+/.test(url) || /^https?:\/\/[^/]+\/.+?\/-\/merge_requests\/\d+/.test(url)
}

/** A lone URL is a link, code-looking text is code, the rest is plain text. */
export function detectKind(raw: string): TempItemKind {
  const text = raw.trim()
  if (!text) return "text"
  const segments = parseSegments(text)
  if (segments.some((segment) => segment.type === "code")) return segments.length === 1 ? "code" : "text"
  if (/^https?:\/\/\S+$/i.test(text)) return isTrackerLink(text) ? "text" : "link"
  if (isJsonLike(text)) return "code"
  if (strongHints.some((hint) => hint.test(text))) return "code"
  const lines = text.split("\n")
  const weak = weakHints.filter((hint) => hint.test(text)).length
  const indented = lines.filter((line) => /^\s{2,}|\t/.test(line)).length
  if (weak >= 2) return "code"
  if (weak >= 1 && (lines.length > 1 || text.length > 60)) return "code"
  if (lines.length > 2 && indented >= 2) return "code"
  return "text"
}

export function guessLanguage(raw: string): string {
  const text = raw.trim()
  if (!text) return ""
  if (isJsonLike(text)) return "json"
  if (/^\s*(?:npm|yarn|pnpm|git|docker|kubectl|curl|sudo|apt|dnf|echo|cd|ls)\s/m.test(text)) return "bash"
  if (/^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/im.test(text)) return "sql"
  if (/^\s*(?:def|class)\s+\w+|^\s*from\s+\w+\s+import\b|print\(/m.test(text)) return "python"
  if (/\binterface\s+\w+|\btype\s+\w+\s*=|:\s*(?:string|number|boolean)\b/.test(text)) return "typescript"
  if (/\b(?:const|let|var|function)\b|=>/.test(text)) return "javascript"
  if (/^\s*<(?:!doctype|html|div|span|section|p|a)\b/im.test(text)) return "html"
  if (/^[.#]?[\w-]+\s*\{[^}]*:[^}]*\}/m.test(text)) return "css"
  if (/\bpackage\s+main\b|\bfunc\s+\w+\(/.test(text)) return "go"
  if (/\bpublic\s+(?:static\s+)?(?:void|class)\b/.test(text)) return "java"
  if (/<\?php|\$\w+\s*=/.test(text)) return "php"
  return ""
}

/** One-line preview used for reply quotes. */
export function previewOf(item: Pick<TempItem, "kind" | "content" | "caption" | "meta">, limit = 80): string {
  if (item.kind === "image") return item.caption.trim() || item.meta || "Gambar"
  const line = (item.content.split("\n").find((part) => part.trim()) ?? "").trim()
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line
}

export function shouldCollapse(item: Pick<TempItem, "kind" | "content">): boolean {
  if (item.kind === "image" || item.kind === "link") return false
  return item.content.split("\n").length > COLLAPSE_LINES || item.content.length > COLLAPSE_CHARS
}

export function dayLabel(ts: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS)
  if (diff === 0) return "Hari ini"
  if (diff === 1) return "Kemarin"
  const date = new Date(ts)
  if (diff >= 2 && diff <= 6) return new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(date)
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(date)
}

export function matchesQuery(item: Pick<TempItem, "kind" | "content" | "caption" | "meta">, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = item.kind === "image" ? `${item.meta} ${item.caption}` : `${item.content} ${item.meta} ${item.caption}`
  return haystack.toLowerCase().includes(needle)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** HTML for promoting a message into Saver Notes, keeping code blocks and images. */
export function toNoteHtml(item: Pick<TempItem, "kind" | "content" | "caption" | "meta">): string {
  const title = previewOf(item, 60) || "Dari Temp"
  let body: string
  if (item.kind === "image") {
    body = `<img src="${item.content}">${item.caption.trim() ? `<p>${escapeHtml(item.caption)}</p>` : ""}`
  } else if (item.kind === "link") {
    body = `<p><a href="${escapeHtml(item.content)}">${escapeHtml(item.content)}</a></p>`
  } else {
    body = parseSegments(item.content)
      .map((segment) =>
        segment.type === "code"
          ? `<pre><code${segment.language ? ` class="language-${segment.language}"` : ""}>${escapeHtml(segment.value)}</code></pre>`
          : segment.value.split("\n").map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
      )
      .join("")
    if (item.kind === "code" && !body.startsWith("<pre>")) body = `<pre><code>${escapeHtml(item.content)}</code></pre>`
  }
  return `<p>${escapeHtml(title)}</p>${body}`
}
