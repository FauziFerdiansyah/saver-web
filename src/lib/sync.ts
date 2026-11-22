const DEVICE_ID_KEY = "saver_device_id"

let cachedDeviceId: string | null = null

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY)
    if (stored) {
      cachedDeviceId = stored
      return stored
    }
  } catch {
    cachedDeviceId = null
  }
  const generated = randomId()
  cachedDeviceId = generated
  try {
    localStorage.setItem(DEVICE_ID_KEY, generated)
  } catch {
    cachedDeviceId = generated
  }
  return generated
}

export interface RevisionedDoc {
  id: string
  rev: number
  updatedAt: number
}

export interface SaveOptions {
  expectedRev?: number
}

export type SaveOutcome<T> =
  | { ok: true; rev: number }
  | { ok: false; reason: "conflict"; rev: number; remote: T }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "error"; error: unknown }

export function readRev(data: Record<string, unknown>): number {
  return typeof data.rev === "number" ? data.rev : 0
}

export function hasRevisionConflict(params: {
  currentRev: number
  expectedRev?: number
  remoteDeviceId: string
  deviceId: string
}): boolean {
  const { currentRev, expectedRev, remoteDeviceId, deviceId } = params
  if (expectedRev === undefined) return false
  if (currentRev <= expectedRev) return false
  return remoteDeviceId !== deviceId
}

export function isRemoteContentNewer(
  base: { id: string; rev: number } | null,
  target: { id: string; rev: number } | null
): boolean {
  if (!base || !target) return false
  if (base.id !== target.id) return false
  return target.rev > base.rev
}

export function shouldAdoptRemoteContent(params: {
  remoteSync: boolean
  localDirty: boolean
  incoming: string
  current: string
  idleFor: number
  idleThreshold: number
}): "skip" | "wait" | "adopt" {
  const { remoteSync, localDirty, incoming, current, idleFor, idleThreshold } = params
  if (!remoteSync || localDirty) return "skip"
  if (incoming === current) return "skip"
  if (idleFor < idleThreshold) return "wait"
  return "adopt"
}
