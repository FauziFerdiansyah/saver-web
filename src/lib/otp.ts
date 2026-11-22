/** RFC 4226 / RFC 6238 one-time passwords, matching the extension's `lib/totp.ts` and Android's `Totp`. */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export type OtpAlgorithm = "SHA1" | "SHA256" | "SHA512"

export interface ParsedOtp {
  type: "totp" | "hotp"
  secret: string
  issuer: string
  accountName: string
  algorithm: OtpAlgorithm
  digits: number
  period: number
  counter: number
}

export function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const out: number[] = []
  let buffer = 0
  let bits = 0
  for (const char of input.toUpperCase()) {
    const value = BASE32.indexOf(char)
    if (value === -1) continue
    buffer = (buffer << 5) | value
    bits += 5
    if (bits >= 8) {
      out.push((buffer >> (bits - 8)) & 0xff)
      bits -= 8
      buffer &= (1 << bits) - 1
    }
  }
  return new Uint8Array(out)
}

export function isValidBase32(value: string): boolean {
  return /^[A-Za-z2-7]+=*$/.test(value.replace(/\s/g, ""))
}

export function normalizeSecret(value: string): string {
  return value.replace(/\s/g, "").toUpperCase()
}

function algorithmOf(value: string | undefined | null): OtpAlgorithm {
  const upper = (value ?? "").toUpperCase().replace("-", "")
  return upper === "SHA256" || upper === "SHA512" ? upper : "SHA1"
}

const HASH: Record<OtpAlgorithm, string> = { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" }

export async function hotp(secret: string, counter: number, algorithm: string = "SHA1", digits = 6): Promise<string> {
  const key = base32Decode(secret)
  if (key.length === 0) return "-".repeat(digits)
  const message = new Uint8Array(8)
  let rest = Math.floor(counter)
  for (let i = 7; i >= 0; i--) {
    message[i] = rest % 256
    rest = Math.floor(rest / 256)
  }
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: HASH[algorithmOf(algorithm)] }, false, ["sign"])
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, message))
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)
  return (binary % 10 ** digits).toString().padStart(digits, "0")
}

export function totp(secret: string, algorithm = "SHA1", digits = 6, period = 30, nowMillis = Date.now()): Promise<string> {
  return hotp(secret, Math.floor(nowMillis / 1000 / Math.max(period, 1)), algorithm, digits)
}

/** "123456" -> "123 456", "12345678" -> "1234 5678". */
export function splitCode(code: string): string {
  const half = Math.floor(code.length / 2)
  return code.length < 6 ? code : `${code.slice(0, half)} ${code.slice(half)}`
}

function validDigits(value: string | undefined | null): number {
  const parsed = Number.parseInt(value ?? "", 10)
  return parsed === 6 || parsed === 8 ? parsed : 6
}

function validPeriod(value: string | undefined | null): number {
  const parsed = Number.parseInt(value ?? "", 10)
  return parsed > 0 ? parsed : 30
}

export function parseOtpUri(uri: string): ParsedOtp | null {
  const match = /^otpauth:\/\/(totp|hotp)\/([^?#]*)(?:\?([^#]*))?/i.exec(uri.trim())
  if (!match) return null
  try {
    const label = decodeURIComponent(match[2])
    const colon = label.indexOf(":")
    const params = new Map<string, string>()
    new URLSearchParams(match[3] ?? "").forEach((value, key) => params.set(key.toLowerCase(), value))
    const secret = normalizeSecret(params.get("secret") ?? "")
    if (!secret) return null
    const counter = Number.parseInt(params.get("counter") ?? "", 10)
    return {
      type: match[1].toLowerCase() === "hotp" ? "hotp" : "totp",
      secret,
      issuer: params.get("issuer")?.trim() || (colon > 0 ? label.slice(0, colon) : ""),
      accountName: colon > 0 ? label.slice(colon + 1).trim() : label,
      algorithm: algorithmOf(params.get("algorithm")),
      digits: validDigits(params.get("digits")),
      period: validPeriod(params.get("period")),
      counter: Number.isFinite(counter) ? counter : 0,
    }
  } catch {
    return null
  }
}

export function buildOtpUri(account: Omit<ParsedOtp, "algorithm"> & { algorithm: string }): string {
  const enc = encodeURIComponent
  const label = account.issuer.trim() ? `${enc(account.issuer)}:${enc(account.accountName)}` : enc(account.accountName)
  const query = [
    `secret=${account.secret}`,
    ...(account.issuer.trim() ? [`issuer=${enc(account.issuer)}`] : []),
    `algorithm=${account.algorithm}`,
    `digits=${account.digits}`,
    account.type === "hotp" ? `counter=${account.counter}` : `period=${account.period}`,
  ].join("&")
  return `otpauth://${account.type}/${label}?${query}`
}

/**
 * Reads an import file: otpauth:// URIs one per line, or a JSON array of
 * URIs / `{issuer, account|name, secret}` objects (2FA Authenticator export).
 */
export function parseOtpImport(text: string): ParsedOtp[] {
  const trimmed = text.trim()
  if (trimmed.startsWith("[")) {
    try {
      const array = JSON.parse(trimmed) as unknown
      if (Array.isArray(array)) {
        return array.flatMap((element): ParsedOtp[] => {
          if (typeof element === "string") {
            const parsed = parseOtpUri(element)
            return parsed ? [parsed] : []
          }
          if (!element || typeof element !== "object") return []
          const record = element as Record<string, unknown>
          const field = (...names: string[]): string | undefined => {
            for (const name of names) {
              const value = record[name]
              if ((typeof value === "string" || typeof value === "number") && String(value).trim()) return String(value)
            }
            return undefined
          }
          const uri = field("uri")
          if (uri) {
            const parsed = parseOtpUri(uri)
            return parsed ? [parsed] : []
          }
          const secret = field("secret")
          if (!secret) return []
          return [
            {
              type: "totp",
              secret: normalizeSecret(secret),
              issuer: field("issuer") ?? "",
              accountName: field("account", "accountName", "name", "label") ?? "",
              algorithm: algorithmOf(field("algorithm")),
              digits: validDigits(field("digits")),
              period: validPeriod(field("period")),
              counter: 0,
            },
          ]
        })
      }
    } catch {
      // Not JSON after all: fall through to the line-based format.
    }
  }
  return trimmed.split(/\r?\n/).flatMap((line) => {
    const parsed = line.trim().startsWith("otpauth://") ? parseOtpUri(line) : null
    return parsed ? [parsed] : []
  })
}

/** The encrypted export is a JSON object whose `data` field holds the ciphertext. */
export function encryptedPayload(text: string): string | null {
  try {
    const root = JSON.parse(text.trim()) as unknown
    const data = root && typeof root === "object" && !Array.isArray(root) ? (root as Record<string, unknown>).data : null
    return typeof data === "string" ? data : null
  } catch {
    return null
  }
}

/**
 * Decrypts the password-protected export the extension writes with CryptoJS
 * `AES.encrypt(text, passphrase)` (OpenSSL salted format, AES-256-CBC).
 */
export async function decryptOtpExport(base64: string, passphrase: string): Promise<string | null> {
  try {
    const { default: CryptoJS } = await import("crypto-js")
    const plain = CryptoJS.AES.decrypt(base64.trim(), passphrase).toString(CryptoJS.enc.Utf8)
    return plain.trim() ? plain : null
  } catch {
    return null
  }
}
