import { useMemo, useState } from "react"
import { itemsOf } from "@/data/core"
import { saveWorkSettings, useWorkSettings, workTickets } from "@/data/work"
import { contrastOn, formatDate, formatDateTime, fromLocalInput, safeColor, toLocalInput } from "@/lib/format"
import { formatReminderDate } from "@/lib/week"
import {
  MAX_STAT_CARDS,
  cardMatches,
  cardPresets,
  columnTemplates,
  describeCard,
  dueLabel,
  groupByColumn,
  isUrgent,
  needsAttention,
  newColumn,
  presetCard,
  presetOf,
  priorityIcon,
  reminderPresets,
  statusCard,
  statusCatalog,
  statusColor,
  workIconChoices,
  assignColumn,
  type WorkColumn,
  type WorkSettings,
  type WorkStatCard,
} from "@/lib/workLogic"
import { requestNotifications } from "@/reminders"
import type { WorkTicket } from "@/types"
import {
  Button,
  Chip,
  ColorPicker,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FlatButton,
  IconButton,
  ItemCard,
  LoadingList,
  SearchField,
  Segmented,
  Sheet,
  Switch,
  Tag,
  TextField,
} from "@/ui/components"
import { Icon } from "@/ui/icons"
import { toast } from "@/ui/toast"

function points(value: number | null): string {
  return value === null ? "-" : String(value)
}

export function WorkScreen() {
  const state = workTickets.use()
  const settings = useWorkSettings()
  const [query, setQuery] = useState("")
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [cardFilter, setCardFilter] = useState<string | null>(null)
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null)
  const [reminding, setReminding] = useState<WorkTicket | null>(null)
  const [configuring, setConfiguring] = useState(false)

  const all = itemsOf(state)
  const lastSync = all.reduce((max, ticket) => Math.max(max, ticket.syncedAt), 0)
  const activeCard = settings.statCards.find((card) => card.id === cardFilter && card.kind !== "jql") ?? null
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return all.filter(
      (ticket) =>
        (!urgentOnly || needsAttention(ticket)) &&
        (!activeCard || cardMatches(activeCard, ticket)) &&
        (!needle || [ticket.issueKey, ticket.summary, ticket.status, ticket.assignee, ...ticket.labels].some((text) => text.toLowerCase().includes(needle))),
    )
  }, [all, query, urgentOnly, activeCard])
  const board = useMemo(() => groupByColumn(filtered, settings.columns), [filtered, settings.columns])
  const unplaced = filtered.filter((ticket) => assignColumn(ticket, settings.columns) === null).length
  const current = settings.columns.find((column) => column.id === selectedColumn) ?? settings.columns.find((column) => (board.get(column.id)?.length ?? 0) > 0) ?? settings.columns[0]

  const ticketCard = (ticket: WorkTicket) => <TicketCard key={ticket.id} ticket={ticket} onRemind={() => setReminding(ticket)} />

  return (
    <div className="screen" style={{ maxWidth: "none" }}>
      <div className="toolbar">
        <div className="grow">
          <p className="t-strong">{lastSync > 0 ? `Sinkron terakhir ${formatDateTime(lastSync)}` : "Belum pernah disinkronkan"}</p>
          <p className="muted">{all.length} tiket aktif</p>
        </div>
        <IconButton icon="SlidersHorizontal" label="Pengaturan papan Work" onClick={() => setConfiguring(true)} />
      </div>
      <div className="brutal banner">
        <Icon name="Info" />
        <p>Papan ini menampilkan hasil sinkron Jira dari extension atau aplikasi Android. Browser tidak bisa memanggil Jira langsung, jadi sinkron dan kirim ke Lark dilakukan dari sana. Pengingat dan susunan papan bisa diatur di sini.</p>
      </div>

      {state.status === "loading" && <LoadingList rows={4} />}
      {state.status === "failed" && <ErrorState message={state.message} onRetry={workTickets.retry} />}
      {state.status === "ready" && (
        <>
          {settings.statCards.length > 0 && (
            <div className="tiles">
              {settings.statCards.map((card) => (
                <StatTile key={card.id} card={card} count={card.kind === "jql" ? null : all.filter((ticket) => cardMatches(card, ticket)).length} active={cardFilter === card.id} onClick={() => setCardFilter(cardFilter === card.id ? null : card.id)} />
              ))}
            </div>
          )}
          <div className="toolbar">
            <SearchField value={query} onChange={setQuery} placeholder="Cari key, judul, status" />
            <Chip label="Mendesak" icon="Flame" selected={urgentOnly} fill="#e5484d" onClick={() => setUrgentOnly(!urgentOnly)} />
          </div>
          {settings.columns.length === 0 ? (
            <EmptyState icon="Columns3" title="Belum ada kolom" body="Tambah kolom di pengaturan papan supaya tiket punya tempat." actionLabel="Atur kolom" actionIcon="SlidersHorizontal" onAction={() => setConfiguring(true)} />
          ) : all.length === 0 ? (
            <EmptyState icon="Inbox" title="Belum ada tiket" body="Buka tab Work di extension atau aplikasi Android dan jalankan sinkron. Tiket aktif akan muncul di sini." />
          ) : (
            <>
              <div className="board-tabs chip-row" role="tablist" aria-label="Kolom papan">
                {settings.columns.map((column) => (
                  <button
                    key={column.id}
                    type="button"
                    role="tab"
                    aria-selected={column.id === current?.id}
                    className="brutal pressable chip"
                    style={{ ["--chip-fill" as string]: safeColor(column.color), ["--chip-ink" as string]: contrastOn(safeColor(column.color)) }}
                    onClick={() => setSelectedColumn(column.id)}
                  >
                    <Icon name={column.icon} size={16} />
                    {column.label} {board.get(column.id)?.length ?? 0}
                  </button>
                ))}
              </div>
              <div className="board">
                {settings.columns.map((column) => {
                  const tickets = board.get(column.id) ?? []
                  return (
                    <section key={column.id} className={`board__column ${column.id === current?.id ? "board__column--current" : ""}`} aria-label={`${column.label}, ${tickets.length} tiket`}>
                      <h2 className="board__head brutal" style={{ background: safeColor(column.color), color: contrastOn(safeColor(column.color)) }}>
                        <Icon name={column.icon} size={18} />
                        <span className="grow clip">{column.label}</span>
                        <span>{tickets.length}</span>
                      </h2>
                      {tickets.length === 0 ? <p className="muted board__empty">Tidak ada tiket di kolom ini untuk filter saat ini.</p> : tickets.map(ticketCard)}
                    </section>
                  )
                })}
              </div>
              {unplaced > 0 && <p className="muted">{unplaced} tiket tidak masuk kolom mana pun. Tandai satu kolom sebagai penampung di pengaturan papan.</p>}
            </>
          )}
        </>
      )}

      {reminding && <ReminderSheet ticket={reminding} onClose={() => setReminding(null)} />}
      {configuring && <BoardSettings initial={settings} onClose={() => setConfiguring(false)} />}
    </div>
  )
}

/** Neutral tile with a solid colour icon block. JQL tiles are counted by Jira, so the web shows a dash. */
function StatTile({ card, count, active, onClick }: { card: WorkStatCard; count: number | null; active: boolean; onClick: () => void }) {
  const color = safeColor(card.color)
  const body = (
    <>
      <span className="tile__icon" style={{ background: color, color: contrastOn(color) }}>
        <Icon name={card.icon} />
      </span>
      <span className="grow">
        <span className="tile__count">{count ?? "-"}</span>
        <span className="t-caption clip" style={{ display: "block" }}>{card.label || "Tanpa nama"}</span>
      </span>
    </>
  )
  if (card.kind === "jql") {
    return (
      <div className="brutal tile" title="Kartu JQL dihitung oleh Jira saat sinkron di extension atau Android" aria-label={`${card.label}: dihitung di extension atau Android`}>
        {body}
      </div>
    )
  }
  return (
    <button type="button" className="brutal pressable tile" aria-pressed={active} aria-label={`${card.label}: ${count}`} onClick={onClick}>
      {body}
    </button>
  )
}

function TicketCard({ ticket, onRemind }: { ticket: WorkTicket; onRemind: () => void }) {
  const fill = statusColor(ticket.status)
  const priority = priorityIcon(ticket.priority)
  const urgent = isUrgent(ticket)
  const heading = (
    <>
      <span className="t-mono t-strong">{ticket.issueKey}</span>
      <span className="t-strong clamp-2 break" style={{ display: "block" }}>{ticket.summary || "Tanpa judul"}</span>
    </>
  )
  return (
    <ItemCard color={fill}>
      {ticket.url ? (
        <a href={ticket.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
          {heading}
        </a>
      ) : (
        <div>{heading}</div>
      )}
      <div className="row wrap gap-6" style={{ marginTop: 4 }}>
        <Tag text={ticket.status || "Tanpa status"} fill={fill} />
        {ticket.labels.length > 0 ? ticket.labels.slice(0, 3).map((label) => <Tag key={label} text={label} icon="Tag" />) : ticket.issueType && <Tag text={ticket.issueType} />}
      </div>
      <div className="row wrap gap-6" style={{ marginTop: 2 }}>
        {ticket.priority && (
          <span className="row gap-4 t-caption">
            <Icon name={priority.icon} size={16} style={{ color: priority.color }} />
            {ticket.priority}
          </span>
        )}
        <Tag text={`SP: ${points(ticket.storyPoints)}`} />
        <Tag text={dueLabel(ticket.dueAt)} icon={urgent ? "TriangleAlert" : "Calendar"} fill={urgent ? "#e5484d" : undefined} />
      </div>
      <div className="item__actions">
        <span className="grow" style={{ marginLeft: 10 }}>
          <span className="t-caption muted" style={{ display: "block" }}>
            {ticket.createdAtJira > 0 ? `Dibuat ${formatDate(ticket.createdAtJira)}` : ""}
            {ticket.assignee ? ` · ${ticket.assignee}` : ""}
          </span>
          {ticket.reminderAt && <Tag text={formatReminderDate(ticket.reminderAt)} icon="AlarmClock" fill="#ffd23f" />}
        </span>
        <FlatButton icon="AlarmClock" label={`Pengingat untuk ${ticket.issueKey}`} active={ticket.reminderAt !== null} onClick={onRemind} />
      </div>
    </ItemCard>
  )
}

function ReminderSheet({ ticket, onClose }: { ticket: WorkTicket; onClose: () => void }) {
  const [note, setNote] = useState(ticket.reminderNote)
  const [custom, setCustom] = useState(() => toLocalInput(ticket.reminderAt ?? Date.now() + 3_600_000))
  const set = (at: number) => {
    if (at <= Date.now()) {
      toast("Waktu itu sudah lewat")
      return
    }
    workTickets.setReminder(ticket.issueKey, at, note.trim())
    toast(`Pengingat dijadwalkan ${formatReminderDate(at)}`)
    void requestNotifications()
    onClose()
  }
  return (
    <Sheet title={`Pengingat ${ticket.issueKey}`} onClose={onClose}>
      <p className="muted clamp-2 break">{ticket.summary}</p>
      {ticket.reminderAt && (
        <div>
          <Tag text={`Aktif: ${formatReminderDate(ticket.reminderAt)}`} icon="AlarmClock" fill="#ffd23f" />
        </div>
      )}
      <TextField label="Catatan (opsional)" value={note} onChange={setNote} placeholder="Contoh: mulai dari review komentar QA" />
      <div className="field">
        <span className="field__label">Kerjakan pada</span>
        <div className="chip-wrap">
          {reminderPresets().map((preset) => (
            <Chip key={preset.label} label={preset.label} selected={false} onClick={() => set(preset.at)} />
          ))}
        </div>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="grow">
            <TextField label="Tanggal dan jam" type="datetime-local" value={custom} onChange={setCustom} />
          </div>
          <IconButton icon="Check" label="Pasang pengingat pada waktu ini" primary onClick={() => set(fromLocalInput(custom) ?? 0)} />
        </div>
      </div>
      {ticket.reminderAt && (
        <Button
          icon="BellOff"
          tone="danger"
          block
          onClick={() => {
            workTickets.setReminder(ticket.issueKey, null, "")
            onClose()
          }}
        >
          Hapus pengingat
        </Button>
      )}
    </Sheet>
  )
}

function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  next.splice(target, 0, ...next.splice(index, 1))
  return next
}

function StatusPicker({ label, value, onChange }: { label: string; value: string[]; onChange: (list: string[]) => void }) {
  const [custom, setCustom] = useState("")
  const has = (status: string) => value.some((item) => item.toLowerCase() === status.toLowerCase())
  const options = [...statusCatalog, ...value.filter((status) => !statusCatalog.some((item) => item.toLowerCase() === status.toLowerCase()))]
  const add = () => {
    const clean = custom.trim()
    if (clean && !has(clean)) onChange([...value, clean])
    setCustom("")
  }
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="chip-wrap" role="group" aria-label={label}>
        {options.map((status) => (
          <Chip key={status} label={status} selected={has(status)} onClick={() => onChange(has(status) ? value.filter((item) => item.toLowerCase() !== status.toLowerCase()) : [...value, status])} />
        ))}
      </div>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="grow">
          <TextField
            label="Status lain"
            value={custom}
            onChange={(next) => setCustom(next.slice(0, 60))}
            placeholder="Nama status persis seperti di Jira"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                add()
              }
            }}
          />
        </div>
        <IconButton icon="Plus" label="Tambah status" disabled={!custom.trim()} onClick={add} />
      </div>
    </div>
  )
}

function IconChoice({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <div className="field">
      <span className="field__label">Ikon</span>
      <div className="swatches" role="radiogroup" aria-label="Ikon">
        {[...new Set([value, ...workIconChoices])].map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={name === value}
            aria-label={`Ikon ${name}`}
            title={name}
            className="swatch"
            style={name === value ? { background: "var(--primary)", color: "var(--on-primary)" } : { background: "var(--surface)" }}
            onClick={() => onChange(name)}
          >
            <Icon name={name} />
          </button>
        ))}
      </div>
    </div>
  )
}

interface RowHeadProps {
  icon: string
  color: string
  title: string
  subtitle: string
  index: number
  last: number
  expanded: boolean
  onMove: (direction: -1 | 1) => void
  onToggle: () => void
  onDelete: () => void
}

function RowHead({ icon, color, title, subtitle, index, last, expanded, onMove, onToggle, onDelete }: RowHeadProps) {
  const fill = safeColor(color)
  const name = title || "Tanpa nama"
  return (
    <div className="row">
      <span className="tile__icon" style={{ background: fill, color: contrastOn(fill) }}>
        <Icon name={icon} />
      </span>
      <span className="grow">
        <span className="t-strong clip" style={{ display: "block" }}>{name}</span>
        <span className="t-caption muted clamp-2">{subtitle}</span>
      </span>
      <FlatButton icon="ArrowUp" label={`Naikkan ${name}`} disabled={index === 0} onClick={() => onMove(-1)} />
      <FlatButton icon="ArrowDown" label={`Turunkan ${name}`} disabled={index === last} onClick={() => onMove(1)} />
      <FlatButton icon={expanded ? "ChevronUp" : "Pencil"} label={expanded ? `Tutup ${name}` : `Ubah ${name}`} aria-expanded={expanded} onClick={onToggle} />
      <FlatButton icon="Trash2" label={`Hapus ${name}`} danger onClick={onDelete} />
    </div>
  )
}

function BoardSettings({ initial, onClose }: { initial: WorkSettings; onClose: () => void }) {
  const [draft, setDraft] = useState(initial)
  const [tab, setTab] = useState<"cards" | "columns">("cards")
  const [open, setOpen] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const dirty = draft !== initial
  const close = () => (dirty ? setDiscarding(true) : onClose())
  const updateCard = (id: string, patch: Partial<WorkStatCard>) => setDraft({ ...draft, statCards: draft.statCards.map((card) => (card.id === id ? { ...card, ...patch } : card)) })
  const updateColumn = (id: string, patch: Partial<WorkColumn>) => setDraft({ ...draft, columns: draft.columns.map((column) => (column.id === id ? { ...column, ...patch } : column)) })
  const addCard = (card: WorkStatCard) => {
    setDraft({ ...draft, statCards: [...draft.statCards, card] })
    setOpen(card.id)
  }
  const addColumn = (column: WorkColumn) => {
    setDraft({ ...draft, columns: [...draft.columns, column] })
    setOpen(column.id)
  }

  return (
    <Sheet title="Papan Work" onClose={close} variant="wide">
      <Segmented label="Bagian pengaturan" value={tab} onChange={(next) => { setTab(next); setOpen(null) }} options={[{ value: "cards", label: "Kartu" }, { value: "columns", label: "Kolom" }]} />
      {tab === "cards" ? (
        <>
          <p className="muted">Kartu ringkasan di atas papan, maksimal {MAX_STAT_CARDS}. Sekarang {draft.statCards.length}.</p>
          {draft.statCards.map((card, index) => (
            <div key={card.id} className="brutal category-row">
              <RowHead
                icon={card.icon}
                color={card.color}
                title={card.label}
                subtitle={describeCard(card)}
                index={index}
                last={draft.statCards.length - 1}
                expanded={open === card.id}
                onMove={(direction) => setDraft({ ...draft, statCards: move(draft.statCards, index, direction) })}
                onToggle={() => setOpen(open === card.id ? null : card.id)}
                onDelete={() => setDraft({ ...draft, statCards: draft.statCards.filter((item) => item.id !== card.id) })}
              />
              {open === card.id && (
                <div className="col gap-14" style={{ padding: "8px 6px 8px 2px" }}>
                  <TextField label="Label" value={card.label} onChange={(label) => updateCard(card.id, { label })} />
                  {card.kind === "preset" && (
                    <div className="field">
                      <span className="field__label">Kondisi</span>
                      <div className="chip-wrap" role="radiogroup" aria-label="Kondisi">
                        {cardPresets.map((preset) => (
                          <Chip key={preset.id} role="radio" label={preset.label} selected={card.preset === preset.id} onClick={() => updateCard(card.id, { preset: preset.id })} />
                        ))}
                      </div>
                      <p className="field__hint">{presetOf(card.preset).help}</p>
                    </div>
                  )}
                  {card.kind === "status" && <StatusPicker label="Status yang dihitung" value={card.statuses} onChange={(statuses) => updateCard(card.id, { statuses })} />}
                  {card.kind === "jql" && <p className="muted">Kartu JQL dihitung langsung oleh Jira saat sinkron di extension atau Android. Di web angkanya tidak tersedia.</p>}
                  <IconChoice value={card.icon} onChange={(icon) => updateCard(card.id, { icon })} />
                  <ColorPicker value={card.color} onChange={(color) => updateCard(card.id, { color })} />
                </div>
              )}
            </div>
          ))}
          <div className="row wrap">
            <Button compact icon="ListChecks" tone="neutral" disabled={draft.statCards.length >= MAX_STAT_CARDS} onClick={() => addCard(presetCard("total"))}>Tambah kartu kondisi</Button>
            <Button compact icon="Tags" tone="neutral" disabled={draft.statCards.length >= MAX_STAT_CARDS} onClick={() => addCard(statusCard())}>Tambah kartu status</Button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Kolom papan, tanpa batas jumlah. Tiket masuk ke kolom yang mencantumkan statusnya.</p>
          {draft.columns.map((column, index) => {
            const flags = [column.catchOverdue && "menampung overdue", column.fallback && "penampung status lain"].filter(Boolean)
            return (
              <div key={column.id} className="brutal category-row">
                <RowHead
                  icon={column.icon}
                  color={column.color}
                  title={column.label}
                  subtitle={[column.statuses.join(", ") || "Belum ada status", ...flags].join(" · ")}
                  index={index}
                  last={draft.columns.length - 1}
                  expanded={open === column.id}
                  onMove={(direction) => setDraft({ ...draft, columns: move(draft.columns, index, direction) })}
                  onToggle={() => setOpen(open === column.id ? null : column.id)}
                  onDelete={() => setDraft({ ...draft, columns: draft.columns.filter((item) => item.id !== column.id) })}
                />
                {open === column.id && (
                  <div className="col gap-14" style={{ padding: "8px 6px 8px 2px" }}>
                    <TextField label="Label" value={column.label} onChange={(label) => updateColumn(column.id, { label })} />
                    <StatusPicker label="Status di kolom ini" value={column.statuses} onChange={(statuses) => updateColumn(column.id, { statuses })} />
                    <Switch
                      checked={column.catchOverdue}
                      onChange={(value) => setDraft({ ...draft, columns: draft.columns.map((item) => ({ ...item, catchOverdue: item.id === column.id ? value : value ? false : item.catchOverdue })) })}
                      label="Tampung tiket yang lewat due"
                      description="Untuk tiket telat yang statusnya tidak punya kolom sendiri."
                    />
                    <Switch
                      checked={column.fallback}
                      onChange={(value) => setDraft({ ...draft, columns: draft.columns.map((item) => ({ ...item, fallback: item.id === column.id ? value : value ? false : item.fallback })) })}
                      label="Penampung status lain"
                      description="Tiket dengan status yang tidak tercantum di kolom mana pun masuk ke sini."
                    />
                    <IconChoice value={column.icon} onChange={(icon) => updateColumn(column.id, { icon })} />
                    <ColorPicker value={column.color} onChange={(color) => updateColumn(column.id, { color })} />
                  </div>
                )}
              </div>
            )
          })}
          <div className="field">
            <span className="field__label">Tambah kolom</span>
            <div className="chip-wrap">
              <Chip label="Kolom kosong" icon="Plus" selected={false} onClick={() => addColumn(newColumn())} />
              {columnTemplates.map((template) => (
                <Chip key={template.label} label={template.label} icon={template.icon} selected={false} onClick={() => addColumn(newColumn(template.label, template.icon, template.color, template.statuses))} />
              ))}
            </div>
          </div>
        </>
      )}
      <div className="sheet__actions">
        <Button tone="neutral" onClick={close}>Batal</Button>
        <Button
          icon="Check"
          disabled={!dirty}
          onClick={() => {
            saveWorkSettings(draft)
            toast("Pengaturan papan disimpan")
            onClose()
          }}
        >
          Simpan
        </Button>
      </div>
      {discarding && (
        <ConfirmDialog title="Buang perubahan?" message="Pengaturan papan yang kamu ubah belum disimpan." confirmLabel="Buang" danger onClose={() => setDiscarding(false)} onConfirm={onClose} />
      )}
    </Sheet>
  )
}
