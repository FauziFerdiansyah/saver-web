import { describe, expect, it } from "vitest"
import { colorPalettes } from "@/constants/colors"
import { contrastOn, contrastRatio, domainOf, isValidUrl, normalizeUrl } from "./format"

describe("format", () => {
  it("picks an ink that reaches AA on every palette colour", () => {
    for (const hex of [...colorPalettes.map((item) => item.hex), "#777777", "#e5484d", "#2699d2"]) expect(contrastRatio(hex, contrastOn(hex))).toBeGreaterThanOrEqual(4.5)
    expect(contrastOn("#ffd23f")).toBe("#000000")
    expect(contrastOn("#1e293b")).toBe("#ffffff")
  })

  it("keeps the theme tokens at AA", () => {
    const pairs: [string, string][] = [
      ["#141414", "#f6f1e7"], ["#55524a", "#f6f1e7"], ["#55524a", "#ede6d6"], ["#55524a", "#ffffff"], ["#0b1b24", "#2699d2"],
      ["#0f6a99", "#f6f1e7"], ["#b3262b", "#f6f1e7"], ["#141414", "#ffd23f"], ["#141414", "#e5484d"],
      ["#f2ecdf", "#131417"], ["#b4aea0", "#131417"], ["#b4aea0", "#1e2026"], ["#b4aea0", "#2a2d35"], ["#0b1b24", "#4db4e8"],
      ["#7cc8ef", "#131417"], ["#ff6b6e", "#131417"], ["#ff6b6e", "#1e2026"], ["#141414", "#ff6b6e"],
    ]
    for (const [ink, fill] of pairs) expect(contrastRatio(ink, fill), `${ink} on ${fill}`).toBeGreaterThanOrEqual(4.5)
  })

  it("normalizes and validates URLs", () => {
    expect(normalizeUrl("github.com")).toBe("https://github.com")
    expect(isValidUrl("https://github.com")).toBe(true)
    expect(isValidUrl("bukan url")).toBe(false)
    expect(domainOf("https://www.example.com/a")).toBe("example.com")
  })
})
