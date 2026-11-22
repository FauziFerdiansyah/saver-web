import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }

/**
 * Emits sw.js with the list of built files to precache. Every URL is relative
 * to the service worker, so the app works from a GitHub Pages sub-path.
 */
function serviceWorker(): Plugin {
  return {
    name: "saver-service-worker",
    apply: "build",
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((file) => !file.endsWith(".map"))
      const extra = ["./", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/logo.svg", "fonts/space-grotesk.woff2", "fonts/jetbrains-mono.woff2"]
      const urls = [...extra, ...files.filter((file) => file !== "index.html")]
      const version = createHash("sha256").update(urls.join("|")).digest("hex").slice(0, 12)
      const template = readFileSync(new URL("./src/sw.template.js", import.meta.url), "utf8")
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: template.replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(urls)),
      })
    },
  }
}

export default defineConfig({
  base: "./",
  plugins: [react(), serviceWorker()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
})
