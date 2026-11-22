import { describe, expect, it } from "vitest"
import { hasRevisionConflict, isRemoteContentNewer, readRev, shouldAdoptRemoteContent } from "@/lib/sync"

describe("readRev", () => {
  it("treats legacy docs without rev as revision 0", () => {
    expect(readRev({})).toBe(0)
    expect(readRev({ rev: "3" })).toBe(0)
    expect(readRev({ rev: 7 })).toBe(7)
  })
})

describe("hasRevisionConflict", () => {
  const deviceId = "laptop-1"

  it("never conflicts when no expected revision is given", () => {
    expect(
      hasRevisionConflict({ currentRev: 9, expectedRev: undefined, remoteDeviceId: "laptop-2", deviceId })
    ).toBe(false)
  })

  it("allows the write when the server is still at the expected revision", () => {
    expect(hasRevisionConflict({ currentRev: 4, expectedRev: 4, remoteDeviceId: "laptop-2", deviceId })).toBe(false)
  })

  it("blocks the write when another device advanced the revision", () => {
    expect(hasRevisionConflict({ currentRev: 5, expectedRev: 4, remoteDeviceId: "laptop-2", deviceId })).toBe(true)
  })

  it("does not treat our own newer write as a conflict", () => {
    expect(hasRevisionConflict({ currentRev: 5, expectedRev: 4, remoteDeviceId: deviceId, deviceId })).toBe(false)
  })
})

describe("isRemoteContentNewer", () => {
  it("is false without a baseline or target", () => {
    expect(isRemoteContentNewer(null, { id: "a", rev: 3 })).toBe(false)
    expect(isRemoteContentNewer({ id: "a", rev: 1 }, null)).toBe(false)
  })

  it("is false for a different document", () => {
    expect(isRemoteContentNewer({ id: "a", rev: 1 }, { id: "b", rev: 9 })).toBe(false)
  })

  it("is false for our own revision or an older snapshot echo", () => {
    expect(isRemoteContentNewer({ id: "a", rev: 4 }, { id: "a", rev: 4 })).toBe(false)
    expect(isRemoteContentNewer({ id: "a", rev: 4 }, { id: "a", rev: 3 })).toBe(false)
  })

  it("is true once the document revision passes our baseline", () => {
    expect(isRemoteContentNewer({ id: "a", rev: 4 }, { id: "a", rev: 5 })).toBe(true)
  })
})

describe("shouldAdoptRemoteContent", () => {
  const base = {
    remoteSync: true,
    localDirty: false,
    incoming: "<p>remote</p>",
    current: "<p>local</p>",
    idleFor: 5000,
    idleThreshold: 1500,
  }

  it("adopts when remote is newer and typing is idle", () => {
    expect(shouldAdoptRemoteContent(base)).toBe("adopt")
  })

  it("skips when there is no newer remote revision", () => {
    expect(shouldAdoptRemoteContent({ ...base, remoteSync: false })).toBe("skip")
  })

  it("skips while local edits are unsaved", () => {
    expect(shouldAdoptRemoteContent({ ...base, localDirty: true })).toBe("skip")
  })

  it("skips when the incoming html already matches the editor", () => {
    expect(shouldAdoptRemoteContent({ ...base, incoming: "<p>local</p>" })).toBe("skip")
  })

  it("waits while the user is still typing", () => {
    expect(shouldAdoptRemoteContent({ ...base, idleFor: 200 })).toBe("wait")
  })
})
