import { doc, updateDoc } from "firebase/firestore"
import { createStore, useStore } from "@/lib/store"
import { normalizeWorkSettings, type WorkSettings } from "@/lib/workLogic"
import type { WorkTicket } from "@/types"
import { liveCollection, read, report, touch, userCollection } from "./core"

function category(value: string): WorkTicket["statusCategory"] {
  return value === "todo" || value === "indeterminate" || value === "done" ? value : "unknown"
}

/**
 * Mirror of the active Jira tickets, written by the extension and the Android
 * app when they sync. The web app only reads it and edits the personal
 * reminder, because a browser page cannot call the Jira API (CORS).
 */
export const workTickets = {
  ...liveCollection<WorkTicket>(
    "work",
    (id, d) => ({
      id,
      issueKey: read.str(d, "issueKey", id),
      summary: read.str(d, "summary"),
      status: read.str(d, "status"),
      statusCategory: category(read.str(d, "statusCategory")),
      issueType: read.str(d, "issueType"),
      labels: read.strings(d, "labels"),
      priority: read.str(d, "priority"),
      assignee: read.str(d, "assignee"),
      createdAtJira: read.num(d, "createdAtJira"),
      dueAt: read.numOrNull(d, "dueAt") || null,
      storyPoints: read.numOrNull(d, "storyPoints"),
      url: read.str(d, "url"),
      notifiedNew: read.bool(d, "notifiedNew"),
      reminderAt: read.numOrNull(d, "reminderAt") || null,
      reminderNote: read.str(d, "reminderNote"),
      syncedAt: read.num(d, "syncedAt"),
      createdAt: read.millis(d, "createdAt"),
      updatedAt: read.millis(d, "updatedAt"),
    }),
    { sub: "tickets" },
  ),
  setReminder(issueKey: string, reminderAt: number | null, note: string): void {
    const col = userCollection("work", "tickets")
    if (col) report(updateDoc(doc(col, issueKey), { reminderAt, reminderNote: reminderAt ? note : "", ...touch() }), "Menyimpan pengingat")
  },
}

/** Board layout is a device preference, kept in localStorage under the extension's key. */
const STORAGE_KEY = "saver_work_settings"

function readSettings(): WorkSettings {
  try {
    return normalizeWorkSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"))
  } catch {
    return normalizeWorkSettings(null)
  }
}

const settingsStore = createStore<WorkSettings>(readSettings())

export function useWorkSettings(): WorkSettings {
  return useStore(settingsStore)
}

export function saveWorkSettings(settings: WorkSettings): void {
  const clean = normalizeWorkSettings(settings)
  settingsStore.set(clean)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
  } catch (error) {
    console.warn("Work settings could not be saved", error)
  }
}
