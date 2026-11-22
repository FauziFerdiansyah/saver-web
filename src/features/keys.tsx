import { useMemo, useState } from "react"
import { getRandomColor } from "@/constants/colors"
import { defaultCategory } from "@/constants/categories"
import { categories as categoryRepo, keys } from "@/data/repos"
import { itemsOf } from "@/data/core"
import { authStore } from "@/firebase"
import { categoriesForScope, resolveCategoryLabel } from "@/lib/categories"
import { formatDate, fromLocalInput, toLocalInput } from "@/lib/format"
import { moveVisible } from "@/lib/reorder"
import { endOfDay, startOfDay } from "@/lib/week"
import { setKeysPassword, useSettings, verifyKeysPassword } from "@/settings"
import type { SavedCategory, SavedKey } from "@/types"
import {
  Button,
  CategoryFilter,
  CategoryTag,
  CategoryPicker,
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
  Sheet,
  Switch,
  Tag,
  TextArea,
  TextField,
} from "@/ui/components"
import { Icon } from "@/ui/icons"
import { copyText, toast } from "@/ui/toast"

/** An action waiting behind the password prompt. */
interface Gate {
  reason: string
  run: () => void
}

/** Short status of a key's validity, with whether it needs attention. */
export function keyValidity(key: Pick<SavedKey, "lifetime" | "validUntil">, now = Date.now()): { text: string; warn: boolean } {
  if (key.lifetime || key.validUntil === null) return { text: "Lifetime", warn: false }
  const days = Math.round((startOfDay(key.validUntil) - startOfDay(now)) / 86_400_000)
  if (days < 0) return { text: `Kedaluwarsa ${formatDate(key.validUntil)}`, warn: true }
  if (days === 0) return { text: "Berakhir hari ini", warn: true }
  if (days <= 14) return { text: `Berakhir ${days} hari lagi`, warn: true }
  return { text: `Berlaku sampai ${formatDate(key.validUntil)}`, warn: false }
}

export function KeysScreen() {
  const state = keys.use()
  const allCategories = categoryRepo.use()
  const prefs = useSettings()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const [form, setForm] = useState<SavedKey | "new" | null>(null)
  const [deleting, setDeleting] = useState<SavedKey | null>(null)
  const [gate, setGate] = useState<Gate | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  const all = itemsOf(state)
  // The key value itself is deliberately not searchable, so typing never hints at a secret.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return all.filter(
      (item) =>
        (category === null || item.category === category) &&
        (!needle || [item.title, item.note, resolveCategoryLabel(allCategories, item.category)].some((text) => text.toLowerCase().includes(needle))),
    )
  }, [all, allCategories, query, category])
  const pinned = all.filter((item) => item.pinned)
  const filtering = query.trim() !== "" || category !== null
  const used = useMemo(() => new Set(all.map((item) => item.category)), [all])
  const hasPassword = Boolean(prefs.keysPassword)

  const guarded = (required: boolean, reason: string, run: () => void) => {
    if (hasPassword && required) setGate({ reason, run })
    else run()
  }
  const copy = (key: SavedKey) => guarded(prefs.requirePasswordOnCopy, `menyalin "${key.title}"`, () => void copyText(key.keyValue, "Key"))
  const toggleReveal = (key: SavedKey) => {
    const show = () =>
      setRevealed((current) => {
        const next = new Set(current)
        if (next.has(key.id)) next.delete(key.id)
        else next.add(key.id)
        return next
      })
    if (revealed.has(key.id)) show()
    else guarded(prefs.requirePasswordOnCopy, `melihat "${key.title}"`, show)
  }

  return (
    <div className="screen">
      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Cari key" />
        <IconButton
          icon={reordering ? "Check" : "ArrowUpDown"}
          label={reordering ? "Selesai mengurutkan" : "Urutkan key"}
          onClick={() => setReordering(!reordering)}
          aria-pressed={reordering}
          style={reordering ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}
        />
        <Button icon="Plus" className="desktop-only" onClick={() => setForm("new")}>
          Key baru
        </Button>
      </div>
      <CategoryFilter categories={categoriesForScope(allCategories, "keys")} used={used} value={category} onChange={setCategory} />

      {state.status === "loading" && <LoadingList />}
      {state.status === "failed" && <ErrorState message={state.message} onRetry={keys.retry} />}
      {state.status === "ready" && all.length === 0 && (
        <EmptyState
          icon="KeyRound"
          title="Belum ada key"
          body="Simpan token API, secret, atau kredensial. Nilainya disamarkan dan bisa dikunci dengan password per aksi."
          actionLabel="Simpan key pertama"
          onAction={() => setForm("new")}
        />
      )}
      {state.status === "ready" && all.length > 0 && (
        <>
          {!hasPassword && !filtering && (
            <div className="row">
              <p className="muted grow">Key belum dikunci password.</p>
              <a className="brutal pressable btn btn--neutral btn--compact" href="#/settings/password">
                <Icon name="Lock" size={16} />
                Atur password
              </a>
            </div>
          )}
          {pinned.length > 0 && !filtering && !reordering && (
            <div className="field">
              <span className="field__label">Disematkan, klik untuk menyalin</span>
              <div className="chip-row">
                {pinned.map((key) => (
                  <Chip key={key.id} label={key.title} icon="Copy" selected fill="#ffd23f" onClick={() => copy(key)} />
                ))}
              </div>
            </div>
          )}
          {visible.length === 0 ? (
            <EmptyState icon="SearchX" title="Tidak ada yang cocok" body="Tidak ada key untuk pencarian atau kategori ini." />
          ) : (
            <div className="card-grid">
              {visible.map((key) => (
                <KeyCard
                  key={key.id}
                  item={key}
                  categories={allCategories}
                  revealed={revealed.has(key.id)}
                  reordering={reordering}
                  onReveal={() => toggleReveal(key)}
                  onCopy={() => copy(key)}
                  onPin={() => keys.patch(key.id, { pinned: !key.pinned }, "Menyematkan key")}
                  onEdit={() => guarded(prefs.requirePasswordOnEdit, `mengubah "${key.title}"`, () => setForm(key))}
                  onDelete={() => guarded(prefs.requirePasswordOnDelete, `menghapus "${key.title}"`, () => setDeleting(key))}
                  onMove={(direction) => keys.setOrders(moveVisible(all, visible, key.id, direction))}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!reordering && (
        <button type="button" className="brutal pressable fab" aria-label="Key baru" onClick={() => setForm("new")}>
          <Icon name="Plus" size={24} />
        </button>
      )}
      {form && (
        <KeyForm
          initial={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSubmit={(key) => {
            const isNew = !key.id
            keys.save({ ...key, order: isNew ? all.length : key.order })
            toast(isNew ? "Key disimpan" : "Key diperbarui")
            setForm(null)
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Hapus key?"
          message={`"${deleting.title}" akan dihapus dari semua perangkat. Layanan yang memakai key ini di API Key Usage akan berhenti bekerja.`}
          confirmLabel="Hapus"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            const removed = deleting
            keys.remove(removed.id)
            toast("Key dihapus", "Batalkan", () => keys.restore(removed))
            setDeleting(null)
          }}
        />
      )}
      {gate && (
        <PasswordPrompt
          reason={gate.reason}
          onClose={() => setGate(null)}
          onUnlocked={() => {
            const pending = gate
            setGate(null)
            pending.run()
          }}
        />
      )}
    </div>
  )
}

interface KeyCardProps {
  item: SavedKey
  categories: SavedCategory[]
  revealed: boolean
  reordering: boolean
  onReveal: () => void
  onCopy: () => void
  onPin: () => void
  onEdit: () => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}

function KeyCard({ item, categories, revealed, reordering, onReveal, onCopy, onPin, onEdit, onDelete, onMove }: KeyCardProps) {
  const validity = keyValidity(item)
  return (
    <ItemCard color={item.color}>
      <h3 className="t-heading clamp-2 break">{item.title}</h3>
      <p className={revealed ? "t-mono break" : "t-mono clip"} style={{ marginTop: 2 }} aria-label={revealed ? undefined : "Nilai disamarkan"}>
        {revealed ? item.keyValue : "•".repeat(Math.min(Math.max(item.keyValue.length, 8), 24))}
      </p>
      {item.note && <p className="muted break" style={{ marginTop: 2 }}>{item.note}</p>}
      <div className="row wrap gap-6" style={{ marginTop: 4 }}>
        <Tag text={validity.text} icon={validity.warn ? "TriangleAlert" : "CalendarCheck"} fill={validity.warn ? "#e5484d" : undefined} />
        <CategoryTag id={item.category} categories={categories} />
      </div>
      <div className="item__actions">
        <span className="spacer" />
        {reordering ? (
          <>
            <FlatButton icon="ArrowUp" label={`Naikkan ${item.title}`} onClick={() => onMove(-1)} />
            <FlatButton icon="ArrowDown" label={`Turunkan ${item.title}`} onClick={() => onMove(1)} />
          </>
        ) : (
          <>
            <FlatButton icon={revealed ? "EyeOff" : "Eye"} label={revealed ? `Sembunyikan nilai ${item.title}` : `Lihat nilai ${item.title}`} onClick={onReveal} />
            <FlatButton icon="Copy" label={`Salin ${item.title}`} onClick={onCopy} />
            <FlatButton icon="Pin" label={item.pinned ? "Lepas sematan" : "Sematkan"} active={item.pinned} onClick={onPin} />
            <FlatButton icon="Pencil" label={`Ubah ${item.title}`} onClick={onEdit} />
            <FlatButton icon="Trash2" label={`Hapus ${item.title}`} danger onClick={onDelete} />
          </>
        )}
      </div>
    </ItemCard>
  )
}

export function PasswordPrompt({ reason, onUnlocked, onClose }: { reason: string; onUnlocked: () => void; onClose: () => void }) {
  const [password, setPassword] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  if (resetting) {
    return (
      <Sheet title="Reset password Keys" onClose={onClose} variant="center">
        <form
          className="col"
          onSubmit={(event) => {
            event.preventDefault()
            const auth = authStore.get()
            const current = auth.status === "signedIn" ? auth.user.email : ""
            if (!current || email.trim().toLowerCase() !== current.toLowerCase()) {
              setError("Email tidak sama dengan akun yang masuk.")
              return
            }
            void setKeysPassword(null).then(() => {
              toast("Password Keys dihapus. Buat yang baru di Pengaturan.")
              onClose()
            })
          }}
        >
          <p className="muted">Ketik email akun Google yang sedang masuk. Kalau cocok, password Keys di perangkat ini dihapus.</p>
          <TextField label="Email akun" value={email} onChange={(value) => { setEmail(value); setError(null) }} error={error} type="email" autoFocus />
          <div className="sheet__actions">
            <Button tone="neutral" onClick={() => { setResetting(false); setError(null) }}>
              Kembali
            </Button>
            <Button tone="danger" type="submit">
              Reset
            </Button>
          </div>
        </form>
      </Sheet>
    )
  }
  return (
    <Sheet title="Masukkan password Keys" onClose={onClose} variant="center">
      <form
        className="col"
        onSubmit={(event) => {
          event.preventDefault()
          void verifyKeysPassword(password).then((ok) => (ok ? onUnlocked() : setError("Password salah.")))
        }}
      >
        <p className="muted">Diperlukan untuk {reason}.</p>
        <TextField
          label="Password"
          value={password}
          onChange={(value) => { setPassword(value); setError(null) }}
          error={error}
          type="password"
          autoComplete="current-password"
          autoFocus
        />
        <div className="sheet__actions">
          <Button tone="neutral" onClick={() => { setResetting(true); setError(null) }}>
            Lupa
          </Button>
          <Button icon="LockOpen" type="submit">
            Buka
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function KeyForm({ initial, onClose, onSubmit }: { initial: SavedKey | null; onClose: () => void; onSubmit: (key: SavedKey) => void }) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [value, setValue] = useState(initial?.keyValue ?? "")
  const [lifetime, setLifetime] = useState(initial?.lifetime ?? true)
  const [validUntil, setValidUntil] = useState<number | null>(initial?.validUntil ?? null)
  const [category, setCategory] = useState(initial?.category ?? defaultCategory)
  const [color, setColor] = useState(() => initial?.color ?? getRandomColor())
  const [note, setNote] = useState(initial?.note ?? "")
  const [submitted, setSubmitted] = useState(false)
  const dateMissing = !lifetime && validUntil === null

  return (
    <Sheet title={initial ? "Ubah key" : "Key baru"} onClose={onClose}>
      <form
        className="col gap-14"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
          if (!title.trim() || !value.trim() || dateMissing) return
          onSubmit({
            id: initial?.id ?? "",
            title: title.trim(),
            keyValue: value.trim(),
            validUntil: lifetime ? null : validUntil,
            lifetime,
            category,
            icon: initial?.icon ?? { type: "lucide", value: "Key" },
            color,
            note: note.trim(),
            pinned: initial?.pinned ?? false,
            order: initial?.order ?? 0,
            createdAt: initial?.createdAt ?? 0,
            updatedAt: 0,
          })
        }}
      >
        <TextField
          label="Judul"
          value={title}
          onChange={setTitle}
          placeholder="Contoh: Jira API token"
          error={submitted && !title.trim() ? "Judul wajib diisi." : null}
          autoFocus={!initial}
        />
        <TextArea
          label="Key"
          value={value}
          onChange={setValue}
          placeholder="Tempel nilai key di sini"
          mono
          rows={2}
          spellCheck={false}
          error={submitted && !value.trim() ? "Nilai key wajib diisi." : null}
        />
        <div className="field">
          <span className="field__label">Masa berlaku</span>
          <Switch checked={lifetime} onChange={setLifetime} label="Lifetime" description="Tidak punya tanggal kedaluwarsa" />
          {!lifetime && (
            <TextField
              label="Berlaku sampai"
              type="date"
              value={validUntil === null ? "" : toLocalInput(validUntil, false)}
              onChange={(next) => {
                const day = fromLocalInput(next)
                setValidUntil(day === null ? null : endOfDay(day))
              }}
              error={submitted && dateMissing ? "Pilih tanggal, atau aktifkan Lifetime." : null}
            />
          )}
        </div>
        <CategoryPicker scope="keys" value={category} onChange={setCategory} />
        <ColorPicker value={color} onChange={setColor} />
        <TextArea label="Catatan" value={note} onChange={setNote} placeholder="Untuk apa key ini dipakai (opsional)" rows={2} />
        <div className="sheet__actions">
          <Button tone="neutral" onClick={onClose}>
            Batal
          </Button>
          <Button icon="Check" type="submit">
            {initial ? "Simpan perubahan" : "Simpan key"}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
