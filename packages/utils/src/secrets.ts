import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const encryptionKeyPattern = /^[0-9a-fA-F]{64}$/

export function credentialsDirectory(directory: string) {
  if (!directory) {
    throw new Error("Select an account workspace before accessing credentials.")
  }
  mkdirSync(directory, { recursive: true })
  return directory
}

function encryptionKey(scope: string) {
  const keyPath = join(credentialsDirectory(scope), "encryption.key")

  if (!existsSync(keyPath)) {
    writeFileSync(keyPath, randomBytes(32).toString("hex"), {
      flag: "wx",
      mode: 0o600,
    })
  }

  const value = readFileSync(keyPath, "utf8").trim()

  if (!encryptionKeyPattern.test(value)) {
    throw new Error(
      "Local encryption key is invalid. Restore the key from your private backup."
    )
  }

  return Buffer.from(value, "hex")
}

export function encryptSecret(value: string, scope: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(scope), iv)
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])

  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64"))
    .join(".")
}

export function decryptSecret(value: string, scope: string) {
  const [iv, tag, ciphertext] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64"))

  if (!iv || !tag || !ciphertext) {
    throw new Error("Invalid encrypted model credential.")
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(scope), iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8")
}
