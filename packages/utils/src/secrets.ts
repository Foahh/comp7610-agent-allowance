import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { projectRoot } from "./project-root.ts"

const encryptionKeyPattern = /^[0-9a-fA-F]{64}$/

export function credentialsDirectory() {
  const directory =
    process.env.CREDENTIALS_DIRECTORY ||
    join(projectRoot(), "data", "credentials", "0")
  mkdirSync(directory, { recursive: true })

  return directory
}

function encryptionKey() {
  const keyPath = join(credentialsDirectory(), "encryption.key")

  const testKey = process.env.VITEST
    ? process.env.SETTINGS_ENCRYPTION_KEY
    : undefined

  if (!testKey && !existsSync(keyPath)) {
    writeFileSync(keyPath, randomBytes(32).toString("hex"), {
      flag: "wx",
      mode: 0o600,
    })
  }

  const value = testKey?.trim() || readFileSync(keyPath, "utf8").trim()

  if (!encryptionKeyPattern.test(value)) {
    throw new Error(
      "Local encryption key is invalid. Restore the key from your private backup."
    )
  }

  return Buffer.from(value, "hex")
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])

  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64"))
    .join(".")
}

export function decryptSecret(value: string) {
  const [iv, tag, ciphertext] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64"))

  if (!iv || !tag || !ciphertext) {
    throw new Error("Invalid encrypted model credential.")
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8")
}
