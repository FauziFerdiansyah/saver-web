import { useState } from "react"
import { signInEmulator, signInWithGoogle, useEmulator } from "@/firebase"
import { Button } from "@/ui/components"
import { Icon } from "@/ui/icons"

function Brand() {
  return (
    <div className="row" style={{ gap: 14 }}>
      <span className="brutal logo" style={{ width: 64, height: 64 }}>
        <img src="./icons/logo.svg" alt="" width="44" height="44" style={{ width: 44, height: 44 }} />
      </span>
      <h1 className="t-display">Saver</h1>
    </div>
  )
}

export function SetupScreen() {
  const steps = [
    "Salin .env.example menjadi .env di folder proyek saver-web.",
    "Buka Firebase Console, pilih proyek yang dipakai extension Saver, lalu buka Project settings.",
    "Di bagian Your apps, pilih aplikasi Web dan salin nilai konfigurasinya ke VITE_FIREBASE_* di .env.",
    "Pastikan metode masuk Google aktif di Authentication, dan domain situs ini ada di Authorized domains.",
    "Jalankan npm run build lagi (atau npm run dev), lalu muat ulang halaman ini.",
  ]
  return (
    <main className="gate">
      <Brand />
      <h2 className="t-title">Firebase belum dikonfigurasi</h2>
      <p className="muted">Build ini tidak membawa konfigurasi Firebase, jadi belum bisa masuk atau membaca data. Ikuti langkah di bawah, lalu build ulang aplikasinya.</p>
      <ol className="gate__steps">
        {steps.map((step, index) => (
          <li key={index} className="brutal">
            <span className="gate__num">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </main>
  )
}

export function LoginScreen() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<string | null>) => {
    setBusy(true)
    setError(null)
    const message = await action()
    setError(message)
    setBusy(false)
  }
  return (
    <main className="gate">
      <Brand />
      <p className="t-title">Link, key, kode OTP, catatan, dan tiket kerja yang kamu simpan di extension, sekarang di browser mana pun.</p>
      {useEmulator ? (
        <>
          <div className="brutal banner banner--accent">
            <Icon name="FlaskConical" />
            <p className="t-strong">Mode emulator: hanya tersambung ke emulator Firebase lokal, bukan data asli.</p>
          </div>
          <Button icon="LogIn" block disabled={busy} onClick={() => void run(signInEmulator)}>
            {busy ? "Sedang masuk" : "Masuk akun uji"}
          </Button>
        </>
      ) : (
        <>
          <p className="muted">Masuk dengan akun Google yang sama dengan extension Saver supaya datanya tersambung.</p>
          <Button icon="LogIn" block disabled={busy} onClick={() => void run(signInWithGoogle)}>
            {busy ? "Sedang masuk" : "Masuk dengan Google"}
          </Button>
        </>
      )}
      {error && (
        <p className="field__error" role="alert" style={{ fontSize: 15 }}>
          {error}
        </p>
      )}
    </main>
  )
}
