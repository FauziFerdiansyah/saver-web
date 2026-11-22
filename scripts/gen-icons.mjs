// Renders the PWA icons from the Saver logo path (same vector as the Android
// app's ic_logo.xml). Usage: npm run icons
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, "../public/icons")
mkdirSync(out, { recursive: true })

const logoXml = readFileSync(join(here, "../../../apps/saver/app/src/main/res/drawable/ic_logo.xml"), "utf8")
const path = /android:pathData="([^"]+)"/.exec(logoXml)?.[1]
if (!path) throw new Error("Logo path not found")

// scale: fraction of the canvas the 144-unit logo occupies. Maskable icons keep
// the mark inside the 80% safe zone.
const svg = (scale, background, radius = 0) => {
  const size = 144 / scale
  const offset = (size - 144) / 2
  const bg = background ? `<rect width="${size}" height="${size}" rx="${radius * size}" fill="${background}"/>` : ""
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${bg}<path transform="translate(${offset} ${offset})" fill="#2699D2" fill-rule="evenodd" d="${path}"/></svg>`
}

writeFileSync(join(out, "favicon.svg"), svg(0.9, "#FFFFFF", 0.18))
writeFileSync(join(out, "logo.svg"), svg(1, null))

const png = (name, size, markup) => sharp(Buffer.from(markup), { density: 300 }).resize(size, size).png().toFile(join(out, name))

await Promise.all([
  png("icon-48.png", 48, svg(0.9, "#FFFFFF", 0.18)),
  png("icon-192.png", 192, svg(0.82, "#FFFFFF", 0.18)),
  png("icon-512.png", 512, svg(0.82, "#FFFFFF", 0.18)),
  png("maskable-192.png", 192, svg(0.6, "#FFFFFF")),
  png("maskable-512.png", 512, svg(0.6, "#FFFFFF")),
  png("apple-touch-icon.png", 180, svg(0.7, "#FFFFFF")),
])
console.log("Icons written to public/icons")
