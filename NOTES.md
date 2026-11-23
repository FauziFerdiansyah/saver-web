# Catatan Sesi — Saver Web

Ringkasan pengerjaan dari percakapan awal pembuatan versi web sampai deploy ke GitHub Pages. Untuk konteks jangka panjang proyek, baca `AGENTS.md`; file ini mencatat perjalanan dan keputusan yang diambil.

## Tujuan

- Versi web dari aplikasi Android **Saver** (`apps/saver`), bisa dipasang dari browser sebagai aplikasi (PWA), akun dan data sama dengan extension Chrome dan Android.
- Hosting di **GitHub Pages**, otomatis deploy lewat GitHub Actions saat push ke `main`.

## Yang sudah dibangun

- React 19 + TypeScript + Vite + Firebase 12. Satu repo di `web/saver-web`.
- **8 tab + Pengaturan**: Links, Breadcrumb, Keys (password), Authenticator (OTP + impor otpauth), Notes (editor kompatibel TipTap), Tasks (papan mingguan), Temp, Work (baca saja).
- PWA: manifest, service worker, ikon dari logo Android, mode offline.
- Routing hash (`/#/links`) supaya GitHub Pages tidak butuh fallback SPA; path aset relatif supaya jalan di sub-path `/saver-web/`.
- Login Google via popup (kompatibel Pages). Tombol "Pasang aplikasi" aktif di build produksi.
- `.env` disalin dari extension (`VITE_FIREBASE_*`), masuk `.gitignore`.

## Keputusan penting

- **Work baca saja.** Browser tidak bisa memanggil Jira/GitLab/Lark langsung (CORS), jadi tidak ada sinkron Work, tidak ada API key, tidak ada refresh status embed. Yang tersimpan tetap tampil.
- **Pratinjau tautan di Temp** tidak di-fetch di web untuk alasan yang sama.
- **Pengingat** hanya berbunyi selama Saver terbuka (browser tidak punya alarm latar).
- **Warna teks di atas warna item** dipilih dengan rasio kontras WCAG (hitam/putih), bukan rumus luminansi extension — rumus lama gagal AA di beberapa warna palet.
- **Card Links setinggi sama**; tombol aksi menempel di bawah. Label tipe = blok tinta penuh, label kategori = outline + strip warna kategori, keduanya radius 6px.

## Perjalanan deploy GitHub Pages

Masalah yang ditemui dan solusinya:

1. Halaman `fauzi.is-a.dev/saver-web/` blank — Pages menyajikan `index.html` mentah repo (merujuk `/src/main.tsx`), bukan hasil build `dist/`.
2. Workflow `configure-pages` gagal "Get Pages site failed" karena Pages belum diaktifkan untuk Actions.

Solusi (commit `3cff9f7`):

- `actions/configure-pages` diberi `enablement: true` → Pages dibuat otomatis dengan source GitHub Actions.
- `public/CNAME` berisi `fauzi.is-a.dev` → custom domain ikut ke `dist`.
- Di repo Settings → Pages, source dipindah ke **GitHub Actions**.

Setelah itu deploy sukses dan semua aset (manifest, service worker, font) 200 di `https://fauzi.is-a.dev/saver-web/`.

## Verifikasi yang sudah dilakukan

- Typecheck, **60 unit test** (8 file), build — lulus.
- Klik-tembus di Chrome (`node scripts/e2e.mjs`) untuk semua tab.
- Build disajikan dari `/saver-web/` tanpa request gagal; offline reload jalan.
- Tidak ada overflow horizontal di lebar 320/390/768/1280; tema terang dan gelap dicek lewat tangkapan layar.
- **Belum diuji**: scan QR kamera, notifikasi pengingat, tombol pasang di perangkat nyata.

## Yang masih menggantung (di sisi pemilik)

1. **Settings → Secrets → Actions** di repo GitHub: isi 7 secret `VITE_FIREBASE_*` (daftarnya di `.env.example`). Tanpa ini situs terbuka tapi menampilkan "Firebase belum dikonfigurasi".
2. Setelah secrets terisi: **Actions → Deploy to GitHub Pages → Run workflow** untuk build ulang.
3. **Firebase Console → Authentication → Authorized domains**: tambahkan `fauzi.is-a.dev` supaya login Google diterima.

## Catatan kecil

- Emulator proyek Android sempat tersentuh sekali saat pengujian (login akun uji di emulator yang salah port). saver-web sekarang pakai port sendiri 9199/8180.
- Bug di aplikasi Android (bukan di sini): ekspor markdown kehilangan nama bahasa blok kode di `NoteContent.toMarkdown`. Sudah benar di web.
