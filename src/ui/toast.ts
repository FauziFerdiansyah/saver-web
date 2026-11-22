import { createStore } from "@/lib/store"

export interface ToastMessage {
  id: number
  text: string
  actionLabel?: string
  onAction?: () => void
}

export const toastStore = createStore<ToastMessage[]>([])
let nextId = 1

export function dismissToast(id: number): void {
  toastStore.set((list) => list.filter((item) => item.id !== id))
}

/** Shows a short message; with an action (e.g. "Batalkan") it stays a little longer. */
export function toast(text: string, actionLabel?: string, onAction?: () => void): void {
  const id = nextId++
  toastStore.set((list) => [...list.slice(-2), { id, text, actionLabel, onAction }])
  setTimeout(() => dismissToast(id), actionLabel ? 7000 : 3500)
}

export async function copyText(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${what} disalin`)
  } catch (error) {
    console.warn("Clipboard write failed", error)
    toast("Browser menolak akses clipboard. Salin secara manual.")
  }
}
