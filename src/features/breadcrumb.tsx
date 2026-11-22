import { useMemo, useState } from "react"
import { getRandomColor } from "@/constants/colors"
import { breadcrumbs, categories as categoryRepo } from "@/data/repos"
import { itemsOf } from "@/data/core"
import { categoriesForScope, resolveCategoryLabel } from "@/lib/categories"
import { domainOf, faviconUrl, formatRelative, isValidUrl, normalizeUrl } from "@/lib/format"
import { updateSettings, useSettings } from "@/settings"
import type { Breadcrumb, SavedCategory } from "@/types"
import {
  Button,
  CategoryFilter,
  CategoryTag,
  CategoryPicker,
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
  SectionTitle,
  Sheet,
  TextArea,
  TextField,
} from "@/ui/components"
import { Icon } from "@/ui/icons"
import { copyText, toast } from "@/ui/toast"

export function BreadcrumbScreen() {
  const state = breadcrumbs.use()
  const allCategories = categoryRepo.use()
  const grouped = useSettings().breadcrumbGrouped
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const [form, setForm] = useState<Breadcrumb | "new" | null>(null)
  const [deleting, setDeleting] = useState<Breadcrumb | null>(null)

  const all = itemsOf(state)
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return all.filter(
      (item) =>
        (category === null || item.category === category) &&
        (!needle || [item.title, item.url, item.description].some((text) => text.toLowerCase().includes(needle))),
    )
  }, [all, query, category])
  const used = useMemo(() => new Set(all.map((item) => item.category)), [all])
  const groups = useMemo(() => {
    const byCategory = new Map<string, Breadcrumb[]>()
    visible.forEach((item) => byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]))
    const known = allCategories.filter((item) => byCategory.has(item.id)).map((item) => item.id)
    const unknown = [...byCategory.keys()].filter((id) => id && !known.includes(id))
    return [...known, ...unknown, ...(byCategory.has("") ? [""] : [])].map((id) => ({
      id,
      label: id ? resolveCategoryLabel(allCategories, id) : "Tanpa kategori",
      items: byCategory.get(id) ?? [],
    }))
  }, [visible, allCategories])

  const card = (item: Breadcrumb) => (
    <BreadcrumbCard
      key={item.id}
      item={item}
      categories={grouped ? null : allCategories}
      onEdit={() => setForm(item)}
      onDelete={() => setDeleting(item)}
    />
  )

  return (
    <div className="screen">
      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Cari breadcrumb" />
        <IconButton
          icon={grouped ? "Rows3" : "FolderTree"}
          label={grouped ? "Tampilkan sebagai daftar" : "Kelompokkan per kategori"}
          onClick={() => updateSettings({ breadcrumbGrouped: !grouped })}
        />
        <Button icon="Plus" className="desktop-only" onClick={() => setForm("new")}>
          Jejak baru
        </Button>
      </div>
      <CategoryFilter categories={categoriesForScope(allCategories, "breadcrumb")} used={used} value={category} onChange={setCategory} />

      {state.status === "loading" && <LoadingList />}
      {state.status === "failed" && <ErrorState message={state.message} onRetry={breadcrumbs.retry} />}
      {state.status === "ready" && all.length === 0 && (
        <EmptyState
          icon="Footprints"
          title="Belum ada jejak"
          body="Breadcrumb untuk halaman yang mau kamu buka lagi nanti. Tempel URL-nya di sini, atau simpan dari extension."
          actionLabel="Simpan jejak pertama"
          onAction={() => setForm("new")}
        />
      )}
      {state.status === "ready" && all.length > 0 && visible.length === 0 && (
        <EmptyState icon="SearchX" title="Tidak ada yang cocok" body="Tidak ada breadcrumb untuk pencarian atau kategori ini." />
      )}
      {state.status === "ready" && visible.length > 0 && !grouped && <div className="card-grid">{visible.map(card)}</div>}
      {state.status === "ready" &&
        visible.length > 0 &&
        grouped &&
        groups.map((group) => (
          <section key={group.id || "__none"} className="col">
            <SectionTitle>
              {group.label} ({group.items.length})
            </SectionTitle>
            <div className="card-grid">{group.items.map(card)}</div>
          </section>
        ))}

      <button type="button" className="brutal pressable fab" aria-label="Jejak baru" onClick={() => setForm("new")}>
        <Icon name="Plus" size={24} />
      </button>
      {form && (
        <BreadcrumbForm
          initial={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSubmit={(item) => {
            const isNew = !item.id
            breadcrumbs.save({ ...item, order: isNew ? all.length : item.order })
            toast(isNew ? "Breadcrumb disimpan" : "Breadcrumb diperbarui")
            setForm(null)
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Hapus breadcrumb?"
          message={`"${deleting.title || deleting.url}" akan dihapus dari semua perangkat.`}
          confirmLabel="Hapus"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            const removed = deleting
            breadcrumbs.remove(removed.id)
            toast("Breadcrumb dihapus", "Batalkan", () => breadcrumbs.restore(removed))
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}

function BreadcrumbCard({ item, categories, onEdit, onDelete }: { item: Breadcrumb; categories: SavedCategory[] | null; onEdit: () => void; onDelete: () => void }) {
  const name = item.title || domainOf(item.url)
  const image = item.icon.type === "lucide" ? faviconUrl(item.url) : item.icon.value || faviconUrl(item.url)
  return (
    <ItemCard color={item.color}>
      <a className="row" style={{ gap: 12, color: "inherit", textDecoration: "none" }} href={item.url} target="_blank" rel="noopener noreferrer">
        <ItemIcon icon={{ type: "favicon", value: image }} fallback="Footprints" size={36} />
        <span className="grow">
          <span className="t-strong clamp-2 break">{name}</span>
          <span className="t-caption muted clip" style={{ display: "block" }}>
            {domainOf(item.url)} · {formatRelative(item.createdAt)}
          </span>
        </span>
      </a>
      {item.description && <p className="muted clamp-2 break" style={{ marginTop: 4 }}>{item.description}</p>}
      <div className="item__actions">
        {categories && (
          <span style={{ marginLeft: 10 }}>
            <CategoryTag id={item.category} categories={categories} />
          </span>
        )}
        <span className="spacer" />
        <FlatButton icon="Copy" label={`Salin URL ${name}`} onClick={() => void copyText(item.url, "URL")} />
        <FlatButton icon="Pencil" label={`Ubah ${name}`} onClick={onEdit} />
        <FlatButton icon="Trash2" label={`Hapus ${name}`} danger onClick={onDelete} />
      </div>
    </ItemCard>
  )
}

function BreadcrumbForm({ initial, onClose, onSubmit }: { initial: Breadcrumb | null; onClose: () => void; onSubmit: (item: Breadcrumb) => void }) {
  const [url, setUrl] = useState(initial?.url ?? "")
  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [category, setCategory] = useState(initial?.category ?? "")
  const [color, setColor] = useState(() => initial?.color ?? getRandomColor())
  const [submitted, setSubmitted] = useState(false)
  const cleanUrl = normalizeUrl(url)

  return (
    <Sheet title={initial ? "Ubah breadcrumb" : "Jejak baru"} onClose={onClose}>
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
            title: title.trim() || domainOf(cleanUrl),
            category,
            description: description.trim(),
            icon: initial && initial.url === cleanUrl ? initial.icon : { type: "favicon", value: faviconUrl(cleanUrl) },
            color,
            order: initial?.order ?? 0,
            createdAt: initial?.createdAt ?? 0,
            updatedAt: 0,
          })
        }}
      >
        <TextField
          label="URL"
          value={url}
          onChange={setUrl}
          placeholder="https://"
          type="url"
          inputMode="url"
          autoFocus={!initial}
          error={submitted && !isValidUrl(cleanUrl) ? "Isi URL yang valid, contoh https://github.com" : null}
        />
        <TextField label="Judul halaman" value={title} onChange={setTitle} placeholder="Kosongkan untuk memakai nama domain" />
        <TextArea label="Deskripsi" value={description} onChange={setDescription} placeholder="Kenapa halaman ini disimpan (opsional)" rows={2} />
        <CategoryPicker scope="breadcrumb" value={category} onChange={setCategory} allowNone />
        <ColorPicker value={color} onChange={setColor} />
        <div className="sheet__actions">
          <Button tone="neutral" onClick={onClose}>
            Batal
          </Button>
          <Button icon="Check" type="submit">
            {initial ? "Simpan perubahan" : "Simpan jejak"}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
