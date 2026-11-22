import { createStore, type Store } from "@/lib/store"
import { getDeviceId } from "@/lib/sync"

/** Content the editor should (re)load. `version` changes only when a reload is wanted. */
export interface EditorDoc {
  html: string
  version: number
}

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "missing" }
  | { kind: "failed"; message: string }
  /** Another device saved a newer revision while this one had unsaved edits. */
  | { kind: "conflict"; remoteHtml: string; remoteRev: number }

export type SaveOutcome =
  | { kind: "saved"; rev: number }
  | { kind: "conflict"; remoteRev: number; remoteContent: string }
  | { kind: "missing" }
  | { kind: "failed"; message: string }

type Edit = { html: string; title: string }

/**
 * Save pipeline shared by the Note and Task editors. Edits are written one at a
 * time with the revision the editor started from; a remote change is adopted
 * only while there are no unsaved local edits.
 */
export class EditorSession {
  readonly doc: Store<EditorDoc | null> = createStore<EditorDoc | null>(null)
  readonly status: Store<SaveStatus> = createStore<SaveStatus>({ kind: "idle" })

  private rev: number | null = null
  private savedHtml: string | null = null
  private pending: Edit | null = null
  private held: Edit | null = null
  private draining = false

  constructor(private readonly save: (html: string, title: string, expectedRev: number | undefined) => Promise<SaveOutcome>) {}

  get dirty(): boolean {
    return this.pending !== null || this.draining || this.held !== null
  }

  private load(html: string): void {
    this.doc.set({ html, version: (this.doc.get()?.version ?? 0) + 1 })
  }

  /** Feed every snapshot of the stored document here. */
  onRemote(html: string, remoteRev: number, remoteDeviceId: string): void {
    if (this.rev === null) {
      this.rev = remoteRev
      this.savedHtml = html
      this.load(html)
      return
    }
    if (remoteRev <= this.rev) return
    if (remoteDeviceId === getDeviceId() || html === this.savedHtml) {
      if (!this.dirty) this.rev = remoteRev
      return
    }
    if (!this.dirty) {
      this.rev = remoteRev
      this.savedHtml = html
      this.load(html)
    }
  }

  onLocalChange(html: string, title: string): void {
    if (html === this.savedHtml && this.pending === null) return
    this.pending = { html, title }
    if (this.status.get().kind === "conflict") {
      this.held = this.pending
      this.pending = null
      return
    }
    void this.drain()
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      for (;;) {
        const next: Edit | null = this.pending
        if (!next) break
        this.pending = null
        this.status.set({ kind: "saving" })
        const outcome = await this.save(next.html, next.title, this.rev ?? undefined)
        if (outcome.kind === "saved") {
          this.rev = outcome.rev
          this.savedHtml = next.html
          this.status.set({ kind: "saved" })
          continue
        }
        if (outcome.kind === "conflict") {
          this.held = this.pending ?? next
          this.pending = null
          this.status.set({ kind: "conflict", remoteHtml: outcome.remoteContent, remoteRev: outcome.remoteRev })
        } else if (outcome.kind === "missing") {
          this.status.set({ kind: "missing" })
        } else {
          if (this.pending === null) this.pending = next
          this.status.set({ kind: "failed", message: outcome.message })
        }
        break
      }
    } finally {
      this.draining = false
    }
  }

  retry(): void {
    if (this.pending) void this.drain()
  }

  /** Drops this device's unsaved edits and loads the other device's version. */
  useRemote(): void {
    const status = this.status.get()
    if (status.kind !== "conflict") return
    this.held = null
    this.rev = status.remoteRev
    this.savedHtml = status.remoteHtml
    this.status.set({ kind: "saved" })
    this.load(status.remoteHtml)
  }

  /** Saves this device's edits on top of the other device's revision. */
  overwrite(): void {
    const status = this.status.get()
    if (status.kind !== "conflict") return
    this.rev = status.remoteRev
    this.pending = this.held
    this.held = null
    this.status.set({ kind: "saving" })
    void this.drain()
  }
}
