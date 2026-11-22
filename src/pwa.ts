import { createStore } from "@/lib/store"

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export interface InstallState {
  /** The browser offered an install prompt that has not been used yet. */
  available: boolean
  /** Running as an installed app (standalone window). */
  installed: boolean
  /** iOS Safari has no prompt; the user adds the app from the share menu. */
  ios: boolean
}

function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

export const installStore = createStore<InstallState>({ available: false, installed: isStandalone(), ios: isIos() })

let deferred: InstallPromptEvent | null = null

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault()
  deferred = event as InstallPromptEvent
  installStore.set((state) => ({ ...state, available: true }))
})

window.addEventListener("appinstalled", () => {
  deferred = null
  installStore.set((state) => ({ ...state, available: false, installed: true }))
})

/** Returns true when the user accepted the install. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null
  installStore.set((state) => ({ ...state, available: false }))
  await event.prompt()
  return (await event.userChoice).outcome === "accepted"
}

export const onlineStore = createStore(navigator.onLine)
window.addEventListener("online", () => onlineStore.set(true))
window.addEventListener("offline", () => onlineStore.set(false))

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return
  window.addEventListener("load", () => {
    // Relative URL and default scope, so it works from a GitHub Pages sub-path.
    navigator.serviceWorker.register("./sw.js").catch((error: unknown) => console.warn("Service worker registration failed", error))
  })
}
