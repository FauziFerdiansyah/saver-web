import { useEffect, useState } from "react"
import { getRandomColor } from "@/constants/colors"
import { defaultCategory } from "@/constants/categories"
import { breadcrumbs, links } from "@/data/repos"
import { temp } from "@/data/temp"
import { domainOf, faviconUrl } from "@/lib/format"
import { detectKind, guessLanguage } from "@/lib/tempLogic"
import { settingsStore } from "@/settings"
import { Button, Sheet } from "@/ui/components"
import { toast } from "@/ui/toast"

interface SharedText {
  text: string
  subject: string
  url: string | null
}

/** Reads what another app shared through the installed PWA's share target (?title=&text=&url=). */
function readShare(): SharedText | null {
  const params = new URLSearchParams(location.search)
  const title = params.get("title")?.trim() ?? ""
  const body = params.get("text")?.trim() ?? ""
  const link = params.get("url")?.trim() ?? ""
  if (!title && !body && !link) return null
  const url = link || /https?:\/\/[^\s<>"']+/.exec(body)?.[0] || null
  return { text: [body, link].filter(Boolean).join("\n") || title, subject: title, url }
}

export function ShareInbox() {
  const [shared, setShared] = useState<SharedText | null>(readShare)
  useEffect(() => {
    if (shared) history.replaceState(null, "", location.pathname + location.hash)
  }, [shared])
  if (!shared) return null

  const finish = (view: string, message: string) => {
    setShared(null)
    location.hash = `#/${view}`
    toast(message)
  }
  const url = shared.url
  return (
    <Sheet title="Simpan ke Saver" onClose={() => setShared(null)}>
      <pre className="brutal summary" style={{ maxHeight: 140 }}>{shared.text}</pre>
      {!url && <p className="muted">Teks ini tidak berisi URL, jadi hanya bisa dikirim ke Temp.</p>}
      <Button
        icon="Link2"
        block
        disabled={!url}
        onClick={() => {
          if (!url) return
          links.save({
            id: "", url, alias: shared.subject || domainOf(url), description: "", type: "link", category: defaultCategory,
            icon: { type: "lucide", value: "Link" }, color: getRandomColor(), pinned: false, order: links.get().length, tags: [], createdAt: 0, updatedAt: 0,
          })
          finish("links", "Tersimpan di Links")
        }}
      >
        Simpan sebagai Link
      </Button>
      <Button
        icon="Footprints"
        tone="neutral"
        block
        disabled={!url}
        onClick={() => {
          if (!url) return
          breadcrumbs.save({
            id: "", url, title: shared.subject || domainOf(url), category: "", description: "",
            icon: { type: "favicon", value: faviconUrl(url) }, color: getRandomColor(), order: breadcrumbs.get().length, createdAt: 0, updatedAt: 0,
          })
          finish("breadcrumb", "Tersimpan di Breadcrumb")
        }}
      >
        Simpan sebagai Breadcrumb
      </Button>
      <Button
        icon="MessagesSquare"
        tone="neutral"
        block
        onClick={() => {
          const kind = detectKind(shared.text)
          temp.add({
            kind, content: shared.text, meta: kind === "code" ? guessLanguage(shared.text) : kind === "link" ? domainOf(shared.text) : "",
            caption: "", replyTo: null, retentionOverride: null, settingDays: settingsStore.get().tempRetentionDays,
          })
          finish("temp", "Terkirim ke Temp")
        }}
      >
        Kirim ke Temp
      </Button>
    </Sheet>
  )
}
