import { describe, expect, it } from "vitest"
import {
  DEFAULT_JQL,
  MAX_STAT_CARDS,
  assignColumn,
  cardMatches,
  defaultColumns,
  dueLabel,
  isPastDue,
  needsAttention,
  newColumn,
  normalizeWorkSettings,
  presetCard,
  reminderPresets,
  statusCard,
} from "./workLogic"

const at = (date: string, hour = 12) => new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`).getTime()
const now = at("2026-08-05")
const ticket = (status: string, due?: string, points: number | null = 1) => ({ status, dueAt: due ? at(due) : null, storyPoints: points, createdAtJira: 0 })
const columns = defaultColumns()

describe("workLogic", () => {
  it("lets a status match win over lateness", () => {
    expect(assignColumn(ticket("Block", "2026-08-01"), columns, now)).toBe("col_block")
    expect(assignColumn(ticket("Code Review", "2026-08-01"), columns, now)).toBe("col_review")
  })

  it("moves late fallback tickets to the overdue column", () => {
    expect(assignColumn(ticket("To Do", "2026-08-01"), columns, now)).toBe("col_overdue")
    expect(assignColumn(ticket("Unknown status", "2026-08-01"), columns, now)).toBe("col_overdue")
    expect(assignColumn(ticket("Unknown status"), columns, now)).toBe("col_todo")
  })

  it("does not treat due today as late", () => {
    expect(assignColumn(ticket("To Do", "2026-08-05"), columns, now)).toBe("col_todo")
    expect(isPastDue(at("2026-08-05"), now)).toBe(false)
    expect(needsAttention(ticket("To Do", "2026-08-05"), now)).toBe(true)
    expect(dueLabel(at("2026-08-05"), now)).toBe("Due hari ini")
    expect(dueLabel(at("2026-08-03"), now)).toBe("Lewat 2 hari")
  })

  it("hides a ticket no column can hold", () => {
    expect(assignColumn(ticket("To Do"), [newColumn("QA", "Bug", "#14b8a6", ["QA"])], now)).toBeNull()
  })

  it("counts preset and status cards", () => {
    expect(cardMatches(presetCard("overdue"), ticket("Overdue Dev"), now)).toBe(true)
    expect(cardMatches(presetCard("due_today"), ticket("To Do", "2026-08-05"), now)).toBe(true)
    expect(cardMatches(presetCard("due_soon"), ticket("To Do", "2026-08-08"), now)).toBe(true)
    expect(cardMatches(presetCard("due_soon"), ticket("To Do", "2026-08-09"), now)).toBe(false)
    expect(cardMatches(presetCard("no_due"), ticket("To Do"), now)).toBe(true)
    expect(cardMatches(presetCard("no_points"), ticket("To Do", undefined, null), now)).toBe(true)
    expect(cardMatches({ ...statusCard(), kind: "jql" }, ticket("To Do"), now)).toBe(false)
    expect(cardMatches(statusCard("x", "Eye", "#000000", ["code review"]), ticket("Code Review"), now)).toBe(true)
  })

  it("normalizes stored settings", () => {
    const clean = normalizeWorkSettings({
      jql: "  ",
      refreshMinutes: 999,
      statCards: Array.from({ length: 10 }, () => presetCard("total")),
      activeStatuses: [" To Do ", "to do", ""],
    })
    expect(clean.jql).toBe(DEFAULT_JQL)
    expect(clean.refreshMinutes).toBe(240)
    expect(clean.statCards).toHaveLength(MAX_STAT_CARDS)
    expect(clean.activeStatuses).toEqual(["To Do"])
    expect(normalizeWorkSettings(null).columns).toHaveLength(5)
  })

  it("drops reminder presets that are already past", () => {
    const labels = reminderPresets(at("2026-08-05", 17)).map((preset) => preset.label)
    expect(labels).not.toContain("Jam 13:00")
    expect(labels).toContain("Besok 09:00")
  })
})
