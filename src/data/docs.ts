import { deleteDoc, doc, getDoc, increment, runTransaction, setDoc, updateDoc, type DocumentReference } from "firebase/firestore"
import type { SaveOutcome } from "@/editor/session"
import { db } from "@/firebase"
import { getDeviceId, hasRevisionConflict, readRev } from "@/lib/sync"
import { defaultWeekTitle, endOfWeek, startOfWeek } from "@/lib/week"
import type { Note, WeeklyEntry, WeeklyReminder } from "@/types"
import { describeFirestoreError, liveCollection, read, report, settingsDoc, stamps, touch, userCollection } from "./core"

type Raw = Record<string, unknown>

/**
 * Saves a Note or weekly Task with the extension's revision protocol: a
 * transaction bumps `rev` and refuses to overwrite a newer revision written
 * by another device. Offline, it falls back to a blind increment.
 */
async function saveRevisioned(ref: DocumentReference, patch: Raw, expectedRev: number | undefined): Promise<SaveOutcome> {
  const deviceId = getDeviceId()
  if (!db) return { kind: "failed", message: "Firebase belum dikonfigurasi." }
  if (!navigator.onLine) {
    report(updateDoc(ref, { ...patch, rev: increment(1), lastDeviceId: deviceId, ...touch() }), "Menyimpan")
    return { kind: "saved", rev: (expectedRev ?? 0) + 1 }
  }
  try {
    return await runTransaction(db, async (tx): Promise<SaveOutcome> => {
      const snapshot = await tx.get(ref)
      if (!snapshot.exists()) return { kind: "missing" }
      const data = snapshot.data() as Raw
      const currentRev = readRev(data)
      const remoteDeviceId = read.str(data, "lastDeviceId")
      if (hasRevisionConflict({ currentRev, expectedRev, remoteDeviceId, deviceId })) {
        return { kind: "conflict", remoteRev: currentRev, remoteContent: read.str(data, "content") }
      }
      tx.update(ref, { ...patch, rev: currentRev + 1, lastDeviceId: deviceId, ...touch() })
      return { kind: "saved", rev: currentRev + 1 }
    })
  } catch (error) {
    console.error("Revisioned save failed", error)
    return { kind: "failed", message: describeFirestoreError(error) }
  }
}

function bump(): Raw {
  return { rev: increment(1), lastDeviceId: getDeviceId(), ...touch() }
}

export const notes = {
  ...liveCollection<Note>(
    "notes",
    (id, d) => ({
      id,
      title: read.str(d, "title"),
      content: read.str(d, "content"),
      pinned: read.bool(d, "pinned"),
      order: read.num(d, "order"),
      rev: read.num(d, "rev"),
      lastDeviceId: read.str(d, "lastDeviceId"),
      createdAt: read.millis(d, "createdAt"),
      updatedAt: read.millis(d, "updatedAt"),
    }),
    { sort: (a, b) => b.updatedAt - a.updatedAt },
  ),
  create(title = "", content = ""): string | null {
    const col = userCollection("notes")
    if (!col) return null
    const ref = doc(col)
    report(setDoc(ref, { title, content, pinned: false, order: 0, rev: 1, lastDeviceId: getDeviceId(), ...stamps() }), "Membuat catatan")
    return ref.id
  },
  save(id: string, title: string, content: string, expectedRev: number | undefined): Promise<SaveOutcome> {
    const col = userCollection("notes")
    if (!col) return Promise.resolve({ kind: "failed", message: "Belum masuk" })
    return saveRevisioned(doc(col, id), { title, content }, expectedRev)
  },
  setPinned(id: string, pinned: boolean): void {
    const col = userCollection("notes")
    if (col) report(updateDoc(doc(col, id), { pinned, ...bump() }), "Menyematkan catatan")
  },
  remove(id: string): void {
    const col = userCollection("notes")
    if (col) report(deleteDoc(doc(col, id)), "Menghapus catatan")
  },
}

function reminders(data: Raw): WeeklyReminder[] {
  const list = Array.isArray(data.reminders) ? (data.reminders as unknown[]) : []
  return list.flatMap((raw): WeeklyReminder[] => {
    if (!raw || typeof raw !== "object") return []
    const item = raw as Raw
    const id = read.str(item, "id")
    return id ? [{ id, text: read.str(item, "text"), dueAt: read.num(item, "dueAt"), done: read.bool(item, "done") }] : []
  })
}

export interface NewEntry {
  weekStart: number
  title?: string
  content?: string
  tags?: string[]
  color?: string
  bgColor?: string
}

export const tasks = {
  /** Legacy docs without week bounds fall back to the week of `createdAt`, as in the extension. */
  ...liveCollection<WeeklyEntry>(
    "tasks",
    (id, d) => {
      const createdAt = read.millis(d, "createdAt")
      const weekStart = read.numOrNull(d, "weekStart") ?? startOfWeek(createdAt)
      return {
        id,
        title: read.str(d, "title"),
        content: read.str(d, "content"),
        weekStart,
        weekEnd: read.numOrNull(d, "weekEnd") ?? endOfWeek(weekStart),
        tags: read.strings(d, "tags"),
        color: read.str(d, "color", "#64748b"),
        bgColor: read.str(d, "bgColor"),
        pinned: read.bool(d, "pinned"),
        order: read.num(d, "order"),
        reminders: reminders(d),
        linkedEntryIds: read.strings(d, "linkedEntryIds"),
        linkedNoteIds: read.strings(d, "linkedNoteIds"),
        rev: read.num(d, "rev"),
        lastDeviceId: read.str(d, "lastDeviceId"),
        createdAt,
        updatedAt: read.millis(d, "updatedAt", createdAt),
      }
    },
    { sort: (a, b) => b.weekStart - a.weekStart || b.updatedAt - a.updatedAt },
  ),
  create(entry: NewEntry): string | null {
    const col = userCollection("tasks")
    if (!col) return null
    const ref = doc(col)
    const start = startOfWeek(entry.weekStart)
    const end = endOfWeek(start)
    report(
      setDoc(ref, {
        title: entry.title ?? defaultWeekTitle(start, end),
        content: entry.content ?? "",
        weekStart: start,
        weekEnd: end,
        tags: entry.tags ?? [],
        color: entry.color ?? "#64748b",
        bgColor: entry.bgColor ?? "",
        pinned: false,
        order: 0,
        reminders: [],
        linkedEntryIds: [],
        linkedNoteIds: [],
        rev: 1,
        lastDeviceId: getDeviceId(),
        ...stamps(),
      }),
      "Membuat task",
    )
    return ref.id
  },
  save(id: string, patch: Raw, expectedRev: number | undefined): Promise<SaveOutcome> {
    const col = userCollection("tasks")
    if (!col) return Promise.resolve({ kind: "failed", message: "Belum masuk" })
    return saveRevisioned(doc(col, id), patch, expectedRev)
  },
  /** Meta edits (pin, tags, colours, reminders) bump the revision without the conflict check. */
  patch(id: string, patch: Raw): void {
    const col = userCollection("tasks")
    if (col) report(updateDoc(doc(col, id), { ...patch, ...bump() }), "Memperbarui task")
  },
  remove(id: string): void {
    const col = userCollection("tasks")
    if (col) report(deleteDoc(doc(col, id)), "Menghapus task")
  },
}

/** Jira base URL from the synced API Key Usage setting, used to build links for tickets inserted by key. */
export async function jiraBaseUrl(): Promise<string> {
  const ref = settingsDoc()
  if (!ref) return ""
  try {
    const usage = read.map((await getDoc(ref)).data() ?? {}, "apiKeyUsage")
    const jira = usage ? read.map(usage, "jira") : null
    return jira ? read.str(jira, "baseUrl").trim().replace(/\/+$/, "") : ""
  } catch (error) {
    console.warn("API Key Usage could not be read", error)
    return ""
  }
}
