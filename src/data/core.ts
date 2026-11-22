import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from "firebase/firestore"
import { authStore, currentUid, db } from "@/firebase"
import { createStore, useStore, type Store } from "@/lib/store"
import { toast } from "@/ui/toast"

/** Shared loading wrapper for every Firestore-backed list. */
export type Loadable<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "failed"; message: string }

export function itemsOf<T>(state: Loadable<T[]>): T[] {
  return state.status === "ready" ? state.value : []
}

export function describeFirestoreError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code
  if (code === "permission-denied") {
    return "Firestore menolak akses. Pastikan security rules proyek sudah di-deploy dan akun yang masuk benar."
  }
  if (code === "unavailable") return "Tidak ada koneksi ke Firestore. Periksa internet lalu coba lagi."
  return (error as Error | null)?.message || "Terjadi kesalahan saat membaca data."
}

/**
 * Writes are not awaited: with offline persistence the promise resolves only
 * once the server acknowledges, while the local cache (and every listener)
 * updates immediately. Failures are reported as a toast.
 */
export function report(task: Promise<unknown>, what: string): void {
  task.catch((error: unknown) => {
    console.error(`${what} failed`, error)
    toast(`${what} gagal: ${describeFirestoreError(error)}`)
  })
}

export function userCollection(root: string, sub = "items"): CollectionReference | null {
  const uid = currentUid()
  return db && uid ? collection(db, root, uid, sub) : null
}

export function settingsDoc(): DocumentReference | null {
  const uid = currentUid()
  return db && uid ? doc(db, "settings", uid) : null
}

export const stamps = () => ({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
export const touch = () => ({ updatedAt: serverTimestamp() })

type Raw = Record<string, unknown>

export const read = {
  str: (data: Raw, key: string, fallback = ""): string => (typeof data[key] === "string" ? (data[key] as string) : fallback),
  bool: (data: Raw, key: string): boolean => data[key] === true,
  num: (data: Raw, key: string, fallback = 0): number =>
    typeof data[key] === "number" && Number.isFinite(data[key]) ? (data[key] as number) : fallback,
  numOrNull: (data: Raw, key: string): number | null =>
    typeof data[key] === "number" && Number.isFinite(data[key]) ? (data[key] as number) : null,
  strings: (data: Raw, key: string): string[] =>
    Array.isArray(data[key]) ? (data[key] as unknown[]).filter((item): item is string => typeof item === "string") : [],
  /** Firestore Timestamp or epoch number to epoch ms. */
  millis: (data: Raw, key: string, fallback = Date.now()): number => {
    const value = data[key] as { toMillis?: () => number } | number | undefined
    if (typeof value === "number") return value
    if (value && typeof value.toMillis === "function") return value.toMillis()
    return fallback
  },
  map: (data: Raw, key: string): Raw | null =>
    data[key] && typeof data[key] === "object" && !Array.isArray(data[key]) ? (data[key] as Raw) : null,
}

export interface LiveCollection<T> {
  store: Store<Loadable<T[]>>
  use: () => Loadable<T[]>
  /** Current rows, empty while loading. Starts the listener if needed. */
  get: () => T[]
  retry: () => void
}

interface CollectionOptions<T> {
  sub?: string
  orderByField?: string
  sort?: (a: T, b: T) => number
}

/** One shared listener per collection for every screen that reads it; restarts when the account changes. */
export function liveCollection<T>(
  root: string,
  map: (id: string, data: Raw) => T,
  options: CollectionOptions<T> = {},
): LiveCollection<T> {
  const store = createStore<Loadable<T[]>>({ status: "loading" })
  let started = false
  let stop: (() => void) | null = null
  let listeningFor: string | null = null

  const listen = () => {
    const uid = currentUid()
    if (uid === listeningFor && stop) return
    stop?.()
    stop = null
    listeningFor = uid
    if (!db || !uid) {
      store.set({ status: "ready", value: [] })
      return
    }
    store.set({ status: "loading" })
    const ref = collection(db, root, uid, options.sub ?? "items")
    const source = options.orderByField ? query(ref, orderBy(options.orderByField)) : ref
    stop = onSnapshot(
      source,
      (snapshot) => {
        const rows = snapshot.docs.map((item: QueryDocumentSnapshot<DocumentData>) =>
          map(item.id, item.data({ serverTimestamps: "estimate" })),
        )
        if (options.sort) rows.sort(options.sort)
        store.set({ status: "ready", value: rows })
      },
      (error) => {
        console.error(`Query ${root} failed`, error)
        stop = null
        store.set({ status: "failed", message: describeFirestoreError(error) })
      },
    )
  }

  const start = () => {
    if (started) return
    started = true
    listen()
    authStore.subscribe(listen)
  }

  return {
    store,
    use: () => {
      start()
      return useStore(store)
    },
    get: () => {
      start()
      return itemsOf(store.get())
    },
    retry: () => {
      stop?.()
      stop = null
      listen()
    },
  }
}
