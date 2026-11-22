import { useMemo, useState } from "react"
import { getRandomColor } from "@/constants/colors"
import { defaultCategory } from "@/constants/categories"
import { bookmarkTypes } from "@/constants/types"
import { categories as categoryRepo, links } from "@/data/repos"
import { itemsOf } from "@/data/core"
import { categoriesForScope, resolveCategoryLabel } from "@/lib/categories"
import { domainOf, faviconUrl, isValidUrl, normalizeUrl } from "@/lib/format"
import { moveVisible } from "@/lib/reorder"
import type { Bookmark, SavedCategory } from "@/types"
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
  ItemIcon,
  LoadingList,
  SearchField,
  Sheet,
  Tag,
  TextArea,
  TextField,
} from "@/ui/components"
import { Icon } from "@/ui/icons"
import { copyText, toast } from "@/ui/toast"

export function LinksScreen() {
  const state = links.use()
  const allCategories = categoryRepo.use()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const [form, setForm] = useState<Bookmark | "new" | null>(null)
  const [deleting, setDeleting] = useState<Bookmark | null>(null)

  const all = itemsOf(state)
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return all.filter(
      (item) =>
        (category === null || item.category === category) &&
        (!needle ||
          [item.alias, item.url, item.description, resolveCategoryLabel(allCategories, item.category)].some((text) =>
            text.toLowerCase().includes(needle),
          )),
    )
  }, [all, allCategories, query, category])
  const pinned = all.filter((item) => item.pinned)
  const filtering = query.trim() !== "" || category !== null
  const used = useMemo(() => new Set(all.map((item) => item.category)), [all])

  const save = (bookmark: Bookmark) => {
    const isNew = !bookmark.id
    links.save({ ...bookmark, order: isNew ? all.length : bookmark.order })
    toast(isNew ? "Link disimpan" : "Link diperbarui")
    setForm(null)
  }

  return (
    <div className="screen">
      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Cari link" />
        <IconButton
          icon={reordering ? "Check" : "ArrowUpDown"}
          label={reordering ? "Selesai mengurutkan" : "Urutkan link"}
          onClick={() => setReordering(!reordering)}
          aria-pressed={reordering}
          style={reordering ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}
        />
        <Button icon="Plus" className="desktop-only" onClick={() => setForm("new")}>
          Link baru
        </Button>
      </div>
      <CategoryFilter categories={categoriesForScope(allCategories, "links")} used={used} value={category} onChange={setCategory} />

      {state.status === "loading" && <LoadingList />}
      {state.status === "failed" && <ErrorState message={state.message} onRetry={links.retry} />}
      {state.status === "ready" && all.length === 0 && (
        <EmptyState
          icon="Link2"
          title="Belum ada link"
          body="Simpan URL yang sering kamu buka. Link yang tersimpan di sini juga muncul di extension dan aplikasi Android."
          actionLabel="Simpan link pertama"
          onAction={() => setForm("new")}
        />
      )}
      {state.status === "ready" && all.length > 0 && (
        <>
          {pinned.length > 0 && !filtering && !reordering && (
            <div className="field">
              <span className="field__label">Favorit</span>
              <div className="chip-row">
                {pinned.map((item) => (
                  <a
                    key={item.id}
                    className="brutal pressable chip"
                    style={{ background: "var(--accent)", color: "var(--on-accent)", ["--sh" as string]: "2px", textDecoration: "none" }}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="Pin" size={16} />
                    {item.alias || domainOf(item.url)}
                  </a>
                ))}
              </div>
            </div>
          )}
          {visible.length === 0 ? (
            <EmptyState
              icon="SearchX"
              title="Tidak ada yang cocok"
              body="Tidak ada link untuk pencarian atau kategori ini. Ubah kata kunci atau pilih Semua."
            />
          ) : (
            <div className="card-grid">
              {visible.map((item) => (
                <LinkCard
                  key={item.id}
                  item={item}
                  categories={allCategories}
                  reordering={reordering}
                  onPin={() => links.patch(item.id, { pinned: !item.pinned }, "Menyematkan link")}
                  onEdit={() => setForm(item)}
                  onDelete={() => setDeleting(item)}
                  onMove={(direction) => links.setOrders(moveVisible(all, visible, item.id, direction))}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!reordering && (
        <button type="button" className="brutal pressable fab" aria-label="Link baru" onClick={() => setForm("new")}>
          <Icon name="Plus" size={24} />
        </button>
      )}
      {form && <LinkForm initial={form === "new" ? null : form} onClose={() => setForm(null)} onSubmit={save} />}
      {deleting && (
        <ConfirmDialog
          title="Hapus link?"
          message={`"${deleting.alias || deleting.url}" akan dihapus dari semua perangkat. Kamu masih bisa membatalkan sesaat setelahnya.`}
          confirmLabel="Hapus"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            const removed = deleting
            links.remove(removed.id)
            toast("Link dihapus", "Batalkan", () => links.restore(removed))
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}

interface LinkCardProps {
  item: Bookmark
  categories: SavedCategory[]
  reordering: boolean
  onPin: () => void
  onEdit: () => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}

function LinkCard({ item, categories, reordering, onPin, onEdit, onDelete, onMove }: LinkCardProps) {
  const type = bookmarkTypes.find((option) => option.id === item.type) ?? bookmarkTypes[0]
  const name = item.alias || domainOf(item.url)
  return (
    <ItemCard color={item.color}>
      <a className="row" style={{ gap: 12, color: "inherit", textDecoration: "none" }} href={item.url} target="_blank" rel="noopener noreferrer">
        <ItemIcon icon={{ type: "favicon", value: faviconUrl(item.url) }} fallback={type.icon} />
        <span className="grow">
          <span className="t-heading clamp-2 break">{name}</span>
          <span className="muted clip" style={{ display: "block" }}>
            {domainOf(item.url) || item.url}
          </span>
        </span>
      </a>
      {item.description && <p className="muted clamp-2 break" style={{ marginTop: 4 }}>{item.description}</p>}
      <div className="row wrap gap-6" style={{ marginTop: 4 }}>
        <Tag text={type.label} icon={type.icon} solid />
        <CategoryTag id={item.category} categories={categories} />
      </div>
      <div className="item__actions">
        <span className="spacer" />
        {reordering ? (
          <>
            <FlatButton icon="ArrowUp" label={`Naikkan ${name}`} onClick={() => onMove(-1)} />
            <FlatButton icon="ArrowDown" label={`Turunkan ${name}`} onClick={() => onMove(1)} />
          </>
        ) : (
          <>
            <FlatButton icon="Copy" label={`Salin URL ${name}`} onClick={() => void copyText(item.url, "URL")} />
            <FlatButton icon="Pin" label={item.pinned ? "Lepas dari favorit" : "Jadikan favorit"} active={item.pinned} onClick={onPin} />
            <FlatButton icon="Pencil" label={`Ubah ${name}`} onClick={onEdit} />
            <FlatButton icon="Trash2" label={`Hapus ${name}`} danger onClick={onDelete} />
          </>
        )}
      </div>
    </ItemCard>
  )
}

function LinkForm({ initial, onClose, onSubmit }: { initial: Bookmark | null; onClose: () => void; onSubmit: (bookmark: Bookmark) => void }) {
  const [url, setUrl] = useState(initial?.url ?? "")
  const [alias, setAlias] = useState(initial?.alias ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [type, setType] = useState(initial?.type ?? "link")
  const [category, setCategory] = useState(initial?.category ?? defaultCategory)
  const [color, setColor] = useState(() => initial?.color ?? getRandomColor())
  const [submitted, setSubmitted] = useState(false)
  const cleanUrl = normalizeUrl(url)
  const urlError = submitted && !isValidUrl(cleanUrl) ? "Isi URL yang valid, contoh https://github.com" : null

  return (
    <Sheet title={initial ? "Ubah link" : "Link baru"} onClose={onClose}>
      <form
        className="col gap-14"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
          if (!isValidUrl(cleanUrl)) return
          onSubmit({
            id: initial?.id ?? "",
            url: cleanUrl,
            alias: alias.trim() || domainOf(cleanUrl),
            description: description.trim(),
            type,
            category,
            icon: initial?.icon ?? { type: "lucide", value: "Link" },
            color,
            pinned: initial?.pinned ?? false,
            order: initial?.order ?? 0,
            tags: initial?.tags ?? [],
            createdAt: initial?.createdAt ?? 0,
            updatedAt: 0,
          })
        }}
      >
        <TextField label="URL" value={url} onChange={setUrl} placeholder="https://" error={urlError} type="url" inputMode="url" autoFocus={!initial} />
        <TextField label="Alias" value={alias} onChange={setAlias} placeholder="Nama pendek untuk link ini" hint="Kosongkan untuk memakai nama domain." />
        <TextArea label="Deskripsi" value={description} onChange={setDescription} placeholder="Catatan singkat (opsional)" rows={2} />
        <div className="field">
          <span className="field__label">Tipe</span>
          <div className="chip-wrap" role="radiogroup" aria-label="Tipe">
            {bookmarkTypes.map((option) => (
              <Chip key={option.id} role="radio" label={option.label} icon={option.icon} selected={option.id === type} onClick={() => setType(option.id)} />
            ))}
          </div>
        </div>
        <CategoryPicker scope="links" value={category} onChange={setCategory} />
        <ColorPicker value={color} onChange={setColor} />
        <div className="sheet__actions">
          <Button tone="neutral" onClick={onClose}>
            Batal
          </Button>
          <Button icon="Check" type="submit">
            {initial ? "Simpan perubahan" : "Simpan link"}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
