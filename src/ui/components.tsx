import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react"
import { colorPalettes } from "@/constants/colors"
import { categories as categoryRepo } from "@/data/repos"
import { categoriesForScope, resolveCategoryLabel } from "@/lib/categories"
import { contrastOn, isHexColor, safeColor } from "@/lib/format"
import { useStore } from "@/lib/store"
import type { BookmarkIcon, CategoryScope, SavedCategory } from "@/types"
import { Icon, iconNames } from "./icons"
import { dismissToast, toastStore } from "./toast"

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ")
}

type Tone = "primary" | "neutral" | "accent" | "danger"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: string
  tone?: Tone
  compact?: boolean
  block?: boolean
}

export function Button({ icon, tone = "primary", compact, block, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("brutal pressable btn", tone !== "primary" && `btn--${tone}`, compact && "btn--compact", block && "btn--block", className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={compact ? 16 : 18} />}
      {children}
    </button>
  )
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: string
  label: string
  primary?: boolean
}

/** Outlined square icon button with the hard shadow, for primary screen actions. */
export function IconButton({ icon, label, primary, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button type={type} className={cx("brutal pressable icon-btn", primary && "icon-btn--primary", className)} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  )
}

interface FlatButtonProps extends IconButtonProps {
  active?: boolean
  danger?: boolean
}

/** Borderless icon action for dense rows (card actions). */
export function FlatButton({ icon, label, active, danger, className, type = "button", ...rest }: FlatButtonProps) {
  return (
    <button
      type={type}
      className={cx("flat-btn", active && "flat-btn--active", danger && "flat-btn--danger", className)}
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  )
}

interface ChipProps {
  label: string
  selected: boolean
  onClick: () => void
  icon?: string
  fill?: string
  role?: "radio"
}

export function Chip({ label, selected, onClick, icon, fill, role }: ChipProps) {
  const style = fill && selected ? ({ "--chip-fill": fill, "--chip-ink": contrastOn(fill) } as CSSProperties) : undefined
  return (
    <button
      type="button"
      className="brutal pressable chip"
      style={style}
      role={role}
      aria-pressed={role ? undefined : selected}
      aria-checked={role ? selected : undefined}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={16} />}
      {label}
    </button>
  )
}

/** Static label. `solid` is the ink-filled block used for an item's type, so it never reads as a category. */
export function Tag({ text, icon, fill, solid }: { text: string; icon?: string; fill?: string; solid?: boolean }) {
  const style = fill ? ({ "--tag-fill": fill, "--tag-ink": contrastOn(fill) } as CSSProperties) : undefined
  return (
    <span className={solid ? "tag tag--solid" : "tag"} style={style}>
      {icon && <Icon name={icon} size={13} />}
      <span>{text}</span>
    </span>
  )
}

/** Category label: outlined, with the category's own icon and a colour stripe when the category has a colour. */
export function CategoryTag({ id, categories }: { id: string; categories: SavedCategory[] }) {
  const label = resolveCategoryLabel(categories, id)
  if (!label) return null
  const category = categories.find((item) => item.id === id)
  const stripe = category?.color && isHexColor(category.color) ? category.color : "var(--ink)"
  return (
    <span className="tag tag--category" style={{ "--tag-stripe": stripe } as CSSProperties}>
      <Icon name={category?.icon ?? "Folder"} size={13} />
      <span>{label}</span>
    </span>
  )
}

interface FieldShellProps {
  label?: string
  hint?: string
  error?: string | null
  id: string
  children: ReactNode
  leading?: string
  trailing?: ReactNode
}

function FieldShell({ label, hint, error, id, children, leading, trailing }: FieldShellProps) {
  return (
    <div className="field">
      {label && (
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className={cx("field__box", error && "field__box--error")}>
        {leading && <Icon name={leading} size={18} className="muted" />}
        {children}
        {trailing}
      </div>
      {error ? (
        <p className="field__error" id={`${id}-msg`} role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p className="field__hint" id={`${id}-msg`}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  label?: string
  value: string
  onChange: (value: string) => void
  hint?: string
  error?: string | null
  mono?: boolean
  leading?: string
  trailing?: ReactNode
  inputRef?: Ref<HTMLInputElement>
}

export function TextField({ label, value, onChange, hint, error, mono, leading, trailing, inputRef, id, ...rest }: TextFieldProps) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId} leading={leading} trailing={trailing}>
      <input
        id={fieldId}
        ref={inputRef}
        className={cx("field__input", mono && "field__input--mono")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
        autoComplete="off"
        {...rest}
      />
    </FieldShell>
  )
}

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  label?: string
  value: string
  onChange: (value: string) => void
  hint?: string
  error?: string | null
  mono?: boolean
}

export function TextArea({ label, value, onChange, hint, error, mono, id, ...rest }: TextAreaProps) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId}>
      <textarea
        id={fieldId}
        className={cx("field__input", mono && "field__input--mono")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
        {...rest}
      />
    </FieldShell>
  )
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> {
  label?: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  hint?: string
}

export function SelectField({ label, value, onChange, options, hint, id, ...rest }: SelectFieldProps) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <FieldShell label={label} hint={hint} id={fieldId} trailing={<Icon name="ChevronDown" size={18} />}>
      <select id={fieldId} className="field__input" value={value} onChange={(event) => onChange(event.target.value)} {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /** Focuses the field when "/" is pressed outside an input. */
  shortcut?: boolean
}

export function SearchField({ value, onChange, placeholder, shortcut = true }: SearchFieldProps) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!shortcut) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target?.closest("input, textarea, select, [contenteditable='true']")
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !document.querySelector("dialog[open]")) {
        event.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [shortcut])
  return (
    <TextField
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      aria-label={placeholder}
      type="search"
      enterKeyHint="search"
      leading="Search"
      inputRef={ref}
      onKeyDown={(event) => {
        if (event.key === "Escape" && value) onChange("")
      }}
      trailing={
        value ? (
          <FlatButton icon="X" label="Hapus pencarian" onClick={() => onChange("")} />
        ) : shortcut ? (
          <kbd className="desktop-only" aria-hidden="true">
            /
          </kbd>
        ) : undefined
      }
    />
  )
}

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="grow">
        <span className="t-strong">{label}</span>
        {description && <span className="t-caption muted" style={{ display: "block" }}>{description}</span>}
      </span>
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
    </button>
  )
}

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label: string
}

export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface SheetProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** centre: short prompts that stay centred on phones too. wide: large editors on desktop. */
  variant?: "sheet" | "center" | "wide"
}

/** Bottom sheet on phones, centred dialog on wide screens. Native <dialog> gives focus trapping and Esc. */
export function Sheet({ title, onClose, children, variant = "sheet" }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className={cx("sheet", variant !== "sheet" && `sheet--${variant}`)}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      <div className="sheet__head">
        <h2 className="t-title grow" id={titleId}>
          {title}
        </h2>
        <FlatButton icon="X" label="Tutup" onClick={onClose} />
      </div>
      <div className="sheet__body">{children}</div>
    </dialog>
  )
}

interface ConfirmProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  danger?: boolean
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose, danger }: ConfirmProps) {
  return (
    <Sheet title={title} onClose={onClose} variant="center">
      <p className="muted">{message}</p>
      <div className="sheet__actions">
        <Button tone="neutral" onClick={onClose}>
          Batal
        </Button>
        <Button tone={danger ? "danger" : "primary"} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  )
}

export function Toasts() {
  const list = useStore(toastStore)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((item) => (
        <div key={item.id} className="toast">
          <span className="grow break">{item.text}</span>
          {item.actionLabel && (
            <button
              type="button"
              onClick={() => {
                item.onAction?.()
                dismissToast(item.id)
              }}
            >
              {item.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

interface EmptyStateProps {
  icon: string
  title: string
  body: string
  actionLabel?: string
  actionIcon?: string
  onAction?: () => void
}

export function EmptyState({ icon, title, body, actionLabel, actionIcon = "Plus", onAction }: EmptyStateProps) {
  return (
    <div className="state">
      <div className="brutal state__badge">
        <Icon name={icon} size={30} />
      </div>
      <h2 className="t-title">{title}</h2>
      <p className="muted">{body}</p>
      {actionLabel && onAction && (
        <Button icon={actionIcon} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <div className="brutal state__badge state__badge--danger">
        <Icon name="CircleAlert" size={30} />
      </div>
      <h2 className="t-title">Data tidak bisa dimuat</h2>
      <p className="muted">{message}</p>
      {onRetry && (
        <Button icon="RefreshCw" tone="neutral" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  )
}

/** Loading placeholder drawn in the shape of the item cards that are about to appear. */
export function LoadingList({ rows = 5, grid = true }: { rows?: number; grid?: boolean }) {
  return (
    <div className={cx("skeleton", grid && "card-grid")} role="status" aria-label="Memuat data">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton__card">
          <div className="skeleton__bar" />
          <div className="skeleton__lines">
            <div className="bone" style={{ width: "60%", height: 18 }} />
            <div className="bone" style={{ width: "90%" }} />
            <div className="bone" style={{ width: "45%" }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ItemCard({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  return (
    <article className={cx("brutal item", className)}>
      <div className="item__bar" style={{ background: safeColor(color) }} />
      <div className="item__body">{children}</div>
    </article>
  )
}

/** Favicon or custom image with a Lucide fallback when the image is missing or fails to load. */
export function ItemIcon({ icon, fallback, size = 40 }: { icon: BookmarkIcon; fallback: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const isImage = (icon.type === "favicon" || icon.type === "custom") && icon.value && !failed
  return (
    <span className="favicon" style={{ width: size, height: size }}>
      {isImage ? (
        <img src={icon.value} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <Icon name={icon.type === "lucide" && icon.value ? icon.value : fallback} size={Math.round(size * 0.5)} />
      )}
    </span>
  )
}

export function ColorPicker({ value, onChange, label = "Warna" }: { value: string; onChange: (hex: string) => void; label?: string }) {
  const inPalette = colorPalettes.some((option) => option.hex === value.toLowerCase())
  const [custom, setCustom] = useState(inPalette ? "" : value)
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {colorPalettes.map((option) => {
          const active = option.hex === value.toLowerCase()
          return (
            <button
              key={option.hex}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Warna ${option.name}`}
              title={option.name}
              className="swatch"
              style={{ background: option.hex, color: contrastOn(option.hex) }}
              onClick={() => {
                setCustom("")
                onChange(option.hex)
              }}
            >
              {active && <Icon name="Check" />}
            </button>
          )
        })}
      </div>
      <TextField
        label="Hex kustom"
        value={custom}
        mono
        placeholder="#2699d2"
        maxLength={7}
        onChange={(next) => {
          setCustom(next)
          if (isHexColor(next)) onChange(next.toLowerCase())
        }}
        error={custom && !isHexColor(custom) ? "Format: # diikuti 6 digit hex" : null}
      />
    </div>
  )
}

interface CategoryPickerProps {
  scope: CategoryScope
  value: string
  onChange: (id: string) => void
  allowNone?: boolean
}

export function CategoryPicker({ scope, value, onChange, allowNone }: CategoryPickerProps) {
  const all = categoryRepo.use()
  const options = categoriesForScope(all, scope)
  const [draft, setDraft] = useState("")
  const add = () => {
    const id = categoryRepo.add(draft, scope)
    if (id) {
      onChange(id)
      setDraft("")
    }
  }
  return (
    <div className="field">
      <span className="field__label">Kategori</span>
      <div className="chip-wrap" role="radiogroup" aria-label="Kategori">
        {allowNone && <Chip role="radio" label="Tanpa kategori" selected={value === ""} onClick={() => onChange("")} />}
        {options.map((category) => (
          <Chip
            key={category.id}
            role="radio"
            label={category.label}
            icon={category.icon}
            selected={value === category.id}
            fill={category.color || undefined}
            onClick={() => onChange(category.id)}
          />
        ))}
      </div>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="grow">
          <TextField
            label="Kategori baru"
            value={draft}
            onChange={setDraft}
            placeholder="Nama kategori"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                add()
              }
            }}
          />
        </div>
        <IconButton icon="Plus" label="Tambah kategori" onClick={add} disabled={!draft.trim()} />
      </div>
    </div>
  )
}

interface CategoryFilterProps {
  categories: SavedCategory[]
  /** Only categories that have at least one item are offered. */
  used: Set<string>
  value: string | null
  onChange: (id: string | null) => void
}

/** Horizontal filter strip: "Semua" plus one chip per category in use. */
export function CategoryFilter({ categories, used, value, onChange }: CategoryFilterProps) {
  const shown = categories.filter((category) => used.has(category.id))
  if (shown.length === 0) return null
  return (
    <div className="chip-row" role="group" aria-label="Filter kategori">
      <Chip label="Semua" selected={value === null} onClick={() => onChange(null)} />
      {shown.map((category) => (
        <Chip
          key={category.id}
          label={category.label}
          icon={category.icon}
          selected={value === category.id}
          fill={category.color || undefined}
          onClick={() => onChange(value === category.id ? null : category.id)}
        />
      ))}
    </div>
  )
}

interface IconPickerProps {
  selected: string
  quick: string[]
  onSelect: (name: string) => void
  onClose: () => void
}

export function IconPickerSheet({ selected, quick, onSelect, onClose }: IconPickerProps) {
  const [query, setQuery] = useState("")
  const needle = query.trim().toLowerCase().replace(/[\s-]+/g, "")
  const shown = needle ? iconNames().filter((name) => name.toLowerCase().includes(needle)).slice(0, 120) : quick
  return (
    <Sheet title="Pilih ikon" onClose={onClose}>
      <SearchField value={query} onChange={setQuery} placeholder="Cari nama ikon, contoh: rocket" shortcut={false} />
      {shown.length === 0 && <p className="muted">Tidak ada ikon dengan nama itu.</p>}
      <div className="swatches">
        {shown.map((name) => (
          <button
            key={name}
            type="button"
            className="swatch"
            aria-label={`Ikon ${name}`}
            aria-pressed={name === selected}
            title={name}
            style={name === selected ? { background: "var(--primary)", color: "var(--on-primary)" } : { background: "var(--surface)" }}
            onClick={() => {
              onSelect(name)
              onClose()
            }}
          >
            <Icon name={name} />
          </button>
        ))}
      </div>
    </Sheet>
  )
}

export function SectionTitle({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="section-title">
      <h2 className="t-heading">{children}</h2>
      {trailing}
    </div>
  )
}
