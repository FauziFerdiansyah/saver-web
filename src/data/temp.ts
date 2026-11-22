import { deleteDoc, doc, getDocs, limitToLast, onSnapshot, orderBy, query, setDoc, updateDoc } from "firebase/firestore"
import { useEffect, useState } from "react"
import { authStore } from "@/firebase"
import { useStore } from "@/lib/store"
import { expiresAtFor, isExpired, restampExpiry } from "@/lib/tempLogic"
import type { TempItem, TempItemKind, TempReply } from "@/types"
import { describeFirestoreError, read, report, stamps, touch, userCollection, type Loadable } from "./core"

type Raw = Record<string, unknown>

function kindOf(value: string): TempItemKind {
  return value === "code" || value === "image" || value === "link" ? value : "text"
}

function map(id: string, d: Raw): TempItem {
  const createdAt = read.millis(d, "createdAt")
  const reply = read.map(d, "replyTo")
  const preview = read.map(d, "preview")
  return {
    id,
    kind: kindOf(read.str(d, "kind")),
    content: read.str(d, "content"),
    meta: read.str(d, "meta"),
    caption: read.str(d, "caption"),
    replyTo: reply ? { id: read.str(reply, "id"), kind: kindOf(read.str(reply, "kind")), preview: read.str(reply, "preview") } : null,
    preview: preview
      ? { title: read.str(preview, "title"), description: read.str(preview, "description"), image: read.str(preview, "image"), domain: read.str(preview, "domain") }
      : null,
    previewCollapsed: read.bool(d, "previewCollapsed"),
    refs: [],
    pinned: read.bool(d, "pinned"),
    starred: read.bool(d, "starred"),
    retentionDays: read.numOrNull(d, "retentionDays"),
    expiresAt: read.numOrNull(d, "expiresAt"),
    createdAt,
    updatedAt: read.millis(d, "updatedAt", createdAt),
  }
}

/** Newest `limit` messages, oldest first, like a chat window. */
export function useTempPage(limit: number): Loadable<TempItem[]> {
  const auth = useStore(authStore)
  const uid = auth.status === "signedIn" ? auth.user.uid : null
  const [state, setState] = useState<Loadable<TempItem[]>>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const col = userCollection("temp")
    if (!col || !uid) {
      setState({ status: "ready", value: [] })
      return
    }
    return onSnapshot(
      query(col, orderBy("createdAt", "asc"), limitToLast(limit)),
      (snapshot) => setState({ status: "ready", value: snapshot.docs.map((item) => map(item.id, item.data({ serverTimestamps: "estimate" }))) }),
      (error) => {
        console.error("Query temp failed", error)
        setState({ status: "failed", message: describeFirestoreError(error) })
      },
    )
  }, [uid, limit, attempt])
  useEffect(() => {
    const retry = () => setAttempt((value) => value + 1)
    window.addEventListener("saver:temp-retry", retry)
    return () => window.removeEventListener("saver:temp-retry", retry)
  }, [])
  return state
}

export interface NewTempItem {
  kind: TempItemKind
  content: string
  meta: string
  caption: string
  replyTo: TempReply | null
  retentionOverride: number | null
  settingDays: number
}

export const temp = {
  retry: () => window.dispatchEvent(new Event("saver:temp-retry")),
  add(item: NewTempItem): string | null {
    const col = userCollection("temp")
    if (!col) return null
    const ref = doc(col)
    report(
      setDoc(ref, {
        kind: item.kind,
        content: item.content,
        meta: item.meta,
        caption: item.caption,
        replyTo: item.replyTo,
        preview: null,
        previewCollapsed: false,
        refs: [],
        pinned: false,
        starred: false,
        retentionDays: item.retentionOverride,
        expiresAt: expiresAtFor(item.retentionOverride ?? item.settingDays, false),
        ...stamps(),
      }),
      "Mengirim pesan",
    )
    return ref.id
  },
  update(id: string, patch: Raw): void {
    const col = userCollection("temp")
    if (col) report(updateDoc(doc(col, id), { ...patch, ...touch() }), "Memperbarui pesan")
  },
  remove(id: string): void {
    const col = userCollection("temp")
    if (col) report(deleteDoc(doc(col, id)), "Menghapus pesan")
  },
  /** Reads the whole collection, because paging never loads old expired messages. */
  async clearExpired(): Promise<number> {
    const col = userCollection("temp")
    if (!col) return 0
    const stale = (await getDocs(col)).docs.map((item) => map(item.id, item.data())).filter((item) => isExpired(item))
    stale.forEach((item) => report(deleteDoc(doc(col, item.id)), "Membersihkan pesan"))
    return stale.length
  },
  /** Re-stamps `expiresAt` on existing messages after the retention setting changes. */
  async applyRetention(settingDays: number): Promise<number> {
    const col = userCollection("temp")
    if (!col) return 0
    let changed = 0
    ;(await getDocs(col)).docs.forEach((snapshot) => {
      const item = map(snapshot.id, snapshot.data())
      const next = restampExpiry(item, settingDays)
      if (next !== item.expiresAt) {
        changed += 1
        report(updateDoc(doc(col, item.id), { expiresAt: next, ...touch() }), "Menerapkan retensi")
      }
    })
    return changed
  },
}
