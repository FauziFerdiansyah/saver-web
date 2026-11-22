import { useEffect, useMemo, useRef, useState } from "react"
import { notes } from "@/data/docs"
import { itemsOf } from "@/data/core"
import { EditorHost } from "@/editor/EditorHost"
import { EditorSession } from "@/editor/session"
import { downloadText, formatRelative } from "@/lib/format"
import { contentDescription, toMarkdown } from "@/lib/noteContent"
import type { Note } from "@/types"
import { Button, ConfirmDialog, EmptyState, ErrorState, FlatButton, LoadingList, SearchField } from "@/ui/components"
import { Icon } from "@/ui/icons"
import { copyText, toast } from "@/ui/toast"

function fileName(title: string): string {
  return `${title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "saver"}.md`
}

export function NotesScreen({ noteId }: { noteId: string | undefined }) {
  const state = notes.use()
  const [query, setQuery] = useState("")
  const [deleting, setDeleting] = useState<Note | null>(null)
  const all = itemsOf(state)
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = all.map((note) => ({ note, description: contentDescription(note.content) }))
    const matched = needle ? rows.filter((row) => row.note.title.toLowerCase().includes(needle) || row.description.toLowerCase().includes(needle)) : rows
    return [...matched.filter((row) => row.note.pinned), ...matched.filter((row) => !row.note.pinned)]
  }, [all, query])

  const create = () => {
    const id = notes.create()
    if (id) location.hash = `#/notes/${id}`
    else toast("Catatan tidak bisa dibuat. Coba masuk ulang.")
  }

  return (
    <div className={`split ${noteId ? "split--detail" : "split--list"}`}>
      <div className="split__list">
        <div className="toolbar">
          <SearchField value={query} onChange={setQuery} placeholder="Cari judul atau isi catatan" />
          <Button icon="Plus" className="desktop-only" onClick={create}>
            Baru
          </Button>
        </div>
        {state.status === "loading" && <LoadingList grid={false} />}
        {state.status === "failed" && <ErrorState message={state.message} onRetry={notes.retry} />}
        {state.status === "ready" && all.length === 0 && (
          <EmptyState
            icon="StickyNote"
            title="Belum ada catatan"
            body="Catatan bebas dengan teks kaya. Baris pertama menjadi judulnya, dan isinya sama dengan yang kamu lihat di extension."
            actionLabel="Tulis catatan pertama"
            onAction={create}
          />
        )}
        {state.status === "ready" && all.length > 0 && visible.length === 0 && (
          <EmptyState icon="SearchX" title="Tidak ada yang cocok" body="Tidak ada catatan dengan kata itu di judul atau isinya." />
        )}
        {visible.map(({ note, description }) => {
          const title = note.title || "Catatan baru"
          return (
            <article key={note.id} className={`brutal note-card ${note.pinned ? "note-card--pinned" : ""}`} aria-current={note.id === noteId ? "true" : undefined}>
              <a className="note-card__main" href={`#/notes/${note.id}`}>
                <span className="t-heading clamp-2 break">{title}</span>
                {description && <span className="clamp-2 break note-card__text">{description}</span>}
                <span className="t-caption note-card__text">Diubah {formatRelative(note.updatedAt).toLowerCase()}</span>
              </a>
              <div className="col gap-4" style={{ gap: 0 }}>
                <FlatButton icon={note.pinned ? "PinOff" : "Pin"} label={note.pinned ? `Lepas sematan ${title}` : `Sematkan ${title}`} onClick={() => notes.setPinned(note.id, !note.pinned)} />
                <FlatButton icon="Trash2" label={`Hapus ${title}`} danger={!note.pinned} onClick={() => setDeleting(note)} />
              </div>
            </article>
          )
        })}
        <button type="button" className="brutal pressable fab" aria-label="Catatan baru" onClick={create}>
          <Icon name="Plus" size={24} />
        </button>
      </div>
      <div className="split__detail">
        {noteId ? (
          <NoteEditor key={noteId} noteId={noteId} note={all.find((item) => item.id === noteId)} loading={state.status === "loading"} onDelete={setDeleting} />
        ) : (
          <div className="desktop-only">
            <EmptyState icon="StickyNote" title="Pilih catatan" body="Pilih catatan di daftar sebelah kiri, atau buat yang baru." actionLabel="Catatan baru" onAction={create} />
          </div>
        )}
      </div>
      {deleting && (
        <ConfirmDialog
          title="Hapus catatan?"
          message={`"${deleting.title || "Catatan baru"}" akan dihapus dari semua perangkat dan tidak bisa dikembalikan.`}
          confirmLabel="Hapus"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            notes.remove(deleting.id)
            toast("Catatan dihapus")
            if (deleting.id === noteId) location.hash = "#/notes"
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}

function NoteEditor({ noteId, note, loading, onDelete }: { noteId: string; note: Note | undefined; loading: boolean; onDelete: (note: Note) => void }) {
  const session = useMemo(() => new EditorSession((html, title, rev) => notes.save(noteId, title, html, rev)), [noteId])
  const latest = useRef("")
  // A note this tab just created is not in the list until its first snapshot arrives.
  const seen = useRef(false)
  if (note) seen.current = true

  useEffect(() => {
    if (note) session.onRemote(note.content, note.rev, note.lastDeviceId)
  }, [note, session])

  if (!note) {
    if (loading || !seen.current) return <LoadingList rows={3} grid={false} />
    return <ErrorState message="Catatan ini tidak ditemukan. Mungkin sudah dihapus di perangkat lain." />
  }
  const title = note.title || "Catatan baru"
  return (
    <div className="doc">
      <div className="doc__head">
        <a className="brutal pressable icon-btn split__back" href="#/notes" aria-label="Kembali ke daftar catatan">
          <Icon name="ArrowLeft" />
        </a>
        <h2 className="t-title grow clip">{title}</h2>
        <FlatButton icon="Copy" label="Salin sebagai markdown" onClick={() => void copyText(toMarkdown(latest.current), "Markdown")} />
        <FlatButton icon="Download" label="Unduh sebagai markdown" onClick={() => downloadText(fileName(title), toMarkdown(latest.current), "text/markdown")} />
        <FlatButton icon="Pin" label={note.pinned ? "Lepas sematan" : "Sematkan"} active={note.pinned} onClick={() => notes.setPinned(note.id, !note.pinned)} />
        <FlatButton icon="Trash2" label="Hapus catatan" danger onClick={() => onDelete(note)} />
      </div>
      <EditorHost
        session={session}
        placeholder="Judul di baris pertama, lalu tulis isinya"
        selfRef={`note:${noteId}`}
        titleFirst
        onHtml={(html) => {
          latest.current = html
        }}
      />
    </div>
  )
}
