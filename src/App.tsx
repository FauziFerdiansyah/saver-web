import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react"
import { itemsOf } from "@/data/core"
import { tasks } from "@/data/docs"
import { workTickets } from "@/data/work"
import { authStore, firebaseConfigured } from "@/firebase"
import { useStore } from "@/lib/store"
import { onlineStore } from "@/pwa"
import { checkReminders, type DueReminder } from "@/reminders"
import { VIEW_META, useSettings } from "@/settings"
import type { SaverView } from "@/types"
import { LoadingList, Toasts } from "@/ui/components"
import { Icon } from "@/ui/icons"
import { LoginScreen, SetupScreen } from "@/features/auth"
import { AuthenticatorScreen } from "@/features/authenticator"
import { BreadcrumbScreen } from "@/features/breadcrumb"
import { KeysScreen } from "@/features/keys"
import { LinksScreen } from "@/features/links"
import { SettingsScreen } from "@/features/settings"
import { ShareInbox } from "@/features/share"
import { TempScreen } from "@/features/temp"
import { WorkScreen } from "@/features/work"

// Notes and Tasks carry the TipTap editor, so they load on first use instead of with the app shell.
const NotesScreen = lazy(() => import("@/features/notes").then((module) => ({ default: module.NotesScreen })))
const TasksScreen = lazy(() => import("@/features/tasks").then((module) => ({ default: module.TasksScreen })))

/** One screen per tab. The order and default come from the user's settings. */
const screens: Record<SaverView, (rest: string[]) => ReactNode> = {
  links: () => <LinksScreen />,
  breadcrumb: () => <BreadcrumbScreen />,
  keys: () => <KeysScreen />,
  authenticator: () => <AuthenticatorScreen />,
  notes: (rest) => <NotesScreen noteId={rest[0]} />,
  tasks: (rest) => <TasksScreen entryId={rest[0]} />,
  temp: () => <TempScreen />,
  work: () => <WorkScreen />,
}

function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent)
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return route
}

export function App() {
  const auth = useStore(authStore)
  if (!firebaseConfigured) return <SetupScreen />
  if (auth.status === "loading") {
    return (
      <main className="gate" role="status" aria-label="Memuat Saver">
        <span className="brutal logo" style={{ width: 64, height: 64, alignSelf: "center" }}>
          <img src="./icons/logo.svg" alt="" width="44" height="44" style={{ width: 44, height: 44 }} />
        </span>
      </main>
    )
  }
  if (auth.status === "signedOut") {
    return (
      <>
        <LoginScreen />
        <Toasts />
      </>
    )
  }
  return <Shell />
}

/** Checks reminders on weekly tasks and Work tickets while the app is open. */
function ReminderWatcher() {
  const entries = itemsOf(tasks.use())
  const tickets = itemsOf(workTickets.use())
  const due = useRef<DueReminder[]>([])
  due.current = [
    ...entries.flatMap((entry) =>
      entry.reminders
        .filter((reminder) => !reminder.done)
        .map((reminder) => ({
          key: `task:${entry.id}:${reminder.id}:${reminder.dueAt}`,
          title: reminder.text || "Pengingat",
          body: entry.title || "Task mingguan",
          dueAt: reminder.dueAt,
          route: `#/tasks/${entry.id}`,
        })),
    ),
    ...tickets.flatMap((ticket) =>
      ticket.reminderAt
        ? [{ key: `work:${ticket.issueKey}:${ticket.reminderAt}`, title: `${ticket.issueKey}: ${ticket.summary}`, body: ticket.reminderNote || "Waktunya mengerjakan tiket ini", dueAt: ticket.reminderAt, route: "#/work" }]
        : [],
    ),
  ]
  useEffect(() => {
    const tick = () => checkReminders(due.current)
    const first = setTimeout(tick, 3000)
    const timer = setInterval(tick, 30_000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [])
  return null
}

function Shell() {
  const settings = useSettings()
  const route = useRoute()
  const online = useStore(onlineStore)
  const tabs = settings.tabOrder
  const inSettings = route[0] === "settings"
  const requested = route[0] as SaverView | undefined
  const current: SaverView = requested && requested in screens ? requested : settings.defaultView
  const title = inSettings ? "Pengaturan" : VIEW_META[current].label
  const activeTab = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    document.title = `${title} · Saver`
  }, [title])
  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: "nearest", inline: "center" })
  }, [current, inSettings])

  return (
    <div className="shell">
      <a className="brutal btn btn--compact skip-link" href="#konten">
        Lewati ke konten
      </a>
      <nav className="tabbar" aria-label="Tab Saver">
        <div className="rail__brand">
          <span className="brutal logo">
            <img src="./icons/logo.svg" alt="" width="30" height="30" />
          </span>
          <span className="t-title">Saver</span>
        </div>
        {tabs.map((view) => {
          const active = !inSettings && view === current
          return (
            <a key={view} ref={active ? activeTab : undefined} className="tab" href={`#/${view}`} aria-current={active ? "page" : undefined}>
              <Icon name={VIEW_META[view].icon} size={22} />
              <span className="tab__short">{VIEW_META[view].short}</span>
              <span className="tab__long">{VIEW_META[view].label}</span>
            </a>
          )
        })}
        <div className="rail__foot">
          <a className="tab" href="#/settings" aria-current={inSettings ? "page" : undefined}>
            <Icon name="Settings" size={22} />
            <span className="tab__long">Pengaturan</span>
          </a>
        </div>
      </nav>
      <header className="shell__top">
        <span className="brutal logo">
          <img src="./icons/logo.svg" alt="" width="30" height="30" />
        </span>
        <h1 className="t-display grow clip">{title}</h1>
        {inSettings ? (
          <a className="brutal pressable icon-btn settings-link" href={`#/${current}`} aria-label="Tutup pengaturan">
            <Icon name="X" />
          </a>
        ) : (
          <a className="brutal pressable icon-btn settings-link" href="#/settings" aria-label="Pengaturan">
            <Icon name="Settings" />
          </a>
        )}
      </header>
      <main className="shell__main" id="konten" tabIndex={-1}>
        {!online && (
          <div className="brutal banner offline" role="status">
            <Icon name="WifiOff" size={18} />
            <p className="t-caption">Offline. Perubahan disimpan di perangkat ini dan dikirim saat tersambung lagi.</p>
          </div>
        )}
        {inSettings ? <SettingsScreen section={route[1]} /> : <Suspense fallback={<LoadingList rows={3} />}>{screens[current](route.slice(1))}</Suspense>}
      </main>
      <ReminderWatcher />
      <ShareInbox />
      <Toasts />
    </div>
  )
}
