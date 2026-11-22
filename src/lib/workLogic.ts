import { monthShortName, startOfDay } from "@/lib/week"
import type { WorkTicket } from "@/types"

/** Saver Work board rules, ported from the extension's `lib/work.ts` and Android's `WorkLogic`. */

export interface WorkStatCard {
  id: string
  label: string
  icon: string
  color: string
  kind: "preset" | "status" | "jql"
  preset: string
  statuses: string[]
  jql: string
}

export interface WorkColumn {
  id: string
  label: string
  icon: string
  color: string
  statuses: string[]
  catchOverdue: boolean
  fallback: boolean
}

export interface WorkSettings {
  jql: string
  activeStatuses: string[]
  larkWebhookUrl: string
  larkEnabled: boolean
  refreshMinutes: number
  statCards: WorkStatCard[]
  columns: WorkColumn[]
}

export interface CardPreset {
  id: string
  label: string
  help: string
  icon: string
  color: string
}

export const DEFAULT_JQL = "assignee = currentUser() ORDER BY created DESC"
export const MAX_STAT_CARDS = 7

export const defaultActiveStatuses = ["To Do", "Backlog", "In Progress", "Ready to Code Review", "Code Review", "Block", "Blocked", "Overdue", "Overdue Dev"]
export const overdueStatuses = ["Overdue", "Overdue Dev", "Overdue QA"]
export const statusCatalog = [
  "To Do", "Backlog", "In Progress", "Block", "Blocked", "Ready to Code Review", "Code Review", "Ready to SIT", "SIT", "Ready to QA", "QA",
  "Overdue QA", "Ready to UAT", "UAT", "Overdue", "Overdue Dev", "Ready to Deploy", "Deployed", "Done", "Cancelled",
]
export const workIconChoices = [
  "AlertTriangle", "CalendarDays", "Timer", "CircleDashed", "Hourglass", "Briefcase", "Target", "Eye", "ClipboardCheck", "ListChecks",
  "Bug", "FlaskConical", "ShieldCheck", "Rocket", "Truck", "CheckCircle2", "Ban", "Pause", "Flame", "Sparkles",
]
export const cardPresets: CardPreset[] = [
  { id: "overdue", label: "Overdue", help: "Due date sudah lewat, atau status termasuk Overdue", icon: "AlertTriangle", color: "#f43f5e" },
  { id: "due_today", label: "Due hari ini", help: "Due date tepat hari ini", icon: "CalendarDays", color: "#f59e0b" },
  { id: "due_soon", label: "Due ≤3 hari", help: "Due date 1–3 hari ke depan", icon: "Hourglass", color: "#eab308" },
  { id: "no_due", label: "Tanpa due", help: "Tiket tanpa due date", icon: "CircleDashed", color: "#64748b" },
  { id: "total", label: "Total aktif", help: "Semua tiket yang tersimpan di papan", icon: "Briefcase", color: "#0ea5e9" },
  { id: "no_points", label: "Tanpa story point", help: "Story point masih kosong", icon: "Target", color: "#8b5cf6" },
]
export const columnTemplates = [
  { label: "SIT", icon: "FlaskConical", color: "#06b6d4", statuses: ["Ready to SIT", "SIT"] },
  { label: "QA", icon: "Bug", color: "#14b8a6", statuses: ["Ready to QA", "QA", "Overdue QA"] },
  { label: "UAT", icon: "ClipboardCheck", color: "#6366f1", statuses: ["Ready to UAT", "UAT"] },
  { label: "Deploy", icon: "Rocket", color: "#22c55e", statuses: ["Ready to Deploy", "Deployed"] },
  { label: "Done", icon: "CheckCircle2", color: "#10b981", statuses: ["Done"] },
  { label: "Cancelled", icon: "Ban", color: "#94a3b8", statuses: ["Cancelled"] },
]

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

export function presetOf(id: string): CardPreset {
  return cardPresets.find((item) => item.id === id) ?? cardPresets[4]
}

export function presetCard(presetId: string, id = newId("card")): WorkStatCard {
  const meta = presetOf(presetId)
  return { id, label: meta.label, icon: meta.icon, color: meta.color, kind: "preset", preset: meta.id, statuses: [], jql: "" }
}

export function statusCard(label = "Status baru", icon = "ListChecks", color = "#0ea5e9", statuses: string[] = [], id = newId("card")): WorkStatCard {
  return { id, label, icon, color, kind: "status", preset: "total", statuses, jql: "" }
}

export function newColumn(label = "Kolom baru", icon = "CircleDashed", color = "#64748b", statuses: string[] = []): WorkColumn {
  return { id: newId("col"), label, icon, color, statuses, catchOverdue: false, fallback: false }
}

export function defaultColumns(): WorkColumn[] {
  return [
    { id: "col_overdue", label: "Overdue", icon: "AlertTriangle", color: "#f43f5e", statuses: [...overdueStatuses], catchOverdue: true, fallback: false },
    { id: "col_todo", label: "To Do", icon: "CircleDashed", color: "#64748b", statuses: ["To Do", "Backlog"], catchOverdue: false, fallback: true },
    { id: "col_in_progress", label: "In Progress", icon: "Timer", color: "#3b82f6", statuses: ["In Progress"], catchOverdue: false, fallback: false },
    { id: "col_review", label: "Review", icon: "Eye", color: "#a855f7", statuses: ["Ready to Code Review", "Code Review"], catchOverdue: false, fallback: false },
    { id: "col_block", label: "Block", icon: "Ban", color: "#f97316", statuses: ["Block", "Blocked"], catchOverdue: false, fallback: false },
  ]
}

export function defaultStatCards(): WorkStatCard[] {
  return [
    presetCard("overdue", "card_overdue"),
    presetCard("due_today", "card_due_today"),
    statusCard("In Progress", "Timer", "#3b82f6", ["In Progress"], "card_in_progress"),
    statusCard("Review", "Eye", "#a855f7", ["Ready to Code Review", "Code Review"], "card_review"),
    statusCard("Block", "Ban", "#f97316", ["Block", "Blocked"], "card_block"),
    presetCard("no_due", "card_no_due"),
  ]
}

export function defaultWorkSettings(): WorkSettings {
  return {
    jql: DEFAULT_JQL,
    activeStatuses: [...defaultActiveStatuses],
    larkWebhookUrl: "",
    larkEnabled: false,
    refreshMinutes: 30,
    statCards: defaultStatCards(),
    columns: defaultColumns(),
  }
}

/** Trims, drops blanks and case-insensitive duplicates. */
export function normalizeStrings(raw: unknown): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of Array.isArray(raw) ? raw : []) {
    if (typeof item !== "string") continue
    const clean = item.trim()
    if (!clean || seen.has(clean.toLowerCase())) continue
    seen.add(clean.toLowerCase())
    out.push(clean)
  }
  return out
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

/** Accepts anything read from storage and returns a complete, valid settings object. */
export function normalizeWorkSettings(raw: unknown): WorkSettings {
  const base = defaultWorkSettings()
  if (!raw || typeof raw !== "object") return base
  const data = raw as Record<string, unknown>
  const cards = Array.isArray(data.statCards) ? (data.statCards as Record<string, unknown>[]) : null
  const columns = Array.isArray(data.columns) ? (data.columns as Record<string, unknown>[]) : null
  const active = normalizeStrings(data.activeStatuses)
  const refresh = typeof data.refreshMinutes === "number" && Number.isFinite(data.refreshMinutes) ? data.refreshMinutes : base.refreshMinutes
  return {
    jql: text(data.jql).trim() || DEFAULT_JQL,
    activeStatuses: active.length ? active : base.activeStatuses,
    larkWebhookUrl: text(data.larkWebhookUrl).trim(),
    larkEnabled: data.larkEnabled === true,
    refreshMinutes: Math.min(Math.max(Math.round(refresh), 0), 240),
    statCards: cards
      ? cards.slice(0, MAX_STAT_CARDS).map((card) => ({
          id: text(card.id) || newId("card"),
          label: text(card.label).trim(),
          icon: text(card.icon, "ListChecks"),
          color: text(card.color, "#0ea5e9"),
          kind: card.kind === "status" || card.kind === "jql" ? card.kind : "preset",
          preset: text(card.preset, "total"),
          statuses: normalizeStrings(card.statuses),
          jql: text(card.jql),
        }))
      : base.statCards,
    columns: columns
      ? columns.map((column) => ({
          id: text(column.id) || newId("col"),
          label: text(column.label).trim(),
          icon: text(column.icon, "CircleDashed"),
          color: text(column.color, "#64748b"),
          statuses: normalizeStrings(column.statuses),
          catchOverdue: column.catchOverdue === true,
          fallback: column.fallback === true,
        }))
      : base.columns,
  }
}

export function statusInList(status: string, list: string[]): boolean {
  const needle = status.trim().toLowerCase()
  return list.some((item) => item.trim().toLowerCase() === needle)
}

export function isOverdueStatus(status: string): boolean {
  return overdueStatuses.includes(status)
}

export function daysUntilDue(dueAt: number | null | undefined, now = Date.now()): number | null {
  if (!dueAt) return null
  return Math.round((startOfDay(dueAt) - startOfDay(now)) / 86_400_000)
}

/** Due today is not past due. */
export function isPastDue(dueAt: number | null | undefined, now = Date.now()): boolean {
  return (daysUntilDue(dueAt, now) ?? 0) < 0
}

type TicketFacts = Pick<WorkTicket, "status" | "dueAt" | "storyPoints" | "createdAtJira">

export function isUrgent(ticket: Pick<WorkTicket, "status" | "dueAt">, now = Date.now()): boolean {
  return isOverdueStatus(ticket.status) || isPastDue(ticket.dueAt, now)
}

/** Late, an overdue status, or due today: everything that needs a decision before the day ends. */
export function needsAttention(ticket: Pick<WorkTicket, "status" | "dueAt">, now = Date.now()): boolean {
  return isUrgent(ticket, now) || daysUntilDue(ticket.dueAt, now) === 0
}

/**
 * Status match wins first, so a Block or Review ticket stays in its own
 * column past its due date. Only tickets bound for the fallback column, or
 * with no column at all, are pulled into the overdue-catching column when late.
 * Null means no column can hold the ticket.
 */
export function assignColumn(ticket: Pick<WorkTicket, "status" | "dueAt">, columns: WorkColumn[], now = Date.now()): string | null {
  const late = isUrgent(ticket, now)
  const overdueColumn = columns.find((column) => column.catchOverdue)
  const byStatus = columns.find((column) => statusInList(ticket.status, column.statuses))
  if (byStatus) {
    if (late && overdueColumn && byStatus.fallback && overdueColumn.id !== byStatus.id) return overdueColumn.id
    return byStatus.id
  }
  if (late && overdueColumn) return overdueColumn.id
  return columns.find((column) => column.fallback)?.id ?? null
}

/** Tickets per column id, sorted by due date then newest Jira creation. */
export function groupByColumn<T extends TicketFacts>(tickets: T[], columns: WorkColumn[], now = Date.now()): Map<string, T[]> {
  const grouped = new Map<string, T[]>(columns.map((column) => [column.id, []]))
  for (const ticket of tickets) {
    const id = assignColumn(ticket, columns, now)
    if (id) grouped.get(id)?.push(ticket)
  }
  grouped.forEach((list) =>
    list.sort((a, b) => (a.dueAt || Number.MAX_SAFE_INTEGER) - (b.dueAt || Number.MAX_SAFE_INTEGER) || b.createdAtJira - a.createdAtJira),
  )
  return grouped
}

/** JQL cards are counted by Jira, never locally. */
export function cardMatches(card: WorkStatCard, ticket: TicketFacts, now = Date.now()): boolean {
  if (card.kind === "jql") return false
  if (card.kind === "status") return statusInList(ticket.status, card.statuses)
  const days = daysUntilDue(ticket.dueAt, now)
  switch (card.preset) {
    case "overdue":
      return isUrgent(ticket, now)
    case "due_today":
      return days === 0
    case "due_soon":
      return days !== null && days >= 1 && days <= 3
    case "no_due":
      return !ticket.dueAt
    case "no_points":
      return ticket.storyPoints === null
    case "total":
      return true
    default:
      return false
  }
}

export function describeCard(card: WorkStatCard): string {
  if (card.kind === "jql") return card.jql.trim() ? "Dihitung langsung dari Jira" : "JQL masih kosong"
  if (card.kind === "status") return card.statuses.length ? card.statuses.join(", ") : "Belum ada status dipilih"
  return presetOf(card.preset).help
}

export function dueLabel(dueAt: number | null | undefined, now = Date.now()): string {
  const days = daysUntilDue(dueAt, now)
  if (days === null || !dueAt) return "Tanpa due"
  if (days < 0) return `Lewat ${-days} hari`
  if (days === 0) return "Due hari ini"
  if (days === 1) return "Due besok"
  if (days <= 3) return `Due ${days} hari lagi`
  const date = new Date(dueAt)
  return `Due ${date.getDate()} ${monthShortName(date.getMonth())} ${date.getFullYear()}`
}

/** Accent colour for a ticket's status. */
export function statusColor(status: string): string {
  if (/block/i.test(status)) return "#f97316"
  if (status === "In Progress") return "#3b82f6"
  if (status === "Ready to Code Review" || status === "Code Review") return "#a855f7"
  if (overdueStatuses.includes(status)) return "#f43f5e"
  return "#64748b"
}

/** Lucide icon + colour for a Jira priority, matching the extension's `priorityPresentation()`. */
export function priorityIcon(priority: string): { icon: string; color: string } {
  const value = priority.trim().toLowerCase()
  if (/highest|critical|blocker|p0|p1/.test(value)) return { icon: "ChevronsUp", color: "#f43f5e" }
  if (/high|major|p2/.test(value)) return { icon: "ChevronUp", color: "#f43f5e" }
  if (/medium|normal|p3/.test(value)) return { icon: "Equal", color: "#f97316" }
  if (/lowest|trivial|p5/.test(value)) return { icon: "ChevronsDown", color: "#3b82f6" }
  if (/low|minor|p4/.test(value)) return { icon: "ChevronDown", color: "#3b82f6" }
  return { icon: "Flag", color: "#64748b" }
}

/** Quick "work on this at" choices; options already in the past are dropped. */
export function reminderPresets(now = Date.now()): { label: string; at: number }[] {
  const clock = (dayOffset: number, hour: number) => {
    const date = new Date(startOfDay(now))
    date.setDate(date.getDate() + dayOffset)
    date.setHours(hour, 0, 0, 0)
    return date.getTime()
  }
  return [
    { label: "30 menit", at: now + 30 * 60_000 },
    { label: "1 jam", at: now + 60 * 60_000 },
    { label: "3 jam", at: now + 180 * 60_000 },
    { label: "Jam 13:00", at: clock(0, 13) },
    { label: "Jam 16:00", at: clock(0, 16) },
    { label: "Besok 09:00", at: clock(1, 9) },
  ].filter((preset) => preset.at > now)
}
