import { useMemo, useState, type ReactNode } from "react"
import { breadcrumbs, categories as categoryRepo, keys, links } from "@/data/repos"
import { authStore, firebaseProjectId, signOut, useEmulator } from "@/firebase"
import { CATEGORY_SCOPES, moveCategory } from "@/lib/categories"
import { useStore } from "@/lib/store"
import { installStore, promptInstall } from "@/pwa"
import { ALL_VIEWS, VIEW_META, moveTab, setKeysPassword, updateSettings, useSettings, verifyKeysPassword, type ThemeMode } from "@/settings"
import type { CategoryScope, SavedCategory } from "@/types"
import { Button, Chip, ConfirmDialog, FlatButton, IconButton, IconPickerSheet, Segmented, Sheet, Switch, TextField } from "@/ui/components"
import { Icon } from "@/ui/icons"
import { toast } from "@/ui/toast"
import { TempSettings } from "./temp"

interface Section {
  id: string
  title: string
  subtitle: string
  icon: string
  render: () => ReactNode
}

const sections: Section[] = [
  { id: "tampilan", title: "Tampilan", subtitle: "Terang, gelap, atau ikut sistem", icon: "SunMoon", render: () => <Appearance /> },
  { id: "password", title: "Password Keys", subtitle: "Kunci aksi salin, ubah, dan hapus key", icon: "Lock", render: () => <KeysPassword /> },
  { id: "default-tab", title: "Tab Default", subtitle: "Tab yang terbuka pertama", icon: "House", render: () => <DefaultTab /> },
  { id: "tab-order", title: "Urutan Tab", subtitle: "Susunan tab di bilah navigasi", icon: "ArrowUpDown", render: () => <TabOrder /> },
  { id: "kategori", title: "Kategori", subtitle: "Kategori untuk Links, Breadcrumb, dan Keys", icon: "Tags", render: () => <Categories /> },
  { id: "temp", title: "Temp", subtitle: "Retensi, tema gelembung, ukuran teks", icon: "MessagesSquare", render: () => <TempSettings /> },
  { id: "pasang", title: "Pasang aplikasi", subtitle: "Buka Saver dari layar utama atau dock", icon: "MonitorDown", render: () => <Install /> },
  { id: "tentang", title: "Tentang", subtitle: "Versi, akun, dan lokasi data", icon: "Info", render: () => <About /> },
]

export function SettingsScreen({ section }: { section: string | undefined }) {
  const auth = useStore(authStore)
  const [confirming, setConfirming] = useState(false)
  const active = sections.find((item) => item.id === section)
  const shown = active ?? sections[0]
  const email = auth.status === "signedIn" ? auth.user.email : ""

  return (
    <div className={`settings ${active ? "settings--detail" : "settings--menu"}`}>
      <nav className="settings__menu" aria-label="Bagian pengaturan">
        {sections.map((item) => (
          <a key={item.id} className="brutal pressable list-row" href={`#/settings/${item.id}`} aria-current={active?.id === item.id ? "page" : undefined}>
            <Icon name={item.icon} size={22} />
            <span className="grow">
              <span className="t-heading" style={{ display: "block" }}>{item.title}</span>
              <span className="t-caption muted">{item.subtitle}</span>
            </span>
            <Icon name="ChevronRight" size={18} />
          </a>
        ))}
        <Button icon="LogOut" tone="neutral" block onClick={() => setConfirming(true)} style={{ marginTop: 8 }}>
          <span className="clip">Keluar dari {email || "akun ini"}</span>
        </Button>
      </nav>
      <section className="settings__panel" aria-labelledby="settings-title">
        <div className="row" style={{ gap: 10 }}>
          <a className="brutal pressable icon-btn settings__back" href="#/settings" aria-label="Kembali ke daftar pengaturan">
            <Icon name="ArrowLeft" />
          </a>
          <h2 className="t-title" id="settings-title">{shown.title}</h2>
        </div>
        {shown.render()}
      </section>
      {confirming && (
        <ConfirmDialog
          title="Keluar dari Saver?"
          message="Data tetap aman di akun Google kamu. Pengaturan perangkat (tema, password Keys, urutan tab) tidak ikut terhapus."
          confirmLabel="Keluar"
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            void signOut()
          }}
        />
      )}
    </div>
  )
}

function Appearance() {
  const settings = useSettings()
  return (
    <div className="field">
      <span className="field__label">Mode tampilan</span>
      <Segmented<ThemeMode>
        label="Mode tampilan"
        value={settings.theme}
        onChange={(theme) => updateSettings({ theme })}
        options={[{ value: "system", label: "Sistem" }, { value: "light", label: "Terang" }, { value: "dark", label: "Gelap" }]}
      />
      <p className="field__hint">Sistem mengikuti mode gelap atau terang perangkat dan berubah otomatis.</p>
    </div>
  )
}

function KeysPassword() {
  const settings = useSettings()
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [current, setCurrent] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intro = <p className="muted">Password ini hanya disimpan di perangkat ini sebagai hash. Dipakai saat menyalin, melihat, mengubah, atau menghapus key.</p>

  if (!settings.keysPassword) {
    const tooShort = password.length < 4
    const mismatch = password !== repeat
    return (
      <form
        className="col gap-14"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
          if (tooShort || mismatch) return
          void setKeysPassword(password).then(() => {
            setPassword("")
            setRepeat("")
            setSubmitted(false)
            toast("Password Keys dibuat")
          })
        }}
      >
        {intro}
        <TextField label="Password baru" type="password" autoComplete="new-password" value={password} onChange={setPassword} error={submitted && tooShort ? "Minimal 4 karakter." : null} />
        <TextField label="Ulangi password" type="password" autoComplete="new-password" value={repeat} onChange={setRepeat} error={submitted && !tooShort && mismatch ? "Tidak sama dengan password di atas." : null} />
        <div>
          <Button icon="Lock" type="submit">Buat password</Button>
        </div>
      </form>
    )
  }
  return (
    <div className="col gap-14">
      {intro}
      <div className="brutal panel" style={{ ["--sh" as string]: "0px" }}>
        <h3 className="t-heading">Aksi yang meminta password</h3>
        <Switch label="Salin dan lihat nilai key" checked={settings.requirePasswordOnCopy} onChange={(value) => updateSettings({ requirePasswordOnCopy: value })} />
        <Switch label="Ubah key" checked={settings.requirePasswordOnEdit} onChange={(value) => updateSettings({ requirePasswordOnEdit: value })} />
        <Switch label="Hapus key" checked={settings.requirePasswordOnDelete} onChange={(value) => updateSettings({ requirePasswordOnDelete: value })} />
      </div>
      <form
        className="col"
        onSubmit={(event) => {
          event.preventDefault()
          void verifyKeysPassword(current).then((ok) => {
            if (!ok) {
              setError("Password salah.")
              return
            }
            void setKeysPassword(null).then(() => {
              setCurrent("")
              toast("Password Keys dihapus")
            })
          })
        }}
      >
        <h3 className="t-heading">Hapus password</h3>
        <TextField label="Password saat ini" type="password" autoComplete="current-password" value={current} onChange={(value) => { setCurrent(value); setError(null) }} error={error} />
        <div>
          <Button icon="LockOpen" tone="danger" type="submit" disabled={!current}>Hapus password</Button>
        </div>
      </form>
    </div>
  )
}

function DefaultTab() {
  const settings = useSettings()
  return (
    <div className="field">
      <p className="muted">Tab ini yang tampil saat Saver dibuka.</p>
      <div className="chip-wrap" role="radiogroup" aria-label="Tab default">
        {settings.tabOrder.map((view) => (
          <Chip key={view} role="radio" label={VIEW_META[view].label} icon={VIEW_META[view].icon} selected={settings.defaultView === view} onClick={() => updateSettings({ defaultView: view })} />
        ))}
      </div>
    </div>
  )
}

function TabOrder() {
  const settings = useSettings()
  const isDefault = settings.tabOrder.every((view, index) => view === ALL_VIEWS[index])
  return (
    <div className="col">
      {settings.tabOrder.map((view, index) => (
        <div key={view} className="brutal order-row">
          <span className="order-row__num">{index + 1}</span>
          <Icon name={VIEW_META[view].icon} />
          <span className="t-strong grow">{VIEW_META[view].label}</span>
          <FlatButton icon="ArrowUp" label={`Naikkan ${VIEW_META[view].label}`} disabled={index === 0} onClick={() => moveTab(view, -1)} />
          <FlatButton icon="ArrowDown" label={`Turunkan ${VIEW_META[view].label}`} disabled={index === settings.tabOrder.length - 1} onClick={() => moveTab(view, 1)} />
        </div>
      ))}
      <div>
        <Button icon="RotateCcw" tone="neutral" disabled={isDefault} onClick={() => updateSettings({ tabOrder: [...ALL_VIEWS] })}>
          Kembalikan urutan bawaan
        </Button>
      </div>
    </div>
  )
}

const QUICK_ICONS = [
  "Tag", "Globe", "Briefcase", "Book", "Code", "Sparkles", "PanelsTopLeft", "Palette", "Newspaper", "Users", "Film", "ShoppingCart",
  "Wallet", "Heart", "Ellipsis", "Star", "Rocket", "Server", "Database", "Cloud", "Terminal", "Bug", "Wrench", "Music", "Camera",
  "Gamepad2", "GraduationCap", "House", "Plane", "Coffee", "Lightbulb", "Shield", "KeyRound", "Mail", "Calendar", "Folder",
]

function Categories() {
  const list = categoryRepo.use()
  const failed = categoryRepo.useFailed()
  const linkItems = links.use()
  const breadcrumbItems = breadcrumbs.use()
  const keyItems = keys.use()
  const [draft, setDraft] = useState("")
  const [renaming, setRenaming] = useState<SavedCategory | null>(null)
  const [picking, setPicking] = useState<SavedCategory | null>(null)
  const [deleting, setDeleting] = useState<SavedCategory | null>(null)

  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const state of [linkItems, breadcrumbItems, keyItems]) {
      if (state.status !== "ready") continue
      for (const item of state.value) counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
    }
    return counts
  }, [linkItems, breadcrumbItems, keyItems])

  const add = () => {
    if (categoryRepo.add(draft, null)) setDraft("")
  }
  const toggleScope = (category: SavedCategory, scope: CategoryScope) => {
    const scopes = category.scopes.includes(scope) ? category.scopes.filter((item) => item !== scope) : [...category.scopes, scope]
    categoryRepo.update(category.id, { scopes })
  }

  return (
    <div className="col gap-14">
      {failed && (
        <div className="brutal banner" role="alert">
          <Icon name="TriangleAlert" />
          <p>Firestore menolak akses ke koleksi categories, jadi yang tampil adalah daftar bawaan. Deploy security rules dari repo extension lalu buka lagi layar ini.</p>
        </div>
      )}
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="grow">
          <TextField
            label="Kategori baru"
            value={draft}
            onChange={setDraft}
            placeholder="Nama kategori"
            onKeyDown={(event) => {
              if (event.key === "Enter") add()
            }}
          />
        </div>
        <IconButton icon="Plus" label="Tambah kategori" primary disabled={!draft.trim()} onClick={add} />
      </div>
      <p className="muted">Kategori tanpa pilihan tab muncul di semua tab. Menghapus kategori tidak menghapus item di dalamnya.</p>
      {list.length === 0 && <p className="muted">Tidak ada kategori. Tambah di atas atau pulihkan daftar bawaan.</p>}
      {list.map((category, index) => (
        <div key={category.id} className="brutal category-row">
          <div className="row">
            <IconButton icon={category.icon} label={`Ganti ikon ${category.label}`} onClick={() => setPicking(category)} style={{ ["--sh" as string]: "0px" }} />
            <span className="grow">
              <span className="t-strong clip" style={{ display: "block" }}>{category.label}</span>
              <span className="t-caption muted">{usage.get(category.id) ?? 0} item</span>
            </span>
            <FlatButton icon="ArrowUp" label={`Naikkan ${category.label}`} disabled={index === 0} onClick={() => categoryRepo.saveOrder(moveCategory(list, category.id, -1))} />
            <FlatButton icon="ArrowDown" label={`Turunkan ${category.label}`} disabled={index === list.length - 1} onClick={() => categoryRepo.saveOrder(moveCategory(list, category.id, 1))} />
            <FlatButton icon="Pencil" label={`Ganti nama ${category.label}`} onClick={() => setRenaming(category)} />
            <FlatButton icon="Trash2" label={`Hapus ${category.label}`} danger onClick={() => setDeleting(category)} />
          </div>
          <div className="chip-row" role="group" aria-label={`Tab untuk ${category.label}`}>
            {CATEGORY_SCOPES.map((scope) => (
              <Chip key={scope.id} label={scope.label} selected={category.scopes.includes(scope.id)} onClick={() => toggleScope(category, scope.id)} />
            ))}
          </div>
        </div>
      ))}
      <div>
        <Button icon="RotateCcw" tone="neutral" onClick={() => { categoryRepo.restoreDefaults(); toast("Kategori bawaan dipulihkan") }}>
          Pulihkan kategori bawaan
        </Button>
      </div>
      {picking && (
        <IconPickerSheet selected={picking.icon} quick={QUICK_ICONS} onClose={() => setPicking(null)} onSelect={(icon) => categoryRepo.update(picking.id, { icon })} />
      )}
      {renaming && <RenameCategory category={renaming} onClose={() => setRenaming(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Hapus kategori?"
          message={`"${deleting.label}" dihapus dari daftar. ${usage.get(deleting.id) ?? 0} item di dalamnya tetap ada dan tetap menyimpan nama kategori ini.`}
          confirmLabel="Hapus"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            categoryRepo.remove(deleting.id)
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}

function RenameCategory({ category, onClose }: { category: SavedCategory; onClose: () => void }) {
  const [label, setLabel] = useState(category.label)
  return (
    <Sheet title="Ganti nama kategori" onClose={onClose} variant="center">
      <form
        className="col"
        onSubmit={(event) => {
          event.preventDefault()
          if (!label.trim()) return
          categoryRepo.update(category.id, { label: label.trim() })
          onClose()
        }}
      >
        <TextField label="Nama kategori" value={label} onChange={setLabel} autoFocus />
        <div className="sheet__actions">
          <Button tone="neutral" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={!label.trim()}>Simpan</Button>
        </div>
      </form>
    </Sheet>
  )
}

function Install() {
  const state = useStore(installStore)
  if (state.installed) {
    return <p className="muted">Saver sudah berjalan sebagai aplikasi terpasang di perangkat ini.</p>
  }
  if (state.available) {
    return (
      <div className="col gap-14">
        <p className="muted">Saver dipasang sebagai aplikasi sendiri: punya ikon di layar utama atau dock, terbuka tanpa bilah alamat, dan tetap bisa dibuka saat offline.</p>
        <div>
          <Button icon="MonitorDown" onClick={() => void promptInstall().then((accepted) => accepted && toast("Saver terpasang"))}>
            Pasang aplikasi
          </Button>
        </div>
      </div>
    )
  }
  if (state.ios) {
    return (
      <ol className="gate__steps">
        {["Buka Saver di Safari.", "Ketuk tombol Bagikan di bilah bawah.", "Pilih Tambah ke Layar Utama, lalu Tambah."].map((step, index) => (
          <li key={index} className="brutal">
            <span className="gate__num">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    )
  }
  return (
    <p className="muted">
      Browser ini belum menawarkan pemasangan. Di Chrome atau Edge, buka menu browser lalu pilih Instal Saver atau Transmisikan, simpan, dan bagikan. Di Safari Mac, pilih File lalu Tambahkan ke Dock. Firefox desktop tidak mendukung pemasangan aplikasi web.
    </p>
  )
}

function About() {
  const auth = useStore(authStore)
  const user = auth.status === "signedIn" ? auth.user : null
  return (
    <div className="col gap-14">
      <div className="brutal panel" style={{ ["--sh" as string]: "0px" }}>
        <h3 className="t-heading">Saver Web {__APP_VERSION__}</h3>
        <p className="muted break">{[user?.name, user?.email].filter(Boolean).join(" · ") || "Belum masuk"}</p>
      </div>
      <div className="brutal panel" style={{ ["--sh" as string]: "0px" }}>
        <h3 className="t-heading">Lokasi data</h3>
        <p className="muted">
          {useEmulator ? "Emulator Firebase lokal (demo-saver), bukan data asli." : `Firestore proyek ${firebaseProjectId}, sama dengan extension Saver.`} Preferensi tampilan dan password Keys hanya di browser ini.
        </p>
      </div>
    </div>
  )
}
