export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * Ink for text on a user-chosen fill: black or white, whichever reads better.
 * Between pure black and white one always reaches WCAG AA (worst case 4.58:1),
 * which the softer #141414 ink would miss on mid tones such as slate.
 */
export function contrastOn(hex: string): string {
  if (!isHexColor(hex)) return "#ffffff"
  return contrastRatio(hex, "#000000") >= contrastRatio(hex, "#ffffff") ? "#000000" : "#ffffff"
}

export function safeColor(hex: string | undefined, fallback = "#64748b"): string {
  return hex && isHexColor(hex) ? hex : fallback
}

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0
  } catch {
    return false
  }
}

/** Adds https:// to a bare domain so "github.com" is accepted the way a browser would. */
export function normalizeUrl(value: string): string {
  const text = value.trim()
  if (!text || /^https?:\/\//i.test(text)) return text
  return `https://${text}`
}

export function domainOf(url: string): string {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

export function faviconUrl(url: string, size = 64): string {
  try {
    const host = new URL(url.trim()).hostname
    return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=${size}` : ""
  } catch {
    return ""
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" })
const timeFormat = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false })

export function formatDate(ts: number): string {
  return dateFormat.format(new Date(ts))
}

export function formatTime(ts: number): string {
  return timeFormat.format(new Date(ts))
}

export function formatDateTime(ts: number): string {
  return `${formatDate(ts)} ${formatTime(ts)}`
}

export function formatRelative(ts: number, now = Date.now()): string {
  const diff = now - ts
  const minute = 60_000
  if (diff < minute) return "Baru saja"
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} menit lalu`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} jam lalu`
  if (diff < 7 * 24 * 60 * minute) return `${Math.floor(diff / (24 * 60 * minute))} hari lalu`
  return formatDate(ts)
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(ts: number, withTime = true): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, "0")
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return withTime ? `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` : date
}

export function fromLocalInput(value: string): number | null {
  if (!value) return null
  const ts = new Date(value.length === 10 ? `${value}T00:00` : value).getTime()
  return Number.isFinite(ts) ? ts : null
}

export function downloadText(filename: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
