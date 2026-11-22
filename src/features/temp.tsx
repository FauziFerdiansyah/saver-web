import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { notes } from "@/data/docs"
import { temp, useTempPage } from "@/data/temp"
import { contrastOn, domainOf, formatTime } from "@/lib/format"
import { imageToDataUrl } from "@/lib/image"
import { contentTitle } from "@/lib/noteContent"
import {
  COLLAPSE_LINES,
  PAGE_SIZE,
  bubbleThemes,
  dayLabel,
  detectKind,
  guessLanguage,
  isExpired,
  isKept,
  matchesQuery,
  parseSegments,
  previewOf,
  remainingLabel,
  restampExpiry,
  retentionLabel,
  retentionOptions,
  shouldCollapse,
  toNoteHtml,
} from "@/lib/tempLogic"
import { updateSettings, useSettings } from "@/settings"
import type { TempItem } from "@/types"
import { Button, Chip, ConfirmDialog, EmptyState, ErrorState, FlatButton, IconButton, SearchField, Sheet, TextArea } from "@/ui/components"
import { Icon } from "@/ui/icons"
import { copyText, toast } from "@/ui/toast"

type Filter = "all" | "pinned" | "starred" | "code" | "image" | "link"
const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "Semua" },
  { id: "pinned", label: "Disematkan" },
  { id: "starred", label: "Berbintang" },
  { id: "code", label: "Kode" },
  { id: "image", label: "Gambar" },
  { id: "link", label: "Tautan" },
]

function metaFor(kind: TempItem["kind"], content: string): string {
  if (kind === "code") return guessLanguage(content)
  if (kind === "link") return domainOf(content)
  return ""
}

export function TempScreen() {
  const settings = useSettings()
  const [limit, setLimit] = useState(PAGE_SIZE)
  const state = useTempPage(limit)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [draft, setDraft] = useState("")
  const [replyTo, setReplyTo] = useState<TempItem | null>(null)
  const [retentionOverride, setRetentionOverride] = useState<number | null>(null)
  const [pickingRetention, setPickingRetention] = useState(false)
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; name: string } | null>(null)
  const [actions, setActions] = useState<TempItem | null>(null)
  const [editing, setEditing] = useState<TempItem | null>(null)
  const [deleting, setDeleting] = useState<TempItem | null>(null)
  const [clearing, setClearing] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const swept = useRef(false)
  const stickToBottom = useRef(true)

  const all = state.status === "ready" ? state.value : []
  const filtering = query.trim() !== "" || filter !== "all"

  // Expired messages of the loaded page are deleted once per visit; the full sweep is the explicit "Bersihkan".
  useEffect(() => {
    if (swept.current || all.length === 0) return
    swept.current = true
    all.filter((item) => isExpired(item)).forEach((item) => temp.remove(item.id))
  }, [all])

  const groups = useMemo(() => {
    const visible = all.filter((item) => {
      if (!matchesQuery(item, query)) return false
      if (filter === "pinned") return item.pinned
      if (filter === "starred") return item.starred
      if (filter === "code") return item.kind === "code" || parseSegments(item.content).some((segment) => segment.type === "code")
      if (filter === "image") return item.kind === "image"
      if (filter === "link") return item.kind === "link"
      return true
    })
    const out: { label: string; items: TempItem[] }[] = []
    visible.forEach((item) => {
      const label = dayLabel(item.createdAt)
      const last = out[out.length - 1]
      if (last?.label === label) last.items.push(item)
      else out.push({ label, items: [item] })
    })
    return out
  }, [all, query, filter])

  const newestId = all[all.length - 1]?.id
  useLayoutEffect(() => {
    if (stickToBottom.current && newestId) window.scrollTo({ top: document.documentElement.scrollHeight })
  }, [newestId])
  useEffect(() => {
    const onScroll = () => {
      stickToBottom.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const reply = () => (replyTo ? { id: replyTo.id, kind: replyTo.kind, preview: previewOf(replyTo) } : null)
  const afterSend = () => {
    setDraft("")
    setReplyTo(null)
    setRetentionOverride(null)
    setPendingImage(null)
    stickToBottom.current = true
  }
  const send = () => {
    const content = draft.trim()
    if (pendingImage) {
      temp.add({ kind: "image", content: pendingImage.dataUrl, meta: pendingImage.name, caption: content, replyTo: reply(), retentionOverride, settingDays: settings.tempRetentionDays })
      afterSend()
      return
    }
    if (!content) return
    const kind = detectKind(content)
    temp.add({ kind, content, meta: metaFor(kind, content), caption: "", replyTo: reply(), retentionOverride, settingDays: settings.tempRetentionDays })
    afterSend()
  }
  const attach = async (file: File) => {
    const dataUrl = await imageToDataUrl(file)
    if (dataUrl) setPendingImage({ dataUrl, name: file.name || "gambar" })
    else toast("Gambar tidak bisa dibaca atau terlalu besar")
  }
  const keep = (item: TempItem, patch: Partial<Pick<TempItem, "pinned" | "starred" | "retentionDays">>) =>
    temp.update(item.id, { ...patch, expiresAt: restampExpiry({ ...item, ...patch }, settings.tempRetentionDays) })

  const theme = bubbleThemes.find((item) => item.id === settings.tempBubbleTheme) ?? bubbleThemes[0]

  return (
    <div className="screen screen--narrow chat" style={{ ["--chat-size" as string]: `${settings.tempFontSize}px` }}>
      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Cari di Temp" />
        <IconButton icon="Eraser" label="Bersihkan pesan kedaluwarsa" onClick={() => setClearing(true)} />
      </div>
      <div className="chip-row" role="group" aria-label="Filter pesan">
        {filters.map((item) => (
          <Chip key={item.id} label={item.label} selected={filter === item.id} onClick={() => setFilter(item.id)} />
        ))}
      </div>

      <div className="chat__list">
        {state.status === "loading" && (
          <div className="skeleton" role="status" aria-label="Memuat pesan">
            {[55, 80, 60, 75].map((width, index) => (
              <div key={index} className="skeleton__card" style={{ width: `${width}%`, marginLeft: "auto" }}>
                <div className="skeleton__lines">
                  <div className="bone" style={{ width: "80%" }} />
                  {index % 2 === 1 && <div className="bone" style={{ width: "50%" }} />}
                </div>
              </div>
            ))}
          </div>
        )}
        {state.status === "failed" && <ErrorState message={state.message} onRetry={temp.retry} />}
        {state.status === "ready" && all.length === 0 && (
          <EmptyState
            icon="MessagesSquare"
            title="Temp masih kosong"
            body={`Tempel potongan kode, tautan, atau gambar yang cuma perlu sebentar. Pesan hilang sendiri setelah ${retentionLabel(settings.tempRetentionDays).toLowerCase()}, kecuali yang disematkan atau dibintangi.`}
          />
        )}
        {state.status === "ready" && all.length >= limit && !filtering && (
          <div style={{ alignSelf: "center" }}>
            <Button compact icon="History" tone="neutral" onClick={() => { stickToBottom.current = false; setLimit(limit + PAGE_SIZE) }}>
              Muat pesan lebih lama
            </Button>
          </div>
        )}
        {state.status === "ready" && all.length > 0 && groups.length === 0 && (
          <EmptyState icon="SearchX" title="Tidak ada yang cocok" body="Tidak ada pesan untuk pencarian atau filter ini." />
        )}
        {groups.map((group) => (
          <section key={`${group.label}-${group.items[0].id}`} className="chat__day" aria-label={group.label}>
            <h2 className="chat__date t-caption">{group.label}</h2>
            {group.items.map((item) => (
              <Bubble key={item.id} item={item} fill={theme.light ? `light-dark(${theme.light}, ${theme.dark})` : ""} inkLight={theme.light} inkDark={theme.dark} onActions={() => setActions(item)} />
            ))}
          </section>
        ))}
      </div>

      <div className="composer brutal">
        {replyTo && (
          <div className="row composer__context">
            <Icon name="Reply" size={16} className="muted" />
            <span className="t-caption muted grow clip">{previewOf(replyTo) || "Pesan"}</span>
            <FlatButton icon="X" label="Batal membalas" onClick={() => setReplyTo(null)} />
          </div>
        )}
        {pendingImage && (
          <div className="row composer__context">
            <img src={pendingImage.dataUrl} alt="" className="composer__thumb" />
            <span className="t-caption muted grow clip">{pendingImage.name}</span>
            <FlatButton icon="X" label="Batal mengirim gambar" onClick={() => setPendingImage(null)} />
          </div>
        )}
        {pickingRetention && (
          <div className="chip-row" role="radiogroup" aria-label="Retensi pesan ini">
            <Chip role="radio" label={`Ikut setelan (${retentionLabel(settings.tempRetentionDays)})`} selected={retentionOverride === null} onClick={() => setRetentionOverride(null)} />
            {retentionOptions.map((days) => (
              <Chip key={days} role="radio" label={retentionLabel(days)} selected={retentionOverride === days} onClick={() => setRetentionOverride(days)} />
            ))}
          </div>
        )}
        <div className="row" style={{ alignItems: "flex-end", gap: 2 }}>
          <FlatButton icon="ImagePlus" label="Kirim gambar" onClick={() => imageInput.current?.click()} />
          <FlatButton
            icon="Timer"
            label={`Retensi pesan ini: ${retentionOverride === null ? "ikut setelan" : retentionLabel(retentionOverride)}`}
            active={pickingRetention || retentionOverride !== null}
            onClick={() => setPickingRetention(!pickingRetention)}
          />
          <textarea
            className="composer__input"
            rows={1}
            value={draft}
            placeholder={pendingImage ? "Keterangan gambar (opsional)" : "Tempel atau tulis sesuatu"}
            aria-label="Pesan"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing && (settings.tempEnterSends ? !event.shiftKey : event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                send()
              }
            }}
            onPaste={(event) => {
              const file = [...event.clipboardData.files].find((item) => item.type.startsWith("image/"))
              if (file) {
                event.preventDefault()
                void attach(file)
              }
            }}
          />
          <IconButton icon="SendHorizontal" label="Kirim" primary disabled={!draft.trim() && !pendingImage} onClick={send} />
        </div>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void attach(file)
          }}
        />
      </div>

      {actions && (
        <ActionSheet
          item={actions}
          settingDays={settings.tempRetentionDays}
          onClose={() => setActions(null)}
          onCopy={() => { void copyText(actions.kind === "image" ? actions.caption : actions.content, "Pesan"); setActions(null) }}
          onReply={() => { setReplyTo(actions); setActions(null) }}
          onPin={() => { keep(actions, { pinned: !actions.pinned }); setActions(null) }}
          onStar={() => { keep(actions, { starred: !actions.starred }); setActions(null) }}
          onRetention={(days) => { keep(actions, { retentionDays: days }); setActions(null) }}
          onEdit={() => { setEditing(actions); setActions(null) }}
          onNotes={() => {
            const html = toNoteHtml(actions)
            toast(notes.create(contentTitle(html), html) ? "Disimpan ke Notes" : "Gagal menyimpan ke Notes")
            setActions(null)
          }}
          onDelete={() => { setDeleting(actions); setActions(null) }}
        />
      )}
      {editing && <EditSheet item={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Hapus pesan?"
          message="Pesan ini dihapus dari semua perangkat dan tidak bisa dikembalikan."
          confirmLabel="Hapus"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            temp.remove(deleting.id)
            if (replyTo?.id === deleting.id) setReplyTo(null)
            toast("Pesan dihapus")
            setDeleting(null)
          }}
        />
      )}
      {clearing && (
        <ConfirmDialog
          title="Bersihkan pesan kedaluwarsa?"
          message="Semua pesan yang masa simpannya sudah lewat dihapus, termasuk yang belum dimuat di layar. Pesan yang disematkan atau dibintangi tidak tersentuh."
          confirmLabel="Bersihkan"
          onClose={() => setClearing(false)}
          onConfirm={() => {
            setClearing(false)
            temp.clearExpired().then(
              (removed) => toast(removed === 0 ? "Tidak ada pesan kedaluwarsa" : `${removed} pesan kedaluwarsa dihapus`),
              () => toast("Gagal membersihkan: periksa koneksi"),
            )
          }}
        />
      )}
    </div>
  )
}

const urlPattern = /https?:\/\/[^\s<>"']+/g

function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(urlPattern)) {
    if (match.index > last) out.push(text.slice(last, match.index))
    out.push(
      <a key={match.index} href={match[0]} target="_blank" rel="noopener noreferrer">
        {match[0]}
      </a>,
    )
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="chat-code">
      <div className="chat-code__head">
        <span className="t-caption grow">{language || "kode"}</span>
        <FlatButton icon="Copy" label="Salin kode" onClick={() => void copyText(code, "Kode")} />
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

function Bubble({ item, fill, inkLight, inkDark, onActions }: { item: TempItem; fill: string; inkLight: string; inkDark: string; onActions: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = shouldCollapse(item)
  const collapsed = collapsible && !expanded
  const clip = (value: string) => (collapsed ? value.split("\n").slice(0, COLLAPSE_LINES).join("\n") : value)
  const style = fill ? { background: fill, color: `light-dark(${contrastOn(inkLight)}, ${contrastOn(inkDark)})` } : undefined
  const segments = item.kind === "code" && !item.content.includes("```") ? [{ type: "code" as const, value: item.content, language: item.meta }] : parseSegments(item.content)

  return (
    <article className="bubble brutal" style={style}>
      {item.replyTo && (
        <p className="bubble__reply t-caption">
          <Icon name="Reply" size={14} />
          <span className="clip">{item.replyTo.preview || "Pesan"}</span>
        </p>
      )}
      {item.kind === "image" ? (
        <>
          {item.content.startsWith("data:image/") || item.content.startsWith("http") ? (
            <a href={item.content} target="_blank" rel="noopener noreferrer" aria-label="Buka gambar ukuran penuh">
              <img className="bubble__image" src={item.content} alt={item.caption || item.meta || "Gambar"} loading="lazy" />
            </a>
          ) : (
            <p>Gambar tidak bisa ditampilkan</p>
          )}
          {item.caption && <p className="bubble__text">{linkify(item.caption)}</p>}
        </>
      ) : item.kind === "link" ? (
        <>
          {item.preview && (item.preview.title || item.preview.description) && (
            <div className="bubble__preview">
              {item.preview.title && <p className="t-strong clamp-2 break">{item.preview.title}</p>}
              {item.preview.description && <p className="t-caption clamp-2 break">{item.preview.description}</p>}
            </div>
          )}
          <p className="bubble__text">{linkify(item.content)}</p>
        </>
      ) : (
        segments.map((segment, index) =>
          segment.type === "code" ? (
            <CodeBlock key={index} code={clip(segment.value)} language={segment.language} />
          ) : (
            <p key={index} className="bubble__text">
              {linkify(clip(segment.value))}
            </p>
          ),
        )
      )}
      {collapsible && (
        <div>
          <Button compact tone="neutral" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
            {expanded ? "Ringkas" : "Tampilkan semua"}
          </Button>
        </div>
      )}
      <div className="bubble__foot">
        {item.pinned && <Icon name="Pin" size={14} label="Disematkan" />}
        {item.starred && <Icon name="Star" size={14} label="Berbintang" />}
        <span className="t-caption grow">
          {formatTime(item.createdAt)} · {remainingLabel(item)}
        </span>
        <FlatButton icon="Ellipsis" label={`Aksi untuk pesan: ${previewOf(item, 40) || "gambar"}`} onClick={onActions} />
      </div>
    </article>
  )
}

interface ActionSheetProps {
  item: TempItem
  settingDays: number
  onClose: () => void
  onCopy: () => void
  onReply: () => void
  onPin: () => void
  onStar: () => void
  onRetention: (days: number | null) => void
  onEdit: () => void
  onNotes: () => void
  onDelete: () => void
}

function ActionSheet({ item, settingDays, onClose, onCopy, onReply, onPin, onStar, onRetention, onEdit, onNotes, onDelete }: ActionSheetProps) {
  return (
    <Sheet title="Pesan" onClose={onClose}>
      <p className="muted clamp-2 break">{previewOf(item, 120) || "Gambar"}</p>
      <div className="field-grid">
        <Button icon="Copy" disabled={item.kind === "image" && !item.caption.trim()} onClick={onCopy}>Salin</Button>
        <Button icon="Reply" tone="neutral" onClick={onReply}>Balas</Button>
        <Button icon="Pin" tone={item.pinned ? "accent" : "neutral"} onClick={onPin}>{item.pinned ? "Lepas pin" : "Sematkan"}</Button>
        <Button icon="Star" tone={item.starred ? "accent" : "neutral"} onClick={onStar}>{item.starred ? "Lepas bintang" : "Bintangi"}</Button>
      </div>
      {isKept(item) ? (
        <p className="muted">Pesan yang disematkan atau dibintangi disimpan permanen.</p>
      ) : (
        <div className="field">
          <span className="field__label">Masa simpan pesan ini</span>
          <div className="chip-wrap" role="radiogroup" aria-label="Masa simpan pesan ini">
            <Chip role="radio" label={`Ikut setelan (${retentionLabel(settingDays)})`} selected={item.retentionDays === null} onClick={() => onRetention(null)} />
            {retentionOptions.map((days) => (
              <Chip key={days} role="radio" label={retentionLabel(days)} selected={item.retentionDays === days} onClick={() => onRetention(days)} />
            ))}
          </div>
        </div>
      )}
      <Button icon="Pencil" tone="neutral" block onClick={onEdit}>{item.kind === "image" ? "Ubah keterangan" : "Ubah pesan"}</Button>
      <Button icon="StickyNote" tone="neutral" block onClick={onNotes}>Simpan ke Notes</Button>
      <Button icon="Trash2" tone="danger" block onClick={onDelete}>Hapus pesan</Button>
    </Sheet>
  )
}

function EditSheet({ item, onClose }: { item: TempItem; onClose: () => void }) {
  const [text, setText] = useState(item.kind === "image" ? item.caption : item.content)
  return (
    <Sheet title={item.kind === "image" ? "Ubah keterangan gambar" : "Ubah pesan"} onClose={onClose}>
      <form
        className="col"
        onSubmit={(event) => {
          event.preventDefault()
          const content = text.trim()
          if (!content) return
          if (item.kind === "image") temp.update(item.id, { caption: content })
          else {
            const kind = detectKind(content)
            temp.update(item.id, { kind, content, meta: metaFor(kind, content), preview: null })
          }
          onClose()
        }}
      >
        <TextArea label="Isi" value={text} onChange={setText} rows={6} mono={item.kind === "code"} autoFocus />
        <div className="sheet__actions">
          <Button tone="neutral" onClick={onClose}>Batal</Button>
          <Button icon="Check" type="submit" disabled={!text.trim()}>Simpan</Button>
        </div>
      </form>
    </Sheet>
  )
}

/** Settings section: retention, bubble colour, text size, and the Enter key. */
export function TempSettings() {
  const settings = useSettings()
  const [busy, setBusy] = useState(false)
  return (
    <div className="col gap-14">
      <div className="field">
        <span className="field__label">Retensi pesan</span>
        <div className="chip-wrap" role="radiogroup" aria-label="Retensi pesan">
          {retentionOptions.map((days) => (
            <Chip key={days} role="radio" label={retentionLabel(days)} selected={settings.tempRetentionDays === days} onClick={() => updateSettings({ tempRetentionDays: days })} />
          ))}
        </div>
        <p className="field__hint">Pesan yang tidak di-pin atau dibintangi hilang sendiri setelah waktu ini. Perubahan berlaku untuk pesan baru.</p>
        <div>
          <Button
            icon="History"
            tone="neutral"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              temp
                .applyRetention(settings.tempRetentionDays)
                .then(
                  (changed) => toast(changed === 0 ? "Semua pesan sudah memakai retensi ini" : `${changed} pesan diperbarui`),
                  () => toast("Retensi gagal diterapkan: periksa koneksi"),
                )
                .finally(() => setBusy(false))
            }}
          >
            Terapkan ke pesan lama
          </Button>
        </div>
      </div>
      <div className="field">
        <span className="field__label">Tema gelembung</span>
        <div className="chip-wrap" role="radiogroup" aria-label="Tema gelembung">
          {bubbleThemes.map((theme) => (
            <Chip key={theme.id} role="radio" label={theme.label} selected={settings.tempBubbleTheme === theme.id} fill={theme.light || undefined} onClick={() => updateSettings({ tempBubbleTheme: theme.id })} />
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field__label">Ukuran teks: {settings.tempFontSize}</span>
        <div className="row">
          <IconButton icon="Minus" label="Lebih kecil" disabled={settings.tempFontSize <= 12} onClick={() => updateSettings({ tempFontSize: settings.tempFontSize - 1 })} />
          <IconButton icon="Plus" label="Lebih besar" disabled={settings.tempFontSize >= 18} onClick={() => updateSettings({ tempFontSize: settings.tempFontSize + 1 })} />
          <p className="grow" style={{ fontSize: settings.tempFontSize }}>Contoh teks pesan di Temp.</p>
        </div>
      </div>
      <div className="field">
        <span className="field__label">Tombol Enter</span>
        <div className="chip-wrap" role="radiogroup" aria-label="Tombol Enter">
          <Chip role="radio" label="Enter mengirim" selected={settings.tempEnterSends} onClick={() => updateSettings({ tempEnterSends: true })} />
          <Chip role="radio" label="Enter membuat baris baru" selected={!settings.tempEnterSends} onClick={() => updateSettings({ tempEnterSends: false })} />
        </div>
        <p className="field__hint">{settings.tempEnterSends ? "Shift+Enter membuat baris baru." : "Ctrl+Enter atau Cmd+Enter mengirim."}</p>
      </div>
    </div>
  )
}
