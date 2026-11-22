import { describe, expect, it } from "vitest"
import { buildOtpUri, decryptOtpExport, encryptedPayload, hotp, parseOtpImport, parseOtpUri, splitCode, totp } from "./otp"

const sha1Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

describe("otp", () => {
  it("matches the RFC 4226 HOTP vectors", async () => {
    expect(await hotp(sha1Secret, 0)).toBe("755224")
    expect(await hotp(sha1Secret, 1)).toBe("287082")
    expect(await hotp(sha1Secret, 9)).toBe("520489")
  })

  it("matches the RFC 6238 TOTP vectors", async () => {
    expect(await totp(sha1Secret, "SHA1", 8, 30, 59_000)).toBe("94287082")
    expect(await totp(sha1Secret, "SHA1", 8, 30, 1_111_111_109_000)).toBe("07081804")
    expect(await totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA", "SHA256", 8, 30, 59_000)).toBe("46119246")
  })

  it("parses an otpauth URI", () => {
    const parsed = parseOtpUri("otpauth://totp/GitHub:fauzi%40mail.com?secret=jbsw%20y3dp&issuer=GitHub&digits=8&period=60&algorithm=sha256")
    expect(parsed).toMatchObject({ issuer: "GitHub", accountName: "fauzi@mail.com", secret: "JBSWY3DP", digits: 8, period: 60, algorithm: "SHA256" })
    expect(parseOtpUri("https://example.com")).toBeNull()
    expect(parseOtpUri("otpauth://totp/NoSecret")).toBeNull()
  })

  it("round-trips a built URI", () => {
    const uri = buildOtpUri({ type: "totp", issuer: "My Org", accountName: "a b", secret: "JBSWY3DP", algorithm: "SHA1", digits: 6, period: 30, counter: 0 })
    expect(parseOtpUri(uri)).toMatchObject({ issuer: "My Org", accountName: "a b" })
    const counter = buildOtpUri({ type: "hotp", issuer: "", accountName: "x", secret: "JBSWY3DP", algorithm: "SHA1", digits: 6, period: 30, counter: 4 })
    expect(parseOtpUri(counter)).toMatchObject({ type: "hotp", counter: 4, issuer: "" })
  })

  it("imports lines and JSON", () => {
    expect(parseOtpImport("otpauth://totp/A:a?secret=JBSWY3DP\nnot a uri\notpauth://hotp/B:b?secret=JBSWY3DP&counter=4")).toHaveLength(2)
    const parsed = parseOtpImport('[{"issuer":"X","account":"me","secret":"jbswy3dp"},"otpauth://totp/Y:y?secret=JBSWY3DP",{"issuer":"no secret"}]')
    expect(parsed).toHaveLength(2)
    expect(parsed[0].secret).toBe("JBSWY3DP")
  })

  it("groups code digits", () => {
    expect(splitCode("123456")).toBe("123 456")
    expect(splitCode("12345678")).toBe("1234 5678")
  })

  it("decrypts a CryptoJS export", async () => {
    const cipher = "U2FsdGVkX1/74nYdn42bVcWBVM0YPxIptnaQS+HzSblE5l4pykXczutEkxcdKl9Uk/2Bq6opLlJfJ3Pvs45+m8cifw8smhgZPzH1C2pHr7bGTfw5HaCsDdMkQQOjl5SL"
    expect(await decryptOtpExport(cipher, "rahasia")).toBe("otpauth://totp/GitHub:fauzi?secret=JBSWY3DPEHPK3PXP&issuer=GitHub")
    expect(await decryptOtpExport(cipher, "salah")).toBeNull()
    expect(encryptedPayload('{"data":"abc"}')).toBe("abc")
    expect(encryptedPayload("[1,2]")).toBeNull()
  })
})
