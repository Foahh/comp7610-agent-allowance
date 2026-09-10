import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"

const root = new URL("../", import.meta.url)

for (const name of ["AllowanceTestToken", "AgentSpendVault"]) {
  const path = new URL(
    `packages/contracts/artifacts/contracts/${name}.sol/${name}.json`,
    root
  )
  if (!existsSync(path)) {
    console.error(
      `Missing ${name} artifact. Run vp run @repo/contracts#build first.`
    )
    process.exitCode = 1
    continue
  }
  const artifact = JSON.parse(readFileSync(path, "utf8")) as {
    deployedBytecode: string
  }
  const fingerprint = createHash("sha256")
    .update(artifact.deployedBytecode)
    .digest("hex")
  console.log(`${name} ${fingerprint}`)
}
