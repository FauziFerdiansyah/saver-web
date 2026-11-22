# Saver Web

Versi web (PWA yang bisa dipasang) dari aplikasi Android **Saver**. Data dan akun sama dengan extension Chrome dan aplikasi Android: Firestore + login Google.

- Referensi fitur, UI, dan teks (read-only): `../../apps/saver` (Android). Referensi model data (read-only): `../../extension/extension-url-saver`.
- Struktur koleksi Firestore dan nama field harus sama persis dengan keduanya. Jangan menambah atau mengganti nama field tanpa mengubah extension dan Android juga.

## Commands

```sh
npm run dev          # Firebase asli dari .env (data produksi pemilik, hati-hati)
npm run dev:emu      # emulator Firebase lokal, proyek demo-saver, tidak menyentuh data asli
npm run typecheck
npm test             # vitest, logika murni di src/lib
npm run build        # tsc + vite build ke dist/
npm run icons        # bangun ulang public/icons dari logo Android

# Emulator (port sendiri 9199/8180 supaya tidak bentrok dengan emulator proyek Android di 9099/8080)
(cd emulator && npx -y firebase-tools@14 emulators:start --only auth,firestore --project demo-saver)
npm run dev:emu -- --port 5199 --strictPort
python3 emulator/seed.py        # setelah "Masuk akun uji" ditekan sekali
node scripts/e2e.mjs            # klik-tembus semua tab di Chrome (playwright-core, channel chrome)
node scripts/shots.mjs          # tangkapan layar ke .screens/ (390 dan 1280, terang dan gelap)
```

Pekerjaan selesai hanya kalau typecheck, test, dan build lulus, `scripts/e2e.mjs` lulus di emulator, dan perubahan UI sudah dilihat di tangkapan layar terang dan gelap. Semua pengujian otomatis memakai emulator, tidak pernah Firebase asli.

## Stack

Vite 8, React 19, TypeScript strict, Firebase JS SDK 12, TipTap 3.27 (versi sama dengan extension), CSS biasa dengan custom properties (`src/styles/app.css`). Tanpa Tailwind, tanpa library komponen. Versi dependensi dipin persis.

## Struktur

- `src/firebase.ts` konfigurasi, auth, mode emulator. `src/settings.ts` preferensi perangkat di localStorage.
- `src/data/` lapisan Firestore: `core.ts` (listener bersama, `report()`), `repos.ts`, `docs.ts` (Notes/Tasks dengan `rev`), `temp.ts`, `work.ts`. Komponen tidak memanggil Firestore langsung.
- `src/lib/` logika murni dengan unit test (OTP, kategori, minggu ISO, Temp, Work, konten catatan).
- `src/editor/` permukaan tulis TipTap, diport dari `apps/saver/editor/src` supaya HTML bolak-balik tanpa kehilangan isi. `core.js` dan `nodes.js` sengaja tetap JavaScript agar mudah dibandingkan dengan sumbernya.
- `src/ui/` komponen neobrutal bersama, ikon Lucide dari `lucide.json`, toast.
- `src/features/` satu file per tab, plus `settings`, `auth`, `share`.

## Yang berbeda dari Android

- Browser tidak bisa memanggil API Jira, GitLab, atau webhook Lark (CORS). Tab Work hanya membaca `work/{uid}/tickets` hasil sinkron extension/Android; tidak ada sinkron, kirim Lark, API Key Usage, pratinjau tautan Temp, atau refresh status embed.
- Pengingat dicek selama aplikasi terbuka (`src/reminders.ts`), bukan alarm latar belakang.
- Penulisan tidak ditunggu (`report()`), supaya tetap jalan offline lewat cache Firestore.

## GitHub Pages dan PWA

- Semua URL relatif (`base: "./"`), routing memakai hash, service worker (`src/sw.template.js`, diisi oleh plugin di `vite.config.ts`) didaftarkan dengan scope relatif. Jangan memakai path absolut `/...` untuk aset.
- `.github/workflows/deploy.yml` membangun dan men-deploy saat push ke `main`. Nilai `VITE_FIREBASE_*` dibaca dari repository secrets.
- Login memakai `signInWithPopup`; domain hosting harus ada di Firebase Console, Authentication, Settings, Authorized domains.

## Bahasa dan desain

Teks UI bahasa Indonesia, polos dan spesifik, tanpa em dash, tanpa emoji, tanpa kata pemasaran. Kode dan identifier bahasa Inggris.

Desain mengikuti Android: neobrutalism, garis tinta 2px, bayangan keras 4px tanpa blur, elemen bergeser menutup bayangan saat ditekan. Warna hanya dari token di `app.css` (biru `#2699D2` primary, kuning `#FFD23F` satu-satunya aksen, merah hanya untuk bahaya). Radius 6/10/16, tanpa bentuk pil. Space Grotesk untuk UI, JetBrains Mono untuk kode, key, dan OTP. Ikon Lucide saja. Kontras minimal WCAG AA di kedua tema (dijaga `src/lib/format.test.ts`), target sentuh minimal 44px, fokus keyboard terlihat, animasi mati saat `prefers-reduced-motion`. Setiap layar punya keadaan kosong, memuat, dan gagal.

## Git

Jangan push kecuali diminta. Jangan commit `.env`.
