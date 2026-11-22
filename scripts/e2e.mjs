// Smoke test against the local Firebase emulators (never the real project).
// Needs the emulators (emulator/) and `npm run dev:emu -- --port 5199` running.
import { execFileSync } from "node:child_process"
import { chromium } from "playwright-core"

const base = process.env.SAVER_URL || "http://localhost:5199/"
const linkName = `Link uji ${Date.now() % 100000}`
const browser = await chromium.launch({ channel: "chrome" })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await context.grantPermissions(["clipboard-read", "clipboard-write"])
const page = await context.newPage()
const errors = []
page.on("pageerror", (error) => errors.push(error.message))
page.on("console", (message) => {
  // 400: first sign-in before the test account exists. 404: a favicon the icon service does not have.
  if (message.type() === "error" && !/status of (400|404)/.test(message.text())) errors.push(message.text())
})

let failed = 0
async function step(name, run) {
  try {
    await run()
    console.log(`ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`FAIL ${name}: ${String(error.message).split("\n")[0]}`)
  }
}
const visible = (locator) => locator.first().waitFor({ state: "visible", timeout: 8000 })
const gone = (locator) => locator.first().waitFor({ state: "hidden", timeout: 8000 })

await page.goto(base)
await page.getByRole("button", { name: "Masuk akun uji" }).click()
await visible(page.getByRole("navigation", { name: "Tab Saver" }))
console.log(execFileSync("python3", ["emulator/seed.py"], { encoding: "utf8" }).trim())

await step("links: seeded data renders", async () => {
  await page.goto(`${base}#/links`)
  await visible(page.getByRole("heading", { name: "GitHub Cognition" }).or(page.getByText("GitHub Cognition")))
})
await step("links: add, search, delete, undo", async () => {
  await page.getByRole("button", { name: "Link baru" }).first().click()
  await page.getByRole("dialog").getByLabel("URL", { exact: true }).fill("example.org/uji")
  await page.getByRole("dialog").getByLabel("Alias").fill(linkName)
  await page.getByRole("button", { name: "Simpan link" }).click()
  await visible(page.getByText(linkName))
  await page.getByPlaceholder("Cari link").fill(linkName)
  await gone(page.getByText("Dokumentasi Compose"))
  await page.getByPlaceholder("Cari link").fill("")
  await page.getByRole("button", { name: `Hapus ${linkName}` }).click()
  await page.getByRole("button", { name: "Hapus", exact: true }).click()
  await gone(page.getByText(linkName))
  await page.getByRole("button", { name: "Batalkan" }).click()
  await visible(page.getByText(linkName))
})
await step("links: reorder writes a new order", async () => {
  await page.getByRole("button", { name: "Urutkan link" }).click()
  await page.getByRole("button", { name: `Naikkan ${linkName}` }).click()
  await page.waitForTimeout(400)
  const titles = await page.locator(".item .t-heading").allTextContents()
  if (titles.indexOf(linkName) !== titles.length - 2) throw new Error(`order is ${titles.join(", ")}`)
  await page.getByRole("button", { name: "Selesai mengurutkan" }).click()
})
await step("keys: value is masked, then revealed and copied", async () => {
  await page.goto(`${base}#/keys`)
  await visible(page.getByText("Jira API token"))
  if (await page.getByText("ATATT3xFfGF0-contoh-token-uji").count()) throw new Error("secret visible before reveal")
  await page.getByRole("button", { name: "Lihat nilai Jira API token" }).click()
  await visible(page.getByText("ATATT3xFfGF0-contoh-token-uji"))
  await page.getByRole("button", { name: "Salin Jira API token" }).click()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  if (clip !== "ATATT3xFfGF0-contoh-token-uji") throw new Error(`clipboard has ${clip}`)
})
await step("keys: password gate blocks copy until unlocked", async () => {
  await page.goto(`${base}#/settings/password`)
  await page.getByLabel("Password baru").fill("rahasia1")
  await page.getByLabel("Ulangi password").fill("rahasia1")
  await page.getByRole("button", { name: "Buat password" }).click()
  await visible(page.getByText("Aksi yang meminta password"))
  await page.goto(`${base}#/keys`)
  await page.getByRole("button", { name: "Salin Jira API token" }).click()
  await page.getByRole("dialog").getByLabel("Password", { exact: true }).fill("salah")
  await page.getByRole("button", { name: "Buka" }).click()
  await visible(page.getByText("Password salah."))
  await page.getByRole("dialog").getByLabel("Password", { exact: true }).fill("rahasia1")
  await page.getByRole("button", { name: "Buka" }).click()
  await visible(page.getByText("Key disalin"))
})
await step("authenticator: shows a 6 digit code and imports otpauth", async () => {
  await page.goto(`${base}#/authenticator`)
  await visible(page.locator(".otp__code").filter({ hasText: /^\d{3} \d{3}$/ }))
  await page.getByRole("button", { name: "Akun baru" }).first().click()
  await page.getByLabel("Tempel URI otpauth (opsional)").fill("otpauth://totp/Contoh:e2e@uji.dev?secret=JBSWY3DPEHPK3PXP&issuer=Contoh")
  await page.getByRole("button", { name: "Isi form dari URI" }).click()
  await page.getByRole("button", { name: "Tambah akun" }).click()
  await visible(page.getByText("e2e@uji.dev"))
})
await step("breadcrumb: grouped view", async () => {
  await page.goto(`${base}#/breadcrumb`)
  await visible(page.getByText("Coroutines guide"))
  await page.getByRole("button", { name: "Kelompokkan per kategori" }).click()
  await visible(page.getByRole("heading", { name: /Tanpa kategori/ }))
  await page.getByRole("button", { name: "Tampilkan sebagai daftar" }).click()
})
await step("notes: create, type, autosave, reload keeps content", async () => {
  await page.goto(`${base}#/notes`)
  await page.getByRole("button", { name: "Baru", exact: true }).click()
  const editor = page.locator(".saver-editor .prose")
  await visible(editor)
  await editor.click()
  await page.keyboard.type("Catatan e2e")
  await page.keyboard.press("Enter")
  await page.keyboard.type("Isi baris kedua")
  await visible(page.getByText("Tersimpan", { exact: true }))
  await page.reload()
  await visible(page.locator(".saver-editor").getByText("Isi baris kedua"))
  await visible(page.locator(".note-card").getByText("Catatan e2e"))
})
await step("tasks: seeded week opens with embeds and checklist", async () => {
  await page.goto(`${base}#/tasks/w1`)
  await visible(page.locator(".saver-editor").getByText("MIF-12"))
  await visible(page.getByText("Checklist 1/2"))
  await page.locator(".saver-editor input[type=checkbox]").nth(1).click()
  await visible(page.getByText("Checklist 2/2"))
  await page.locator(".saver-editor input[type=checkbox]").nth(1).click()
  await visible(page.getByText("Checklist 1/2"))
})
await step("temp: send text and code, kinds detected", async () => {
  await page.goto(`${base}#/temp`)
  await visible(page.getByText("Catatan rapat: rilis mundur"))
  await page.getByLabel("Pesan", { exact: true }).fill("npm run build")
  await page.getByRole("button", { name: "Kirim", exact: true }).click()
  await visible(page.locator(".chat-code").getByText("npm run build"))
  await page.getByRole("button", { name: "Kode", exact: true }).click()
  await gone(page.locator(".bubble").getByText("Catatan rapat: rilis mundur ke Kamis, cek"))
})
await step("work: board groups seeded tickets and sets a reminder", async () => {
  await page.goto(`${base}#/work`)
  await visible(page.getByText("3 tiket aktif"))
  await visible(page.getByRole("region", { name: /Overdue, 1 tiket/ }).getByText("MIF-9"))
  await page.getByRole("button", { name: "Pengingat untuk MIF-12" }).click()
  await page.getByRole("button", { name: "1 jam", exact: true }).click()
  await visible(page.locator(".item").filter({ hasText: "MIF-12" }).locator(".tag").filter({ hasText: /Hari ini|Besok/ }))
})
await step("settings: theme switch and tab order", async () => {
  await page.goto(`${base}#/settings/tampilan`)
  await page.getByRole("radio", { name: "Gelap" }).click()
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== "dark") throw new Error("theme not dark")
  await page.getByRole("radio", { name: "Terang" }).click()
  await page.goto(`${base}#/settings/tab-order`)
  await page.getByRole("button", { name: "Naikkan Temp" }).click()
  const tabs = await page.locator("nav[aria-label='Tab Saver'] > a.tab .tab__long").allTextContents()
  if (tabs[tabs.length - 2] !== "Temp") throw new Error(`tabs are ${tabs.join(", ")}`)
  await page.getByRole("button", { name: "Kembalikan urutan bawaan" }).click()
})
await step("share target: query opens the save sheet", async () => {
  await page.goto(`${base}?title=Contoh&text=lihat%20ini&url=https%3A%2F%2Fexample.com%2Fbagikan#/links`)
  await page.getByRole("button", { name: "Simpan sebagai Breadcrumb" }).click()
  await visible(page.getByText("Tersimpan di Breadcrumb"))
  if (new URL(page.url()).search) throw new Error("query not cleared")
})
await step("keyboard: slash focuses search, Escape closes dialog", async () => {
  await page.goto(`${base}#/links`)
  await visible(page.getByText("GitHub Cognition").first())
  await page.keyboard.press("/")
  if (!(await page.getByPlaceholder("Cari link").evaluate((el) => el === document.activeElement))) throw new Error("search not focused")
  await page.keyboard.press("Tab")
  await page.getByRole("button", { name: "Link baru" }).first().click()
  await visible(page.getByRole("dialog"))
  await page.keyboard.press("Escape")
  await gone(page.getByRole("dialog"))
})

await browser.close()
if (errors.length) console.log(`Console errors:\n${[...new Set(errors)].join("\n")}`)
console.log(failed === 0 && errors.length === 0 ? "ALL PASSED" : `${failed} step(s) failed`)
process.exit(failed === 0 && errors.length === 0 ? 0 : 1)
