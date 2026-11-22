import { useEffect, useMemo, useRef, useState } from "react"
import { colorPalettes } from "@/constants/colors"
import { jiraBaseUrl, notes, tasks } from "@/data/docs"
import { itemsOf } from "@/data/core"
import { isValidUrl, normalizeUrl } from "@/lib/format"
import { imageToDataUrl } from "@/lib/image"
import { gitlabMr, jiraKey, youtubeId } from "@/lib/noteContent"
import { useStore } from "@/lib/store"
import { Button, Chip, ColorPicker, FlatButton, SearchField, Segmented, Sheet, Tag, TextField } from "@/ui/components"
import { Icon } from "@/ui/icons"
import { toast } from "@/ui/toast"
import { DATE_FORMATS, createSaverEditor, formatDateStamp, type EditorState, type SaverEditor, type TapData } from "./core"
import type { EditorSession } from "./session"
import "./editor.css"

const emptyState: EditorState = {
  bold: false, italic: false, underline: false, strike: false, code: false, heading: 0, bullet: false, ordered: false, task: false,
  quote: false, codeBlock: false, callout: false, table: false, link: "", canUndo: false, canRedo: false,
}

const textColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#0ea5e9", "#6366f1", "#a855f7", "#ec4899"]
const highlightColors = ["#fef08a", "#fed7aa", "#fecaca", "#bbf7d0", "#bae6fd", "#ddd6fe"]
const calloutVariants = [["info", "Info"], ["warning", "Peringatan"], ["success", "Selesai"], ["idea", "Ide"]] as const
const codeLanguages = [
  ["", "Teks"], ["bash", "Bash"], ["json", "JSON"], ["javascript", "JavaScript"], ["typescript", "TypeScript"], ["kotlin", "Kotlin"],
  ["java", "Java"], ["python", "Python"], ["sql", "SQL"], ["xml", "HTML/XML"], ["css", "CSS"], ["php", "PHP"], ["go", "Go"],
  ["yaml", "YAML"], ["markdown", "Markdown"], ["diff", "Diff"], ["dart", "Dart"], ["dockerfile", "Dockerfile"],
] as const
const dateFormatLabels: Record<string, string> = {
  full: "Lengkap", "date-time": "Tanggal + jam", date: "Tanggal lengkap", "short-date-time": "Singkat + jam",
  "short-date": "Tanggal singkat", numeric: "Angka", time: "Jam + menit", "time-seconds": "Jam lengkap",
}
const tableOps = [
  ["colBefore", "Kolom kiri"], ["colAfter", "Kolom kanan"], ["rowBefore", "Baris atas"], ["rowAfter", "Baris bawah"], ["header", "Header"],
  ["merge", "Gabung/pisah"], ["deleteCol", "Hapus kolom"], ["deleteRow", "Hapus baris"], ["deleteTable", "Hapus tabel"],
] as const

type PromptKind = "link" | "youtube" | "jira" | "gitlab"
const prompts: Record<PromptKind, { title: string; label: string; placeholder: string; confirm: string }> = {
  link: { title: "Tautan", label: "URL", placeholder: "https://", confirm: "Pasang tautan" },
  youtube: { title: "Video YouTube", label: "URL video", placeholder: "https://youtu.be/...", confirm: "Sisipkan video" },
  jira: { title: "Tiket Jira", label: "Key atau URL tiket", placeholder: "ABC-123", confirm: "Sisipkan tiket" },
  gitlab: { title: "Merge request GitLab", label: "URL merge request", placeholder: "https://gitlab.com/grup/proyek/-/merge_requests/12", confirm: "Sisipkan MR" },
}

interface EditorHostProps {
  session: EditorSession
  placeholder: string
  /** "week:<id>" or "note:<id>", so a document cannot link to itself. */
  selfRef: string
  titleFirst?: boolean
  tintInk?: string
  onHtml?: (html: string) => void
}

export function EditorHost({ session, placeholder, selfRef, titleFirst, tintInk, onHtml }: EditorHostProps) {
  const mount = useRef<HTMLDivElement>(null)
  const editor = useRef<SaverEditor | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const [state, setState] = useState(emptyState)
  const [sheet, setSheet] = useState<"insert" | "style" | "ref" | null>(null)
  const [prompt, setPrompt] = useState<PromptKind | null>(null)
  const [tapped, setTapped] = useState<{ kind: string; data: TapData } | null>(null)
  const doc = useStore(session.doc)
  const status = useStore(session.status)
  const noteRows = itemsOf(notes.use())
  const entryRows = itemsOf(tasks.use())
  const onHtmlRef = useRef(onHtml)
  onHtmlRef.current = onHtml

  useEffect(() => {
    if (!mount.current) return
    const instance = createSaverEditor({
      element: mount.current,
      placeholder,
      onChange: (html, title) => {
        session.onLocalChange(html, title)
        onHtmlRef.current?.(html)
      },
      onState: setState,
      onTap: (kind, data) => {
        if (kind === "link") window.open(String(data.href ?? ""), "_blank", "noopener")
        else if (kind === "ref") location.hash = data.refType === "note" ? `#/notes/${String(data.refId)}` : `#/tasks/${String(data.refId)}`
        else setTapped({ kind, data })
      },
    })
    editor.current = instance
    const flush = () => instance.flush()
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", flush)
      instance.flush()
      instance.destroy()
      editor.current = null
    }
  }, [session, placeholder])

  useEffect(() => {
    if (!doc || !editor.current) return
    editor.current.setContent(doc.html)
    onHtmlRef.current?.(doc.html)
  }, [doc])

  const labels = useMemo(() => {
    const map: Record<string, string> = {}
    noteRows.forEach((note) => (map[`note:${note.id}`] = note.title || "Catatan tanpa judul"))
    entryRows.forEach((entry) => (map[`week:${entry.id}`] = entry.title || "Tanpa judul"))
    return map
  }, [noteRows, entryRows])
  useEffect(() => {
    if (doc && !session.dirty && !editor.current?.hasPending()) editor.current?.updateRefLabels(labels)
  }, [labels, doc, session])

  const run = (name: string, arg?: Record<string, unknown>) => editor.current?.run(name, arg)
  const insert = (type: string, attrs: Record<string, unknown>, inline: boolean) => run("insert", { type, attrs, inline })
  const closeSheet = () => setSheet(null)

  const submitPrompt = async (kind: PromptKind, value: string): Promise<string | null> => {
    if (kind === "link") {
      const url = normalizeUrl(value)
      if (!isValidUrl(url)) return "URL tidak valid."
      run("link", { href: url })
    } else if (kind === "youtube") {
      const id = youtubeId(value)
      if (!id) return "Ini bukan tautan video YouTube."
      insert("youtubeEmbed", { videoId: id }, false)
    } else if (kind === "jira") {
      const key = jiraKey(value)
      if (!key) return "Key tiket tidak dikenali. Contoh: ABC-123."
      const base = /^https?:\/\//i.test(value.trim()) ? "" : await jiraBaseUrl()
      insert("jiraTicket", { issueKey: key, url: /^https?:\/\//i.test(value.trim()) ? value.trim() : base ? `${base}/browse/${key}` : "" }, true)
    } else {
      const mr = gitlabMr(value)
      if (!mr) return "Tempel URL merge request lengkap dari GitLab."
      insert("gitlabMr", { ...mr, url: value.trim() }, true)
    }
    return null
  }

  return (
    <div className="editor-host">
      <div className="editor-bar brutal" role="toolbar" aria-label="Format teks">
        <FlatButton icon="Plus" label="Sisipkan" active onClick={() => setSheet("insert")} />
        <FlatButton icon="Type" label="Gaya teks, warna, dan blok" active={state.heading > 0 || state.quote || state.codeBlock} onClick={() => setSheet("style")} />
        <span className="editor-bar__sep" />
        <FlatButton icon="Bold" label="Tebal" active={state.bold} onClick={() => run("bold")} />
        <FlatButton icon="Italic" label="Miring" active={state.italic} onClick={() => run("italic")} />
        <FlatButton icon="Underline" label="Garis bawah" active={state.underline} onClick={() => run("underline")} />
        <FlatButton icon="Strikethrough" label="Coret" active={state.strike} onClick={() => run("strike")} />
        <span className="editor-bar__sep" />
        <FlatButton icon="ListChecks" label="Checklist" active={state.task} onClick={() => run("task")} />
        <FlatButton icon="List" label="Daftar butir" active={state.bullet} onClick={() => run("bullet")} />
        <FlatButton icon="ListOrdered" label="Daftar bernomor" active={state.ordered} onClick={() => run("ordered")} />
        <FlatButton icon="Link" label="Tautan" active={state.link !== ""} onClick={() => setPrompt("link")} />
        <span className="editor-bar__sep" />
        <FlatButton icon="Undo2" label="Urungkan" disabled={!state.canUndo} onClick={() => run("undo")} />
        <FlatButton icon="Redo2" label="Ulangi" disabled={!state.canRedo} onClick={() => run("redo")} />
      </div>
      {state.table && (
        <div className="chip-row" role="toolbar" aria-label="Tabel">
          {tableOps.map(([op, label]) => (
            <Button key={op} compact tone={op.startsWith("delete") ? "danger" : "neutral"} onClick={() => run("tableOp", { op })}>
              {label}
            </Button>
          ))}
        </div>
      )}
      <SaveBar session={session} status={status} />
      <div
        ref={mount}
        className="saver-editor"
        data-title-first={titleFirst ? "true" : "false"}
        data-tinted={tintInk ? "true" : "false"}
        style={tintInk ? { ["--tint-ink" as string]: tintInk } : undefined}
        onClick={(event) => {
          if (event.target === event.currentTarget) editor.current?.focus()
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (!file) return
          void imageToDataUrl(file).then((src) => (src ? run("image", { src }) : toast("Gambar tidak bisa dibaca atau terlalu besar untuk disimpan")))
        }}
      />

      {sheet === "insert" && (
        <Sheet title="Sisipkan" onClose={closeSheet}>
          <div className="insert-grid">
            {(
              [
                ["Tabel 3 x 3", "Table", () => run("table")],
                ["Gambar dari file", "Image", () => imageInput.current?.click()],
                ["Video YouTube", "SquarePlay", () => setPrompt("youtube")],
                ["Tiket Jira", "Ticket", () => setPrompt("jira")],
                ["Merge request GitLab", "GitMerge", () => setPrompt("gitlab")],
                ["Tautan ke task atau catatan", "FileSymlink", () => setSheet("ref")],
                ["Status badge", "Tag", () => insert("statusBadge", { label: "To Do", color: "#64748b" }, true)],
                ["Cap tanggal sekarang", "CalendarClock", () => insert("dateStamp", { timestamp: String(Date.now()), format: "full", showIcon: false, color: "#64748b" }, true)],
                ["Garis pembatas", "Minus", () => run("divider")],
              ] as const
            ).map(([label, icon, action]) => (
              <Button
                key={label}
                icon={icon}
                tone="neutral"
                block
                style={{ justifyContent: "flex-start" }}
                onClick={() => {
                  setSheet(null)
                  action()
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="field">
            <span className="field__label">Callout</span>
            <div className="chip-wrap">
              {calloutVariants.map(([variant, label]) => (
                <Chip key={variant} label={label} selected={false} onClick={() => { closeSheet(); run("callout", { variant }) }} />
              ))}
              {state.callout && <Chip label="Keluar dari callout" icon="LogOut" selected={false} onClick={() => { closeSheet(); run("calloutExit") }} />}
            </div>
          </div>
        </Sheet>
      )}
      {sheet === "style" && (
        <Sheet title="Gaya teks" onClose={closeSheet}>
          <Segmented
            label="Gaya paragraf"
            value={String(state.heading)}
            onChange={(level) => (level === "0" ? run("paragraph") : run("heading", { level: Number(level) }))}
            options={[{ value: "0", label: "Paragraf" }, { value: "1", label: "Judul 1" }, { value: "2", label: "Judul 2" }, { value: "3", label: "Judul 3" }]}
          />
          <div className="field">
            <span className="field__label">Blok</span>
            <div className="chip-wrap">
              <Chip label="Kutipan" icon="Quote" selected={state.quote} onClick={() => run("quote")} />
              <Chip label="Blok kode" icon="Braces" selected={state.codeBlock} onClick={() => run("codeBlock")} />
              <Chip label="Kode sebaris" icon="Code" selected={state.code} onClick={() => run("code")} />
            </div>
          </div>
          <div className="field">
            <span className="field__label">Perataan</span>
            <div className="row">
              <FlatButton icon="TextAlignStart" label="Rata kiri" onClick={() => run("align", { value: "left" })} />
              <FlatButton icon="TextAlignCenter" label="Rata tengah" onClick={() => run("align", { value: "center" })} />
              <FlatButton icon="TextAlignEnd" label="Rata kanan" onClick={() => run("align", { value: "right" })} />
            </div>
          </div>
          <Swatches label="Warna teks" colors={textColors} onPick={(value) => run("color", { value })} />
          <Swatches label="Sorotan" colors={highlightColors} onPick={(value) => run("highlight", { value })} />
          <div>
            <Button icon="RemoveFormatting" tone="neutral" onClick={() => { run("clear"); closeSheet() }}>
              Hapus semua format
            </Button>
          </div>
        </Sheet>
      )}
      {sheet === "ref" && (
        <RefPicker
          notes={noteRows.filter((note) => `note:${note.id}` !== selfRef).map((note) => ({ id: note.id, label: note.title || "Catatan tanpa judul" }))}
          entries={entryRows.filter((entry) => `week:${entry.id}` !== selfRef).map((entry) => ({ id: entry.id, label: entry.title || "Tanpa judul" }))}
          onClose={closeSheet}
          onPick={(refType, refId, label) => {
            closeSheet()
            insert("noteLink", { refType, refId, label }, true)
          }}
        />
      )}
      {prompt && (
        <PromptDialog
          kind={prompt}
          initial={prompt === "link" ? state.link : ""}
          allowRemove={prompt === "link" && state.link !== ""}
          onRemove={() => { run("link", { href: "" }); setPrompt(null) }}
          onClose={() => setPrompt(null)}
          onSubmit={async (value) => {
            const error = await submitPrompt(prompt, value)
            if (!error) setPrompt(null)
            return error
          }}
        />
      )}
      {tapped && (
        <NodeSheet
          kind={tapped.kind}
          data={tapped.data}
          onClose={() => setTapped(null)}
          onUpdate={(attrs) => { editor.current?.updateAt(tapped.data.pos ?? -1, attrs); setTapped(null) }}
          onDelete={() => { editor.current?.deleteAt(tapped.data.pos ?? -1); setTapped(null) }}
        />
      )}
    </div>
  )
}

function SaveBar({ session, status }: { session: EditorSession; status: ReturnType<EditorSession["status"]["get"]> }) {
  if (status.kind === "conflict") {
    return (
      <div className="brutal banner banner--accent" role="alert" style={{ flexWrap: "wrap", alignItems: "center" }}>
        <Icon name="TriangleAlert" />
        <p className="t-strong grow" style={{ minWidth: 200 }}>Perangkat lain menyimpan versi yang lebih baru saat kamu sedang mengetik.</p>
        <Button compact tone="neutral" onClick={() => session.useRemote()}>Pakai versi perangkat lain</Button>
        <Button compact onClick={() => session.overwrite()}>Timpa dengan versi ini</Button>
      </div>
    )
  }
  if (status.kind === "failed") {
    return (
      <div className="brutal banner" role="alert" style={{ alignItems: "center" }}>
        <Icon name="CloudOff" />
        <p className="grow">Belum tersimpan: {status.message}</p>
        <Button compact tone="neutral" icon="RefreshCw" onClick={() => session.retry()}>Coba lagi</Button>
      </div>
    )
  }
  if (status.kind === "missing") {
    return (
      <div className="brutal banner" role="alert">
        <Icon name="TriangleAlert" />
        <p>Dokumen ini sudah dihapus di perangkat lain, jadi perubahan tidak bisa disimpan.</p>
      </div>
    )
  }
  return (
    <p className="t-caption muted editor-status" role="status">
      {status.kind === "saving" ? "Menyimpan..." : status.kind === "saved" ? "Tersimpan" : "Disimpan otomatis saat kamu mengetik"}
    </p>
  )
}

function Swatches({ label, colors, onPick }: { label: string; colors: string[]; onPick: (hex: string) => void }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="chip-wrap">
        <Chip label="Tanpa" icon="Ban" selected={false} onClick={() => onPick("")} />
        {colors.map((hex) => (
          <button key={hex} type="button" className="swatch" style={{ background: hex, width: 40 }} aria-label={`${label} ${hex}`} title={hex} onClick={() => onPick(hex)} />
        ))}
      </div>
      <p className="field__hint">{label} berlaku untuk teks yang sedang dipilih.</p>
    </div>
  )
}

interface PromptProps {
  kind: PromptKind
  initial: string
  allowRemove: boolean
  onRemove: () => void
  onClose: () => void
  onSubmit: (value: string) => Promise<string | null>
}

function PromptDialog({ kind, initial, allowRemove, onRemove, onClose, onSubmit }: PromptProps) {
  const spec = prompts[kind]
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet title={spec.title} onClose={onClose} variant="center">
      <form
        className="col"
        onSubmit={(event) => {
          event.preventDefault()
          void onSubmit(value).then(setError)
        }}
      >
        <TextField label={spec.label} value={value} onChange={(next) => { setValue(next); setError(null) }} placeholder={spec.placeholder} error={error} autoFocus />
        {(kind === "jira" || kind === "gitlab") && (
          <p className="field__hint">Status tiket dan MR diperbarui oleh extension atau aplikasi Android. Browser tidak bisa memanggil API-nya langsung.</p>
        )}
        <div className="sheet__actions">
          {allowRemove && <Button compact tone="danger" onClick={onRemove}>Lepas</Button>}
          <Button compact tone="neutral" onClick={onClose}>Batal</Button>
          <Button compact type="submit" disabled={!value.trim()}>{spec.confirm}</Button>
        </div>
      </form>
    </Sheet>
  )
}

type RefRow = { id: string; label: string }

function RefPicker({ notes: noteRows, entries, onPick, onClose }: { notes: RefRow[]; entries: RefRow[]; onPick: (type: string, id: string, label: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const [type, setType] = useState<"week" | "note">("week")
  const rows = type === "week" ? entries : noteRows
  const shown = rows.filter((row) => row.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 50)
  return (
    <Sheet title="Tautkan task atau catatan" onClose={onClose}>
      <Segmented label="Jenis dokumen" value={type} onChange={setType} options={[{ value: "week", label: "Task mingguan" }, { value: "note", label: "Catatan" }]} />
      <SearchField value={query} onChange={setQuery} placeholder="Cari judul" shortcut={false} />
      {shown.length === 0 && <p className="muted">{rows.length === 0 ? "Belum ada yang bisa ditautkan." : "Tidak ada judul yang cocok."}</p>}
      {shown.map((row) => (
        <button key={row.id} type="button" className="brutal pressable list-row" style={{ ["--sh" as string]: "0px" }} onClick={() => onPick(type, row.id, row.label)}>
          <Icon name={type === "week" ? "CheckSquare" : "StickyNote"} />
          <span className="grow clamp-2 break t-strong">{row.label}</span>
        </button>
      ))}
    </Sheet>
  )
}

interface NodeSheetProps {
  kind: string
  data: TapData
  onClose: () => void
  onUpdate: (attrs: Record<string, unknown>) => void
  onDelete: () => void
}

function NodeSheet({ kind, data, onClose, onUpdate, onDelete }: NodeSheetProps) {
  const text = (key: string) => (data[key] === undefined || data[key] === null ? "" : String(data[key]))
  const [label, setLabel] = useState(text("label"))
  const [color, setColor] = useState(text("color") || colorPalettes[0].hex)
  const [format, setFormat] = useState(text("format") || "full")
  const [timestamp, setTimestamp] = useState(text("timestamp"))
  const remove = (
    <Button icon="Trash2" tone="danger" block onClick={onDelete}>
      Hapus dari dokumen
    </Button>
  )

  if (kind === "jira" || kind === "gitlab") {
    const isJira = kind === "jira"
    const url = text("url")
    return (
      <Sheet title={isJira ? text("issueKey") : `!${text("iid")}`} onClose={onClose}>
        <p className="break">{(isJira ? text("summary") : text("title")) || "Data belum dimuat. Buka dokumen ini di extension atau aplikasi Android untuk mengambilnya."}</p>
        <div className="row wrap gap-6">
          {isJira ? (
            <>
              {text("status") && <Tag text={text("status")} />}
              {text("priority") && <Tag text={`Prioritas ${text("priority")}`} />}
              {text("issueType") && <Tag text={text("issueType")} />}
              {text("assignee") && <Tag text={text("assignee")} icon="User" />}
            </>
          ) : (
            <>
              <Tag text={text("draft") === "true" ? "Draft" : text("state") || "unknown"} />
              {text("author") && <Tag text={text("author")} icon="User" />}
              {text("sourceBranch") && <Tag text={`${text("sourceBranch")} ke ${text("targetBranch")}`} icon="GitBranch" />}
            </>
          )}
        </div>
        {url && (
          <a className="brutal pressable btn btn--block" href={url} target="_blank" rel="noopener noreferrer">
            <Icon name="ExternalLink" size={18} />
            {isJira ? "Buka di Jira" : "Buka di GitLab"}
          </a>
        )}
        {remove}
      </Sheet>
    )
  }
  if (kind === "youtube") {
    return (
      <Sheet title="Video YouTube" onClose={onClose}>
        <a className="brutal pressable btn btn--block" href={`https://www.youtube.com/watch?v=${text("videoId")}`} target="_blank" rel="noopener noreferrer">
          <Icon name="ExternalLink" size={18} />
          Tonton di YouTube
        </a>
        {remove}
      </Sheet>
    )
  }
  if (kind === "status") {
    return (
      <Sheet title="Status badge" onClose={onClose}>
        <TextField label="Label" value={label} onChange={(value) => setLabel(value.slice(0, 40))} />
        <ColorPicker value={color} onChange={setColor} />
        <div className="sheet__actions">
          <Button tone="danger" onClick={onDelete}>Hapus</Button>
          <Button icon="Check" onClick={() => onUpdate({ label: label.trim() || "Status", color })}>Simpan</Button>
        </div>
      </Sheet>
    )
  }
  if (kind === "date") {
    return (
      <Sheet title="Cap tanggal" onClose={onClose}>
        <div className="field">
          <span className="field__label">Format</span>
          <div className="chip-wrap" role="radiogroup" aria-label="Format">
            {DATE_FORMATS.map((id) => (
              <Chip key={id} role="radio" label={dateFormatLabels[id] ?? id} selected={format === id} onClick={() => setFormat(id)} />
            ))}
          </div>
          <p className="field__hint">{formatDateStamp(Number(timestamp) || Date.now(), format)}</p>
        </div>
        <div>
          <Button icon="Clock" tone="neutral" onClick={() => setTimestamp(String(Date.now()))}>Setel ke waktu sekarang</Button>
        </div>
        <ColorPicker value={color} onChange={setColor} />
        <div className="sheet__actions">
          <Button tone="danger" onClick={onDelete}>Hapus</Button>
          <Button icon="Check" onClick={() => onUpdate({ format, color, timestamp })}>Simpan</Button>
        </div>
      </Sheet>
    )
  }
  return (
    <Sheet title="Bahasa blok kode" onClose={onClose}>
      <div className="chip-wrap" role="radiogroup" aria-label="Bahasa">
        {codeLanguages.map(([id, name]) => (
          <Chip key={id} role="radio" label={name} selected={id === text("language")} onClick={() => onUpdate({ language: id })} />
        ))}
      </div>
      <p className="muted">Tombol segitiga di kepala blok menciutkan atau membuka kodenya.</p>
      <Button icon="Trash2" tone="danger" block onClick={onDelete}>Hapus blok kode</Button>
    </Sheet>
  )
}
