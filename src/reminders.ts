import { toast } from "@/ui/toast"

/**
 * Reminders live in Firestore (weekly tasks and Work tickets). A browser has no
 * background alarm, so they are checked while Saver is open: a due reminder
 * shows a toast, plus a system notification when the user allowed it.
 */
export interface DueReminder {
  /** Stable per reminder and due time, so a rescheduled reminder fires again. */
  key: string
  title: string
  body: string
  dueAt: number
  /** Hash route to open when the notification is clicked. */
  route: string
}

const STORAGE_KEY = "saver_fired_reminders"
const WINDOW_MS = 12 * 60 * 60 * 1000

function readFired(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, number>
  } catch {
    return {}
  }
}

export async function requestNotifications(): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "default") return
  try {
    const result = await Notification.requestPermission()
    if (result === "denied") toast("Tanpa izin notifikasi, pengingat hanya terlihat di dalam Saver")
  } catch (error) {
    console.warn("Notification permission request failed", error)
  }
}

async function notify(reminder: DueReminder): Promise<void> {
  toast(`Pengingat: ${reminder.title}`, "Buka", () => {
    location.hash = reminder.route
  })
  if (!("Notification" in window) || Notification.permission !== "granted") return
  const options = { body: reminder.body, tag: reminder.key, icon: "./icons/icon-192.png", data: { route: reminder.route } }
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) await registration.showNotification(reminder.title, options)
    else new Notification(reminder.title, options)
  } catch (error) {
    console.warn("Notification could not be shown", error)
  }
}

/** Fires every reminder that became due in the last 12 hours and was not shown by this browser yet. */
export function checkReminders(reminders: DueReminder[], now = Date.now()): void {
  const fired = readFired()
  const due = reminders.filter((item) => item.dueAt <= now && item.dueAt > now - WINDOW_MS && !fired[item.key])
  if (due.length === 0) return
  due.forEach((item) => {
    fired[item.key] = now
    void notify(item)
  })
  const kept = Object.fromEntries(Object.entries(fired).filter(([, at]) => now - at < 2 * WINDOW_MS))
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept))
  } catch (error) {
    console.warn("Fired reminders could not be saved", error)
  }
}
