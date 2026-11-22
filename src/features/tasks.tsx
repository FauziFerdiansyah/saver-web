import { useEffect, useMemo, useRef, useState } from "react"
import { getRandomColor } from "@/constants/colors"
import { tasks } from "@/data/docs"
import { itemsOf } from "@/data/core"
import { EditorHost } from "@/editor/EditorHost"
import { EditorSession } from "@/editor/session"
import { contrastOn, downloadText, fromLocalInput, safeColor, toLocalInput } from "@/lib/format"
import { analyzeContent, plainText, summaryPrompt, toMarkdown, type ContentStats } from "@/lib/noteContent"
import { requestNotifications } from "@/reminders"
import { reminderPresets } from "@/lib/workLogic"
import {
  WEEKDAY_INITIALS,
  addWeeks,
  endOfWeek,
  formatDayRange,
  formatMonthGroup,
  formatReminderDate,
  formatWeekRange,
  formatWeekRangeLong,
  formatWeekRelative,
  getIsoWeekNumber,
  getIsoWeekYear,
  isCurrentWeek,
  monthLongName,
  monthMatrix,
  startOfWeek,
} from "@/lib/week"
import type { WeeklyEntry, WeeklyReminder } from "@/types"
import {
  Button,
  Chip,
  ColorPicker,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FlatButton,
  IconButton,
  LoadingList,
  SearchField,
  SectionTitle,
  Segmented,
  Sheet,
  Switch,
  Tag,
  TextArea,
  TextField,
} from "@/ui/components"
import { Icon } from "@/ui/icons"
import { copyText, toast } from "@/ui/toast"

const pageTints = ["", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#ede9fe", "#1e293b", "#3b1d2e", "#14342b"]

interface EntryRow {
  entry: WeeklyEntry
  stats: ContentStats
  text: string
  openReminders: number
}

function titleOf(entry: WeeklyEntry): string {
  return entry.title || "Tanpa judul"
}

export function TasksScreen({ entryId }: { entryId: string | undefined }) {
  const state = tasks.use()
  const [mode, setMode] = useState<"list" | "calendar">("list")
  const [query, setQuery] = useState("")
  const [tag, setTag] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [summarizing, setSummarizing] = useState(false)
  const [deleting, setDeleting] = useState<WeeklyEntry | null>(null)

  const all = itemsOf(state)
  const rows = useMemo<EntryRow[]>(
    () =>
      all.map((entry) => ({
        entry,
        stats: analyzeContent(entry.content),
        text: plainText(entry.content).toLowerCase(),
        openReminders: entry.reminders.filter((reminder) => !reminder.done).length,
      })),
    [all],
  )
  const tags = useMemo(() => [...new Set(all.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b)), [all])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter(
      (row) => (tag === null || row.entry.tags.includes(tag)) && (!needle || row.entry.title.toLowerCase().includes(needle) || row.text.includes(needle)),
    )
  }, [rows, query, tag])
  const pinned = visible.filter((row) => row.entry.pinned)
  const groups = useMemo(() => {
    const map = new Map<string, EntryRow[]>()
    visible.filter((row) => !row.entry.pinned).forEach((row) => {
      const label = formatMonthGroup(row.entry.weekStart)
      map.set(label, [...(map.get(label) ?? []), row])
    })
    return [...map.entries()]
  }, [visible])

  const open = (id: string) => {
    location.hash = `#/tasks/${id}`
  }
  /** Opens the task of the week containing `ts`, creating it first when the week is still empty. */
  const openWeek = (ts: number) => {
    const weekStart = startOfWeek(ts)
    const existing = all.find((entry) => startOfWeek(entry.weekStart) === weekStart)
    if (existing) {
      open(existing.id)
      return
    }
    const id = tasks.create({ weekStart, color: getRandomColor() })
    if (id) open(id)
    else toast("Task tidak bisa dibuat. Coba masuk ulang.")
  }
  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const card = (row: EntryRow) => (
    <EntryCard
      key={row.entry.id}
      row={row}
      current={row.entry.id === entryId}
      selecting={selecting}
      selected={selected.has(row.entry.id)}
      onToggle={() => toggleSelected(row.entry.id)}
      onPin={() => tasks.patch(row.entry.id, { pinned: !row.entry.pinned })}
      onDelete={() => setDeleting(row.entry)}
    />
  )

  return (
    <div className={`split ${entryId ? "split--detail" : "split--list"}`}>
      <div className="split__list">
        <div className="toolbar">
          <div className="grow">
            <Segmented label="Tampilan task" value={mode} onChange={setMode} options={[{ value: "list", label: "Daftar" }, { value: "calendar", label: "Kalender" }]} />
          </div>
          {mode === "list" && all.length > 0 && (
            <Button
              compact
              icon={selecting ? "X" : "ListChecks"}
              tone={selecting ? "accent" : "neutral"}
              onClick={() => {
                setSelecting(!selecting)
                setSelected(new Set())
              }}
            >
              {selecting ? "Batal" : "Rangkum"}
            </Button>
          )}
        </div>
        {selecting ? (
          <Button icon="Sparkles" block disabled={selected.size === 0} onClick={() => setSummarizing(true)}>
            Rangkum {selected.size} task
          </Button>
        ) : (
          <Button icon="CalendarPlus" block className="desktop-only" onClick={() => openWeek(Date.now())}>
            Task minggu ini
          </Button>
        )}

        {state.status === "loading" && <LoadingList grid={false} />}
        {state.status === "failed" && <ErrorState message={state.message} onRetry={tasks.retry} />}
        {state.status === "ready" && mode === "calendar" && <YearCalendar entries={all} onOpenWeek={openWeek} />}
        {state.status === "ready" && mode === "list" && all.length === 0 && (
          <EmptyState
            icon="CheckSquare"
            title="Belum ada task mingguan"
            body="Satu halaman per minggu untuk checklist, tabel, tiket Jira, dan merge request. Mulai dari minggu ini."
            actionLabel="Buat task minggu ini"
            actionIcon="CalendarPlus"
            onAction={() => openWeek(Date.now())}
          />
        )}
        {state.status === "ready" && mode === "list" && all.length > 0 && (
          <>
            <SearchField value={query} onChange={setQuery} placeholder="Cari judul atau isi task" />
            {tags.length > 0 && (
              <div className="chip-row" role="group" aria-label="Filter tag">
                <Chip label="Semua tag" selected={tag === null} onClick={() => setTag(null)} />
                {tags.map((item) => (
                  <Chip key={item} label={item} icon="Hash" selected={tag === item} onClick={() => setTag(tag === item ? null : item)} />
                ))}
              </div>
            )}
            {selecting && <p className="muted">Pilih task yang mau digabung menjadi satu prompt rangkuman.</p>}
            {visible.length === 0 && <EmptyState icon="SearchX" title="Tidak ada yang cocok" body="Tidak ada task untuk pencarian atau tag ini." />}
            {pinned.length > 0 && (
              <>
                <SectionTitle>Disematkan</SectionTitle>
                {pinned.map(card)}
              </>
            )}
            {groups.map(([label, list]) => (
              <section key={label} className="col">
                <SectionTitle>{label}</SectionTitle>
                {list.map(card)}
              </section>
            ))}
          </>
        )}
        {!selecting && (
          <button type="button" className="brutal pressable fab" aria-label="Task minggu ini" onClick={() => openWeek(Date.now())}>
            <Icon name="CalendarPlus" size={24} />
          </button>
        )}
      </div>
      <div className="split__detail">
        {entryId ? (
          <TaskEditor key={entryId} entryId={entryId} entry={all.find((item) => item.id === entryId)} loading={state.status === "loading"} onDelete={setDeleting} onOpen={open} />
        ) : (
          <div className="desktop-only">
            <EmptyState icon="CheckSquare" title="Pilih task" body="Pilih task di daftar sebelah kiri, atau buka task minggu ini." actionLabel="Task minggu ini" actionIcon="CalendarPlus" onAction={() => openWeek(Date.now())} />
          </div>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          title="Hapus task?"
          message={`"${titleOf(deleting)}" beserta isi dan pengingatnya akan dihapus dari semua perangkat.`}
          confirmLabel="Hapus"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            tasks.remove(deleting.id)
            toast("Task dihapus")
            if (deleting.id === entryId) location.hash = "#/tasks"
            setDeleting(null)
          }}
        />
      )}
      {summarizing && <SummarySheet entries={all.filter((entry) => selected.has(entry.id))} onClose={() => setSummarizing(false)} />}
    </div>
  )
}

interface EntryCardProps {
  row: EntryRow
  current: boolean
  selecting: boolean
  selected: boolean
  onToggle: () => void
  onPin: () => void
  onDelete: () => void
}

function EntryCard({ row, current, selecting, selected, onToggle, onPin, onDelete }: EntryCardProps) {
  const { entry, stats } = row
  const title = titleOf(entry)
  const body = (
    <>
      <span className="t-heading clamp-2 break">{title}</span>
      <span className="muted clip" style={{ display: "block" }}>
        Minggu {getIsoWeekNumber(entry.weekStart)} · {formatWeekRange(entry.weekStart, entry.weekEnd)} · {formatWeekRelative(entry.weekStart)}
      </span>
    </>
  )
  return (
    <article className="brutal item" aria-current={current ? "true" : undefined} style={{ ["--sh" as string]: "3px" }}>
      <div className="item__bar" style={{ background: safeColor(entry.color) }} />
      <div className="item__body">
        {selecting ? (
          <button type="button" style={{ textAlign: "left" }} onClick={onToggle}>
            {body}
          </button>
        ) : (
          <a href={`#/tasks/${entry.id}`} style={{ color: "inherit", textDecoration: "none" }}>
            {body}
          </a>
        )}
        {stats.checklistTotal > 0 && (
          <div className="row" style={{ marginTop: 4 }}>
            <progress className="progress grow" max={stats.checklistTotal} value={stats.checklistDone} aria-label="Checklist selesai" />
            <span className="t-caption">
              {stats.checklistDone}/{stats.checklistTotal}
            </span>
          </div>
        )}
        <div className="row wrap gap-6" style={{ marginTop: 4 }}>
          {isCurrentWeek(entry.weekStart) && <Tag text="Minggu ini" fill="#ffd23f" />}
          {stats.jiraCount > 0 && <Tag text={`Jira ${stats.jiraDone}/${stats.jiraCount}`} icon="Ticket" />}
          {stats.mrCount > 0 && <Tag text={`MR ${stats.mrMerged}/${stats.mrCount}`} icon="GitMerge" />}
          {row.openReminders > 0 && <Tag text={`${row.openReminders} pengingat`} icon="Bell" />}
          {entry.tags.map((item) => (
            <Tag key={item} text={item} icon="Hash" />
          ))}
        </div>
        <div className="item__actions">
          {selecting ? (
            <Switch checked={selected} onChange={onToggle} label={selected ? "Dipilih" : "Pilih"} />
          ) : (
            <>
              <span className="spacer" />
              <FlatButton icon="Pin" label={entry.pinned ? `Lepas sematan ${title}` : `Sematkan ${title}`} active={entry.pinned} onClick={onPin} />
              <FlatButton icon="Trash2" label={`Hapus ${title}`} danger onClick={onDelete} />
            </>
          )}
        </div>
      </div>
    </article>
  )
}

function YearCalendar({ entries, onOpenWeek }: { entries: WeeklyEntry[]; onOpenWeek: (ts: number) => void }) {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const byWeek = useMemo(() => new Map(entries.map((entry) => [startOfWeek(entry.weekStart), entry])), [entries])
  const thisWeek = startOfWeek(Date.now())
  return (
    <div className="col">
      <div className="row">
        <FlatButton icon="ChevronLeft" label="Tahun sebelumnya" onClick={() => setYear(year - 1)} />
        <h2 className="t-title grow" style={{ textAlign: "center" }}>{year}</h2>
        <FlatButton icon="ChevronRight" label="Tahun berikutnya" onClick={() => setYear(year + 1)} />
      </div>
      <p className="muted">Klik tanggal untuk membuka task minggu itu. Minggu yang kosong akan dibuatkan task baru.</p>
      <div className="calendar">
        {Array.from({ length: 12 }, (_, month) => (
          <section key={month} className="brutal calendar__month">
            <h3 className="t-heading">{monthLongName(month)}</h3>
            <div className="calendar__grid" aria-hidden="true">
              {WEEKDAY_INITIALS.map((initial, index) => (
                <span key={index} className="t-caption muted">{initial}</span>
              ))}
            </div>
            {monthMatrix(year, month).map((week, rowIndex) => (
              <div key={rowIndex} className="calendar__grid">
                {week.map((day, index) => {
                  if (day === null) return <span key={index} />
                  const ts = new Date(year, month, day).getTime()
                  const weekStart = startOfWeek(ts)
                  const entry = byWeek.get(weekStart)
                  const fill = entry ? safeColor(entry.color) : undefined
                  return (
                    <button
                      key={index}
                      type="button"
                      className={`calendar__day ${weekStart === thisWeek ? "calendar__day--now" : ""}`}
                      style={fill ? { background: fill, color: contrastOn(fill) } : undefined}
                      aria-label={`${day} ${monthLongName(month)} ${year}${entry ? `, ada task: ${entry.title}` : ", belum ada task"}`}
                      onClick={() => onOpenWeek(ts)}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

function SummarySheet({ entries, onClose }: { entries: WeeklyEntry[]; onClose: () => void }) {
  const [instruction, setInstruction] = useState("")
  const prompt = useMemo(
    () =>
      summaryPrompt(
        [...entries].sort((a, b) => a.weekStart - b.weekStart).map((entry) => ({ title: titleOf(entry), range: formatWeekRangeLong(entry.weekStart, entry.weekEnd), markdown: toMarkdown(entry.content) })),
        instruction,
      ),
    [entries, instruction],
  )
  return (
    <Sheet title="Prompt rangkuman" onClose={onClose} variant="wide">
      <p className="muted">Saver menyusun prompt dari task yang dipilih. Salin lalu tempel ke asisten AI yang kamu pakai.</p>
      <TextArea label="Instruksi (opsional)" value={instruction} onChange={setInstruction} placeholder="Kosongkan untuk instruksi bawaan" rows={2} />
      <pre className="brutal summary">{prompt}</pre>
      <div className="sheet__actions">
        <Button icon="Download" tone="neutral" onClick={() => downloadText("prompt-rangkuman.md", prompt, "text/markdown")}>Unduh</Button>
        <Button icon="Copy" onClick={() => void copyText(prompt, "Prompt").then(onClose)}>Salin prompt</Button>
      </div>
    </Sheet>
  )
}

interface TaskEditorProps {
  entryId: string
  entry: WeeklyEntry | undefined
  loading: boolean
  onDelete: (entry: WeeklyEntry) => void
  onOpen: (id: string) => void
}

function TaskEditor({ entryId, entry, loading, onDelete, onOpen }: TaskEditorProps) {
  const session = useMemo(() => new EditorSession((html, _title, rev) => tasks.save(entryId, { content: html }, rev)), [entryId])
  const [html, setHtml] = useState("")
  const [sheet, setSheet] = useState<"details" | "reminders" | null>(null)
  const seen = useRef(false)
  if (entry) seen.current = true

  useEffect(() => {
    if (entry) session.onRemote(entry.content, entry.rev, entry.lastDeviceId)
  }, [entry, session])

  if (!entry) {
    if (loading || !seen.current) return <LoadingList rows={3} grid={false} />
    return <ErrorState message="Task ini tidak ditemukan. Mungkin sudah dihapus di perangkat lain." />
  }
  const stats = analyzeContent(html)
  const openReminders = entry.reminders.filter((reminder) => !reminder.done).length
  const tint = entry.bgColor ? safeColor(entry.bgColor, "") : ""
  const tintInk = tint ? (contrastOn(tint) === "#ffffff" ? "#f8fafc" : "#141414") : ""

  const duplicate = () => {
    const id = tasks.create({
      weekStart: addWeeks(entry.weekStart, 1),
      content: html.replace(/data-checked="true"/g, 'data-checked="false"'),
      tags: entry.tags,
      color: entry.color,
      bgColor: entry.bgColor,
    })
    if (id) {
      setSheet(null)
      onOpen(id)
    } else toast("Task tidak bisa diduplikat")
  }

  return (
    <div className={`doc ${tint ? "doc--tinted" : ""}`}>
      <div className="doc__head">
        <a className="brutal pressable icon-btn split__back" href="#/tasks" aria-label="Kembali ke daftar task">
          <Icon name="ArrowLeft" />
        </a>
        <h2 className="t-title grow clamp-2 break">{titleOf(entry)}</h2>
        <FlatButton icon="Bell" label={`Pengingat, ${openReminders} aktif`} active={openReminders > 0} onClick={() => setSheet("reminders")} />
        <IconButton icon="SlidersHorizontal" label="Detail task" onClick={() => setSheet("details")} />
      </div>
      <p className="muted">
        Minggu {getIsoWeekNumber(entry.weekStart)} · {formatDayRange(entry.weekStart, entry.weekEnd)} · {formatWeekRelative(entry.weekStart)}
      </p>
      {(stats.checklistTotal > 0 || stats.jiraCount > 0 || stats.mrCount > 0 || entry.tags.length > 0) && (
        <div className="row wrap gap-6">
          {stats.checklistTotal > 0 && <Tag text={`Checklist ${stats.checklistDone}/${stats.checklistTotal}`} icon="ListChecks" />}
          {stats.jiraCount > 0 && <Tag text={`Jira ${stats.jiraDone}/${stats.jiraCount}`} icon="Ticket" />}
          {stats.mrCount > 0 && <Tag text={`MR ${stats.mrMerged}/${stats.mrCount}`} icon="GitMerge" />}
          {entry.tags.map((item) => (
            <Tag key={item} text={item} icon="Hash" />
          ))}
        </div>
      )}
      <div style={tint ? { ["--tint-bg" as string]: tint } : undefined} className="doc__page">
        <EditorHost
          session={session}
          placeholder="Tulis rencana minggu ini. Tombol + menyisipkan checklist, tabel, tiket Jira, dan lainnya."
          selfRef={`week:${entryId}`}
          tintInk={tintInk}
          onHtml={setHtml}
        />
      </div>
      {sheet === "details" && (
        <DetailsSheet
          entry={entry}
          onClose={() => setSheet(null)}
          onDuplicate={duplicate}
          onDelete={() => {
            setSheet(null)
            onDelete(entry)
          }}
          markdown={() => `# ${entry.title}\n\n${toMarkdown(html)}`}
        />
      )}
      {sheet === "reminders" && <RemindersSheet entry={entry} onClose={() => setSheet(null)} />}
    </div>
  )
}

interface DetailsProps {
  entry: WeeklyEntry
  onClose: () => void
  onDuplicate: () => void
  onDelete: () => void
  markdown: () => string
}

function DetailsSheet({ entry, onClose, onDuplicate, onDelete, markdown }: DetailsProps) {
  const [title, setTitle] = useState(entry.title)
  const [tag, setTag] = useState("")
  const patch = (data: Record<string, unknown>) => tasks.patch(entry.id, data)
  const setWeek = (weekStart: number) => patch({ weekStart, weekEnd: endOfWeek(weekStart) })
  const addTag = () => {
    const clean = tag.trim().replace(/^#/, "")
    if (clean && !entry.tags.includes(clean)) patch({ tags: [...entry.tags, clean] })
    setTag("")
  }
  return (
    <Sheet title="Detail task" onClose={onClose}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="grow">
          <TextArea label="Judul" value={title} onChange={setTitle} rows={2} />
        </div>
        <IconButton icon="Check" label="Simpan judul" primary disabled={title.trim() === entry.title || !title.trim()} onClick={() => patch({ title: title.trim() })} />
      </div>
      <div className="field">
        <span className="field__label">Minggu</span>
        <div className="row">
          <IconButton icon="ChevronLeft" label="Minggu sebelumnya" onClick={() => setWeek(addWeeks(entry.weekStart, -1))} />
          <div className="grow" style={{ textAlign: "center" }}>
            <p className="t-strong">Minggu {getIsoWeekNumber(entry.weekStart)} · {getIsoWeekYear(entry.weekStart)}</p>
            <p className="t-caption muted">{formatWeekRange(entry.weekStart, entry.weekEnd)}</p>
          </div>
          <IconButton icon="ChevronRight" label="Minggu berikutnya" onClick={() => setWeek(addWeeks(entry.weekStart, 1))} />
        </div>
        {!isCurrentWeek(entry.weekStart) && (
          <div>
            <Button compact icon="CalendarCheck" tone="neutral" onClick={() => setWeek(startOfWeek(Date.now()))}>Setel ke minggu ini</Button>
          </div>
        )}
      </div>
      <div className="field">
        <span className="field__label">Tag</span>
        {entry.tags.length > 0 && (
          <>
            <div className="chip-wrap">
              {entry.tags.map((item) => (
                <Chip key={item} label={item} icon="X" selected onClick={() => patch({ tags: entry.tags.filter((other) => other !== item) })} />
              ))}
            </div>
            <p className="field__hint">Klik tag untuk melepasnya.</p>
          </>
        )}
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="grow">
            <TextField
              label="Tag baru"
              value={tag}
              onChange={(value) => setTag(value.slice(0, 30))}
              placeholder="sprint-12"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addTag()
                }
              }}
            />
          </div>
          <IconButton icon="Plus" label="Tambah tag" disabled={!tag.trim()} onClick={addTag} />
        </div>
      </div>
      <ColorPicker value={entry.color} onChange={(color) => patch({ color })} label="Warna aksen" />
      <div className="field">
        <span className="field__label">Latar halaman</span>
        <div className="chip-wrap" role="radiogroup" aria-label="Latar halaman">
          {pageTints.map((hex) =>
            hex === "" ? (
              <Chip key="plain" role="radio" label="Polos" selected={entry.bgColor === ""} onClick={() => patch({ bgColor: "" })} />
            ) : (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={entry.bgColor === hex}
                aria-label={`Latar ${hex}`}
                className="swatch"
                style={{ background: hex, color: contrastOn(hex), width: 40 }}
                onClick={() => patch({ bgColor: hex })}
              >
                {entry.bgColor === hex && <Icon name="Check" />}
              </button>
            ),
          )}
        </div>
      </div>
      <Button icon="Pin" tone={entry.pinned ? "accent" : "neutral"} block onClick={() => patch({ pinned: !entry.pinned })}>
        {entry.pinned ? "Lepas sematan" : "Sematkan task"}
      </Button>
      <Button icon="CopyPlus" tone="neutral" block onClick={onDuplicate}>Duplikat ke minggu depan</Button>
      <Button icon="Copy" tone="neutral" block onClick={() => void copyText(markdown(), "Markdown")}>Salin sebagai markdown</Button>
      <Button icon="Trash2" tone="danger" block onClick={onDelete}>Hapus task</Button>
    </Sheet>
  )
}

function RemindersSheet({ entry, onClose }: { entry: WeeklyEntry; onClose: () => void }) {
  const [text, setText] = useState("")
  const [custom, setCustom] = useState(() => toLocalInput(Date.now() + 3_600_000))
  const save = (reminders: WeeklyReminder[]) => tasks.patch(entry.id, { reminders })
  const add = (dueAt: number) => {
    if (dueAt <= Date.now()) {
      toast("Waktu itu sudah lewat")
      return
    }
    save([...entry.reminders, { id: crypto.randomUUID(), text: text.trim() || "Pengingat", dueAt, done: false }])
    setText("")
    toast(`Pengingat dijadwalkan ${formatReminderDate(dueAt)}`)
    void requestNotifications()
  }
  return (
    <Sheet title="Pengingat" onClose={onClose}>
      {entry.reminders.length === 0 && <p className="muted">Belum ada pengingat untuk task ini.</p>}
      {[...entry.reminders].sort((a, b) => a.dueAt - b.dueAt).map((reminder) => {
        const late = !reminder.done && reminder.dueAt < Date.now()
        return (
          <div key={reminder.id} className="brutal order-row">
            <div className="grow">
              <Switch
                checked={reminder.done}
                onChange={() => save(entry.reminders.map((item) => (item.id === reminder.id ? { ...item, done: !item.done } : item)))}
                label={reminder.text || "Pengingat"}
                description={`${formatReminderDate(reminder.dueAt)}${late ? " · terlewat" : ""}${reminder.done ? " · selesai" : ""}`}
              />
            </div>
            <FlatButton icon="Trash2" label={`Hapus pengingat ${reminder.text}`} danger onClick={() => save(entry.reminders.filter((item) => item.id !== reminder.id))} />
          </div>
        )
      })}
      <TextField label="Pengingat baru" value={text} onChange={setText} placeholder="Contoh: kirim laporan sprint" />
      <div className="field">
        <span className="field__label">Ingatkan pada</span>
        <div className="chip-wrap">
          {reminderPresets().map((preset) => (
            <Chip key={preset.label} label={preset.label} selected={false} onClick={() => add(preset.at)} />
          ))}
        </div>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="grow">
            <TextField label="Tanggal dan jam" type="datetime-local" value={custom} onChange={setCustom} />
          </div>
          <IconButton icon="Plus" label="Tambah pengingat pada waktu ini" onClick={() => add(fromLocalInput(custom) ?? 0)} />
        </div>
        <p className="field__hint">Pengingat muncul sebagai notifikasi selama Saver terbuka di browser atau terpasang dan berjalan. Extension dan aplikasi Android juga menampilkannya.</p>
      </div>
    </Sheet>
  )
}
