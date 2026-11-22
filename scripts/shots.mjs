// Clicks through the app against the local Firebase emulators and saves
// screenshots to .screens/. Needs `npm run dev:emu -- --port 5199` and the
// emulators running. Usage: node scripts/shots.mjs [route ...]
import { execFileSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { chromium } from "playwright-core"

const base = process.env.SAVER_URL || "http://localhost:5199/"
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ["links", "breadcrumb", "keys", "authenticator", "settings", "settings/kategori"]
const sizes = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
]
mkdirSync(".screens", { recursive: true })

const browser = await chromium.launch({ channel: "chrome" })
const problems = []
for (const theme of ["light", "dark"]) {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: theme, deviceScaleFactor: 1 })
    const page = await context.newPage()
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`[${theme}/${size.name}] ${message.text()}`)
    })
    page.on("pageerror", (error) => problems.push(`[${theme}/${size.name}] ${error.message}`))
    await page.goto(base)
    const login = page.getByRole("button", { name: "Masuk akun uji" })
    await login.waitFor({ timeout: 15000 })
    await login.click()
    await page.getByRole("navigation", { name: "Tab Saver" }).waitFor({ timeout: 15000 })
    if (process.env.SEED && theme === "light" && size.name === "phone") {
      console.log(execFileSync("python3", [process.env.SEED], { encoding: "utf8" }).trim())
    }
    for (const route of routes) {
      await page.goto(`${base}#/${route}`)
      await page.waitForTimeout(900)
      await page.screenshot({ path: `.screens/${route.replace(/\//g, "-")}-${size.name}-${theme}.png` })
    }
    await context.close()
  }
}
await browser.close()
console.log(problems.length ? `Console problems:\n${[...new Set(problems)].join("\n")}` : "No console errors")
