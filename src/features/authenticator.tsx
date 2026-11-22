import { useEffect, useMemo, useRef, useState } from "react"
import { getRandomColor } from "@/constants/colors"
import { authenticator } from "@/data/repos"
import { itemsOf } from "@/data/core"
import { downloadText } from "@/lib/format"
import {
  buildOtpUri,
  decryptOtpExport,
  encryptedPayload,
  hotp,
  isValidBase32,
  normalizeSecret,
  parseOtpImport,
  parseOtpUri,
  splitCode,
  type OtpAlgorithm,
  type ParsedOtp,
} from "@/lib/otp"
import { moveVisible } from "@/lib/reorder"
import type { TOTPAccount } from "@/types"
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
  TextField,
} from "@/ui/components"
import { Icon } from "@/ui/icons"
import { copyText, toast } from "@/ui/toast"

/** Wall clock for the countdown: four times a second, or once a second when motion is reduced. */
function useNow(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
    const timer = setInterval(() => setNow(Date.now()), reduce ? 1000 : 250)
    return () => clearInterval(timer)
  }, [])
  return now
}

function stepOf(account: TOTPAccount, now: number): number {
  return account.otpType === "hotp" ? account.counter : Math.floor(now / 1000 / Math.max(account.period, 1))
}

/** Current code per account id. Recomputed only when an account's counter or time step changes. */
function useCodes(accounts: TOTPAccount[], now: number): Map<string, string> {
  const [codes, setCodes] = useState<Map<string, string>>(new Map())
  const signature = accounts.map((a) => `${a.id}:${a.secret}:${a.algorithm}:${a.digits}:${stepOf(a, now)}`).join("|")
  const latest = useRef(accounts)
  latest.current = accounts
  useEffect(() => {
    let cancelled = false
    const at = Date.now()
    void Promise.all(
      latest.current.map(async (a) => [a.id, await hotp(a.secret, stepOf(a, at), a.algorithm, a.digits).catch(() => "-".repeat(a.digits))] as const),
    ).then((entries) => {
      if (!cancelled) setCodes(new Map(entries))
    })
    return () => {
      cancelled = true
    }
  }, [signature])
  return codes
}

function newAccount(parsed: ParsedOtp, order: number): TOTPAccount {
  return {
    id: "",
    issuer: parsed.issuer.trim() || "Tanpa nama",
    accountName: parsed.accountName,
    secret: parsed.secret,
    algorithm: parsed.algorithm,
    digits: parsed.digits,
    period: parsed.period,
    otpType: parsed.type,
    counter: parsed.counter,
    icon: { type: "lucide", value: "ShieldCheck" },
    color: getRandomColor(),
    pinned: false,
    order,
    createdAt: 0,
    updatedAt: 0,
  }
}

export function AuthenticatorScreen() {
  const state = authenticator.use()
  const now = useNow()
  const [query, setQuery] = useState("")
  const [reordering, setReordering] = useState(false)
  const [form, setForm] = useState<{ initial: TOTPAccount | null; prefill: ParsedOtp | null } | null>(null)
  const [deleting, setDeleting] = useState<TOTPAccount | null>(null)
  const [menu, setMenu] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [confirmExport, setConfirmExport] = useState(false)
  const [pendingEncrypted, setPendingEncrypted] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const all = itemsOf(state)
  const codes = useCodes(all, now)
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return all.filter((a) => !needle || a.issuer.toLowerCase().includes(needle) || a.accountName.toLowerCase().includes(needle))
  }, [all, query])
  const pinned = all.filter((a) => a.pinned)

  const copy = (account: TOTPAccount) => {
    const code = codes.get(account.id)
    if (code) void copyText(code, "Kode")
  }
  const addParsed = (parsed: ParsedOtp[]) => {
    if (parsed.length === 0) {
      toast("Tidak ada akun yang bisa diimpor dari file ini")
      return
    }
    parsed.forEach((entry, index) => authenticator.save(newAccount(entry, all.length + index)))
    toast(`${parsed.length} akun diimpor`)
  }
  const importText = (text: string) => {
    const encrypted = encryptedPayload(text)
    if (encrypted) setPendingEncrypted(encrypted)
    else addParsed(parseOtpImport(text))
  }

  return (
    <div className="screen">
      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Cari akun" />
        <IconButton icon="QrCode" label="Scan QR" onClick={() => setScanning(true)} />
        <IconButton
          icon={reordering ? "Check" : "Ellipsis"}
          label={reordering ? "Selesai mengurutkan" : "Impor, ekspor, dan urutkan"}
          onClick={() => (reordering ? setReordering(false) : setMenu(true))}
          style={reordering ? { background: "var(--accent)", color: "var(--on-accent)" } : undefined}
        />
        <Button icon="Plus" className="desktop-only" onClick={() => setForm({ initial: null, prefill: null })}>
          Akun baru
        </Button>
      </div>

      {state.status === "loading" && <LoadingList />}
      {state.status === "failed" && <ErrorState message={state.message} onRetry={authenticator.retry} />}
      {state.status === "ready" && all.length === 0 && (
        <EmptyState
          icon="ShieldCheck"
          title="Belum ada akun 2FA"
          body="Scan QR dari layanan yang kamu amankan, isi secret secara manual, atau impor file otpauth dari menu titik tiga di atas."
          actionLabel="Scan QR"
          actionIcon="QrCode"
          onAction={() => setScanning(true)}
        />
      )}
      {state.status === "ready" && all.length > 0 && (
        <>
          {pinned.length > 0 && !query.trim() && !reordering && (
            <div className="field">
              <span className="field__label">Disematkan, klik untuk menyalin</span>
              <div className="chip-row">
                {pinned.map((account) => (
                  <Chip
                    key={account.id}
                    label={`${account.issuer || account.accountName}  ${splitCode(codes.get(account.id) ?? "")}`}
                    icon="Pin"
                    selected
                    fill="#ffd23f"
                    onClick={() => copy(account)}
                  />
                ))}
              </div>
            </div>
          )}
          {visible.length === 0 ? (
            <EmptyState icon="SearchX" title="Tidak ada yang cocok" body="Tidak ada akun dengan nama itu." />
          ) : (
            <div className="card-grid">
              {visible.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  code={codes.get(account.id) ?? ""}
                  now={now}
                  reordering={reordering}
                  onCopy={() => copy(account)}
                  onNext={() => authenticator.patch(account.id, { counter: account.counter + 1 }, "Memperbarui counter")}
                  onPin={() => authenticator.patch(account.id, { pinned: !account.pinned }, "Menyematkan akun")}
                  onEdit={() => setForm({ initial: account, prefill: null })}
                  onDelete={() => setDeleting(account)}
                  onMove={(direction) => authenticator.setOrders(moveVisible(all, visible, account.id, direction))}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!reordering && (
        <button type="button" className="brutal pressable fab" aria-label="Akun baru" onClick={() => setForm({ initial: null, prefill: null })}>
          <Icon name="Plus" size={24} />
        </button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".txt,.json,text/plain,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (!file) return
          file.text().then(
            (text) => (text.trim() ? importText(text) : toast("File tidak bisa dibaca")),
            () => toast("File tidak bisa dibaca"),
          )
        }}
      />

      {menu && (
        <Sheet title="Authenticator" onClose={() => setMenu(false)}>
          <Button icon="FileUp" tone="neutral" block onClick={() => { setMenu(false); fileInput.current?.click() }}>
            Impor dari file (.txt atau .json)
          </Button>
          <Button icon="Download" tone="neutral" block disabled={all.length === 0} onClick={() => { setMenu(false); setConfirmExport(true) }}>
            Ekspor semua sebagai URI otpauth
          </Button>
          <Button icon="ArrowUpDown" tone="neutral" block disabled={all.length < 2} onClick={() => { setMenu(false); setReordering(true) }}>
            Urutkan akun
          </Button>
        </Sheet>
      )}
      {scanning && (
        <QrScanner
          onClose={() => setScanning(false)}
          onResult={(text) => {
            const parsed = parseOtpUri(text)
            if (!parsed) {
              toast("QR ini bukan kode otpauth:// yang didukung")
              return
            }
            setScanning(false)
            setForm({ initial: null, prefill: parsed })
          }}
        />
      )}
      {confirmExport && (
        <ConfirmDialog
          title="Ekspor secret 2FA?"
          message="File ekspor berisi secret semua akun dalam bentuk teks biasa. Siapa pun yang memegangnya bisa membuat kode OTP kamu. Simpan hanya di tempat yang kamu percaya."
          confirmLabel="Ekspor"
          danger
          onClose={() => setConfirmExport(false)}
          onConfirm={() => {
            setConfirmExport(false)
            downloadText(
              "saver-authenticator.txt",
              all.map((a) => buildOtpUri({ type: a.otpType, issuer: a.issuer, accountName: a.accountName, secret: a.secret, algorithm: a.algorithm, digits: a.digits, period: a.period, counter: a.counter })).join("\n"),
            )
          }}
        />
      )}
      {form && (
        <AccountForm
          initial={form.initial}
          prefill={form.prefill}
          onClose={() => setForm(null)}
          onSubmit={(account) => {
            const isNew = !account.id
            authenticator.save({ ...account, order: isNew ? all.length : account.order })
            toast(isNew ? "Akun ditambahkan" : "Akun diperbarui")
            setForm(null)
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Hapus akun 2FA?"
          message={`Kode untuk "${deleting.issuer || deleting.accountName}" tidak bisa dibuat lagi dari Saver. Pastikan kamu punya cara masuk lain ke layanan itu.`}
          confirmLabel="Hapus"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            const removed = deleting
            authenticator.remove(removed.id)
            toast("Akun dihapus", "Batalkan", () => authenticator.restore(removed))
            setDeleting(null)
          }}
        />
      )}
      {pendingEncrypted && (
        <EncryptedImport
          cipher={pendingEncrypted}
          onClose={() => setPendingEncrypted(null)}
          onPlain={(plain) => {
            setPendingEncrypted(null)
            addParsed(parseOtpImport(plain))
          }}
        />
      )}
    </div>
  )
}

function EncryptedImport({ cipher, onClose, onPlain }: { cipher: string; onClose: () => void; onPlain: (plain: string) => void }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet title="File impor terenkripsi" onClose={onClose} variant="center">
      <form
        className="col"
        onSubmit={(event) => {
          event.preventDefault()
          void decryptOtpExport(cipher, password).then((plain) => (plain ? onPlain(plain) : setError("Password salah atau file rusak.")))
        }}
      >
        <p className="muted">Masukkan password yang dipakai saat file ini diekspor.</p>
        <TextField label="Password" type="password" value={password} onChange={(value) => { setPassword(value); setError(null) }} error={error} autoFocus />
        <div className="sheet__actions">
          <Button tone="neutral" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit">Buka file</Button>
        </div>
      </form>
    </Sheet>
  )
}

/** Countdown ring: drains clockwise and turns red in the last five seconds. */
function Countdown({ period, now }: { period: number; now: number }) {
  const safe = Math.max(period, 1)
  const remaining = safe - (Math.floor(now / 1000) % safe)
  const fraction = 1 - (now % (safe * 1000)) / (safe * 1000)
  const urgent = remaining <= 5
  const length = 2 * Math.PI * 18
  const color = urgent ? "var(--danger)" : "var(--primary)"
  return (
    <div className="countdown" role="timer" aria-label={`${remaining} detik lagi`}>
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--surface-alt)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - fraction)}
          transform="rotate(-90 22 22)"
        />
      </svg>
      <span className="t-label" aria-hidden="true">
        {remaining}
      </span>
    </div>
  )
}

interface AccountCardProps {
  account: TOTPAccount
  code: string
  now: number
  reordering: boolean
  onCopy: () => void
  onNext: () => void
  onPin: () => void
  onEdit: () => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}

function AccountCard({ account, code, now, reordering, onCopy, onNext, onPin, onEdit, onDelete, onMove }: AccountCardProps) {
  const isHotp = account.otpType === "hotp"
  const name = account.issuer || account.accountName
  const period = Math.max(account.period, 1)
  const expiring = !isHotp && period - (Math.floor(now / 1000) % period) <= 5
  return (
    <ItemCard color={account.color}>
      <div className="row" style={{ gap: 10 }}>
        <button type="button" className="otp grow" disabled={reordering || !code} onClick={onCopy} aria-label={`Salin kode ${name}`}>
          <span className="t-heading clip">{name}</span>
          {account.issuer && account.accountName && <span className="muted clip">{account.accountName}</span>}
          <span key={code} className="otp__code" style={expiring ? { color: "var(--danger)" } : undefined} aria-label={`Kode ${code.split("").join(" ")}`}>
            {code ? splitCode(code) : "··· ···"}
          </span>
        </button>
        {isHotp ? <IconButton icon="RefreshCw" label={`Kode berikutnya untuk ${name}`} onClick={onNext} /> : <Countdown period={account.period} now={now} />}
      </div>
      <div className="item__actions">
        <span className="t-caption muted clip" style={{ marginLeft: 10 }}>
          {reordering ? "" : "Klik kode untuk menyalin"}
        </span>
        <span className="spacer" />
        {reordering ? (
          <>
            <FlatButton icon="ArrowUp" label={`Naikkan ${name}`} onClick={() => onMove(-1)} />
            <FlatButton icon="ArrowDown" label={`Turunkan ${name}`} onClick={() => onMove(1)} />
          </>
        ) : (
          <>
            <FlatButton icon="Pin" label={account.pinned ? "Lepas sematan" : "Sematkan"} active={account.pinned} onClick={onPin} />
            <FlatButton icon="Pencil" label={`Ubah ${name}`} onClick={onEdit} />
            <FlatButton icon="Trash2" label={`Hapus ${name}`} danger onClick={onDelete} />
          </>
        )}
      </div>
    </ItemCard>
  )
}

interface AccountFormProps {
  initial: TOTPAccount | null
  prefill: ParsedOtp | null
  onClose: () => void
  onSubmit: (account: TOTPAccount) => void
}

function AccountForm({ initial, prefill, onClose, onSubmit }: AccountFormProps) {
  const [issuer, setIssuer] = useState(initial?.issuer ?? prefill?.issuer ?? "")
  const [account, setAccount] = useState(initial?.accountName ?? prefill?.accountName ?? "")
  const [secret, setSecret] = useState(initial?.secret ?? prefill?.secret ?? "")
  const [type, setType] = useState<"totp" | "hotp">(initial?.otpType ?? prefill?.type ?? "totp")
  const [algorithm, setAlgorithm] = useState<OtpAlgorithm>(initial?.algorithm ?? prefill?.algorithm ?? "SHA1")
  const [digits, setDigits] = useState(String(initial?.digits ?? prefill?.digits ?? 6))
  const [period, setPeriod] = useState(String(initial?.period ?? prefill?.period ?? 30))
  const [counter, setCounter] = useState(String(initial?.counter ?? prefill?.counter ?? 0))
  const [color, setColor] = useState(() => initial?.color ?? getRandomColor())
  const [uri, setUri] = useState("")
  const [uriError, setUriError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const cleanSecret = normalizeSecret(secret)
  const secretError = !submitted
    ? null
    : !cleanSecret
      ? "Secret wajib diisi."
      : !isValidBase32(cleanSecret)
        ? "Secret harus Base32: huruf A sampai Z dan angka 2 sampai 7."
        : null
  const periodOptions = [...new Set(["30", "60", period])].map((value) => ({ value, label: `${value} dtk` }))

  const fillFromUri = () => {
    const parsed = parseOtpUri(uri)
    if (!parsed) {
      setUriError("URI tidak dikenali.")
      return
    }
    setIssuer(parsed.issuer)
    setAccount(parsed.accountName)
    setSecret(parsed.secret)
    setType(parsed.type)
    setAlgorithm(parsed.algorithm)
    setDigits(String(parsed.digits))
    setPeriod(String(parsed.period))
    setCounter(String(parsed.counter))
    setUri("")
  }

  return (
    <Sheet title={initial ? "Ubah akun 2FA" : "Akun 2FA baru"} onClose={onClose}>
      <form
        className="col gap-14"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
          if (!cleanSecret || !isValidBase32(cleanSecret)) return
          onSubmit({
            id: initial?.id ?? "",
            issuer: issuer.trim() || (account.trim() ? "" : "Tanpa nama"),
            accountName: account.trim(),
            secret: cleanSecret,
            algorithm,
            digits: Number(digits),
            period: Number(period),
            otpType: type,
            counter: Number.parseInt(counter, 10) || 0,
            icon: { type: "lucide", value: "ShieldCheck" },
            color,
            pinned: initial?.pinned ?? false,
            order: initial?.order ?? 0,
            createdAt: initial?.createdAt ?? 0,
            updatedAt: 0,
          })
        }}
      >
        {!initial && (
          <div className="row" style={{ alignItems: uriError ? "center" : "flex-end" }}>
            <div className="grow">
              <TextField
                label="Tempel URI otpauth (opsional)"
                value={uri}
                onChange={(value) => { setUri(value); setUriError(null) }}
                placeholder="otpauth://totp/..."
                mono
                error={uriError}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && uri.trim()) {
                    event.preventDefault()
                    fillFromUri()
                  }
                }}
              />
            </div>
            <IconButton icon="ArrowDownToLine" label="Isi form dari URI" disabled={!uri.trim()} onClick={fillFromUri} />
          </div>
        )}
        <TextField label="Penerbit" value={issuer} onChange={setIssuer} placeholder="Contoh: GitHub" />
        <TextField label="Nama akun" value={account} onChange={setAccount} placeholder="Email atau username" />
        <TextField label="Secret (Base32)" value={secret} onChange={setSecret} mono error={secretError} spellCheck={false} autoCapitalize="characters" />
        <div className="field">
          <span className="field__label">Jenis kunci</span>
          <Segmented label="Jenis kunci" value={type} onChange={setType} options={[{ value: "totp", label: "Berbasis waktu" }, { value: "hotp", label: "Berbasis counter" }]} />
        </div>
        <div className="field">
          <span className="field__label">Algoritma</span>
          <Segmented
            label="Algoritma"
            value={algorithm}
            onChange={setAlgorithm}
            options={[{ value: "SHA1", label: "SHA-1" }, { value: "SHA256", label: "SHA-256" }, { value: "SHA512", label: "SHA-512" }]}
          />
        </div>
        <div className="field-grid">
          <div className="field">
            <span className="field__label">Digit</span>
            <Segmented label="Digit" value={digits} onChange={setDigits} options={[{ value: "6", label: "6" }, { value: "8", label: "8" }]} />
          </div>
          {type === "totp" ? (
            <div className="field">
              <span className="field__label">Periode</span>
              <Segmented label="Periode" value={period} onChange={setPeriod} options={periodOptions} />
            </div>
          ) : (
            <TextField label="Counter" value={counter} onChange={(value) => setCounter(value.replace(/\D/g, "").slice(0, 12))} mono inputMode="numeric" />
          )}
        </div>
        <ColorPicker value={color} onChange={setColor} />
        <div className="sheet__actions">
          <Button tone="neutral" onClick={onClose}>
            Batal
          </Button>
          <Button icon="Check" type="submit">
            {initial ? "Simpan perubahan" : "Tambah akun"}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

type ScanState = { status: "starting" } | { status: "scanning" } | { status: "failed"; message: string }

/** Reads a QR code from the camera, or from an image file when the camera is not available. */
function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<ScanState>({ status: "starting" })
  const handler = useRef(onResult)
  handler.current = onResult

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false
    const canvas = document.createElement("canvas")
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState({ status: "failed", message: "Browser ini tidak memberi akses kamera. Pilih gambar QR dari file." })
        return
      }
      try {
        const [{ default: jsQR }, media] = await Promise.all([
          import("jsqr"),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }),
        ])
        stream = media
        if (stopped || !video.current) {
          media.getTracks().forEach((track) => track.stop())
          return
        }
        video.current.srcObject = media
        await video.current.play()
        setState({ status: "scanning" })
        let last = ""
        const tick = () => {
          const element = video.current
          if (stopped || !element) return
          if (element.readyState >= 2 && element.videoWidth > 0) {
            const scale = Math.min(1, 640 / element.videoWidth)
            canvas.width = Math.round(element.videoWidth * scale)
            canvas.height = Math.round(element.videoHeight * scale)
            const context = canvas.getContext("2d", { willReadFrequently: true })
            if (context) {
              context.drawImage(element, 0, 0, canvas.width, canvas.height)
              const found = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
              if (found?.data && found.data !== last) {
                last = found.data
                handler.current(found.data)
              }
            }
          }
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      } catch (error) {
        const name = (error as DOMException | null)?.name
        setState({
          status: "failed",
          message:
            name === "NotAllowedError"
              ? "Izin kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser, atau pilih gambar QR dari file."
              : "Kamera tidak bisa dibuka. Pilih gambar QR dari file.",
        })
      }
    }
    void start()
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const readFile = async (file: File) => {
    try {
      const [{ default: jsQR }, bitmap] = await Promise.all([import("jsqr"), createImageBitmap(file)])
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Canvas unavailable")
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const found = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
      if (found?.data) onResult(found.data)
      else toast("Tidak ada QR yang terbaca di gambar itu")
    } catch (error) {
      console.warn("QR image could not be read", error)
      toast("Gambar tidak bisa dibaca")
    }
  }

  return (
    <Sheet title="Scan QR" onClose={onClose}>
      <div className="scanner brutal">
        <video ref={video} muted playsInline aria-label="Pratinjau kamera" />
        {state.status === "starting" && <p className="scanner__note">Membuka kamera...</p>}
        {state.status === "failed" && <p className="scanner__note" role="alert">{state.message}</p>}
      </div>
      {state.status === "scanning" && <p className="muted">Arahkan kamera ke QR 2FA dari layanan yang ingin kamu tambahkan.</p>}
      <label className="brutal pressable btn btn--neutral btn--block">
        <Icon name="ImageUp" size={18} />
        Pilih gambar QR
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void readFile(file)
          }}
        />
      </label>
    </Sheet>
  )
}
