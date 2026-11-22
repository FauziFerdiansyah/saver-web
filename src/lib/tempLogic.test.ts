import { describe, expect, it } from "vitest"
import { detectKind, expiresAtFor, guessLanguage, isExpired, parseSegments, remainingLabel, restampExpiry, shouldCollapse, toNoteHtml } from "./tempLogic"

const day = 86_400_000

describe("tempLogic", () => {
  it("detects message kinds", () => {
    expect(detectKind("https://example.com/halaman")).toBe("link")
    expect(detectKind("https://x.atlassian.net/browse/MIF-1")).toBe("text")
    expect(detectKind("Catatan rapat hari ini")).toBe("text")
    expect(detectKind('{"a": 1}')).toBe("code")
    expect(detectKind("npm install react")).toBe("code")
    expect(detectKind("```js\nconst a = 1\n```")).toBe("code")
    expect(detectKind("lihat ini\n```js\nconst a = 1\n```")).toBe("text")
  })

  it("guesses languages", () => {
    expect(guessLanguage('{"a": 1}')).toBe("json")
    expect(guessLanguage("git status")).toBe("bash")
    expect(guessLanguage("SELECT * FROM users")).toBe("sql")
    expect(guessLanguage("halo")).toBe("")
  })

  it("splits fenced code from text", () => {
    expect(parseSegments("a\n```ts\nlet x\n```\nb")).toEqual([
      { type: "text", value: "a" },
      { type: "code", value: "let x", language: "ts" },
      { type: "text", value: "b" },
    ])
    expect(parseSegments("polos")).toEqual([{ type: "text", value: "polos" }])
  })

  it("keeps pinned and starred messages forever", () => {
    expect(expiresAtFor(7, false, 0)).toBe(7 * day)
    expect(expiresAtFor(7, true, 0)).toBeNull()
    expect(expiresAtFor(0, false, 0)).toBeNull()
    const base = { pinned: false, starred: false, retentionDays: null, createdAt: 1000 }
    expect(restampExpiry(base, 3)).toBe(1000 + 3 * day)
    expect(restampExpiry({ ...base, retentionDays: 1 }, 3)).toBe(1000 + day)
    expect(restampExpiry({ ...base, starred: true }, 3)).toBeNull()
    expect(isExpired({ pinned: false, starred: false, expiresAt: 5 }, 10)).toBe(true)
    expect(isExpired({ pinned: true, starred: false, expiresAt: 5 }, 10)).toBe(false)
    expect(remainingLabel({ pinned: false, starred: false, expiresAt: 2 * day + 5 }, 0)).toBe("Hilang dalam 2 hari")
  })

  it("collapses long messages only", () => {
    expect(shouldCollapse({ kind: "text", content: "pendek" })).toBe(false)
    expect(shouldCollapse({ kind: "code", content: Array.from({ length: 20 }, () => "x").join("\n") })).toBe(true)
  })

  it("builds note HTML with escaped content", () => {
    expect(toNoteHtml({ kind: "code", content: "a < b", caption: "", meta: "" })).toBe("<p>a &lt; b</p><pre><code>a &lt; b</code></pre>")
  })
})
