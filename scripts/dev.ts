import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:net"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const INSTANCE_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/
const LOOPBACK_HOSTS = ["127.0.0.1", "::1"]

function wait(duration: number) {
  return new Promise((resolve) => setTimeout(resolve, duration))
}

const argumentsList = process.argv.slice(2).filter((value) => value !== "--")
const position = argumentsList.indexOf("--instance")
let name = position >= 0 ? argumentsList[position + 1] : "default"

if (!name || !INSTANCE_NAME_PATTERN.test(name)) {
  throw new Error(
    "Use an instance name containing 1–40 letters, digits, underscores, or hyphens."
  )
}

function running(directory: string) {
  const lock = resolve(directory, "process.lock")
  if (!existsSync(lock)) {
    return false
  }

  const pid = Number(readFileSync(lock, "utf8"))

  try {
    process.kill(pid, 0)
    return true
  } catch {
    // Delete only this verified instance's single stale lock file.
    unlinkSync(lock)
    return false
  }
}
let directory =
  process.env.DATA_DIRECTORY || resolve(root, "data/instances", name)

if (running(directory)) {
  if (position >= 0 || process.env.DATA_DIRECTORY) {
    throw new Error(
      "This instance is already running. Open its existing browser URL or choose another instance."
    )
  }
  let index = 2
  while (running(resolve(root, "data/instances", `demo-${index}`))) {
    index++
  }
  name = `demo-${index}`
  directory = resolve(root, "data/instances", name)
}

mkdirSync(directory, { recursive: true })
const lock = resolve(directory, "process.lock")
writeFileSync(lock, String(process.pid), { flag: "wx" })
process.on("exit", () => {
  if (existsSync(lock)) {
    unlinkSync(lock)
  }
})

async function available(port: number) {
  const results = await Promise.all(
    LOOPBACK_HOSTS.map(
      (host) =>
        new Promise<boolean>((done) => {
          const server = createServer()
          server.once("error", () => done(false))
          server.listen(port, host, () => server.close(() => done(true)))
        })
    )
  )
  return results.every(Boolean)
}

// Serialize cooperating launchers until all three listeners are ready.
mkdirSync(resolve(root, "data/instances"), { recursive: true })
const allocationLock = resolve(root, "data/instances/ports.lock")
let allocated = false
for (let attempt = 0; attempt < 300; attempt++) {
  try {
    writeFileSync(allocationLock, String(process.pid), { flag: "wx" })
    allocated = true
    break
  } catch {
    try {
      const holder = Number(readFileSync(allocationLock, "utf8"))
      try {
        process.kill(holder, 0)
      } catch {
        unlinkSync(allocationLock)
      }
    } catch {
      /* Another launcher released the lock. */
    }
    await wait(100)
  }
}
if (!allocated) {
  throw new Error("Another instance is still starting. Retry shortly.")
}
function releasePorts() {
  if (allocated) {
    allocated = false
    unlinkSync(allocationLock)
  }
}
process.on("exit", releasePorts)

let webPort = Number(process.env.WEB_PORT || 3000)
let apiPort = Number(process.env.API_PORT || webPort + 1)
let sellerPort = Number(process.env.SELLER_PORT || apiPort + 1)
while (
  !(await available(webPort)) ||
  !(await available(apiPort)) ||
  !(await available(sellerPort)) ||
  new Set([webPort, apiPort, sellerPort]).size !== 3
) {
  webPort += 3
  apiPort = webPort + 1
  sellerPort = webPort + 2
}

const origin = `http://localhost:${webPort}`
const cookieScope = createHash("sha256")
  .update(resolve(directory))
  .digest("hex")
  .slice(0, 16)
const env = {
  ...process.env,
  WEB_PORT: String(webPort),
  API_PORT: String(apiPort),
  APP_ORIGIN: origin,
  API_HOST: "127.0.0.1",
  PUBLIC_API_URL: `http://127.0.0.1:${sellerPort}`,
  SELLER_PORT: String(sellerPort),
  DATA_DIRECTORY: directory,
  SESSION_COOKIE_NAME: `spend_${cookieScope}`,
}

writeFileSync(
  resolve(directory, "instance.json"),
  JSON.stringify({ name, origin, apiPort, sellerPort, directory }, null, 2)
)

console.log(
  `Instance ${name}: ${origin}\nData: ${directory}\nRun vp run dev again for another isolated instance.`
)
const executable = process.platform === "win32" ? "vp.exe" : "vp"
const build = spawn(executable, ["run", "@repo/contracts#build"], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
})
const code = await new Promise<number | null>((done, reject) => {
  build.once("exit", done)
  build.once("error", reject)
})
if (code !== 0) {
  process.exit(code || 1)
}

const child = spawn(
  executable,
  ["run", "--parallel", "--filter", "./apps/*", "dev"],
  { cwd: root, env, stdio: "inherit", windowsHide: true }
)
const seller = spawn(executable, ["run", "--no-cache", "@repo/api#seller"], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
})
function stop() {
  for (const processChild of [child, seller]) {
    if (!processChild.pid || processChild.exitCode !== null) {
      continue
    }

    if (process.platform === "win32") {
      spawn("taskkill.exe", ["/PID", String(processChild.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      })
    } else {
      processChild.kill("SIGTERM")
    }
  }
}

child.once("error", (error) => {
  console.error(error.message)
  process.exitCode = 1
})
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, stop)
}
child.once("exit", (exitCode) => {
  process.exitCode = exitCode || 0
  stop()
})
seller.once("exit", (exitCode) => {
  process.exitCode = exitCode || 0
  stop()
})
seller.once("error", (error) => {
  console.error(error.message)
  process.exitCode = 1
  stop()
})
for (let attempt = 0; attempt < 100; attempt++) {
  try {
    const response = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(500),
    })
    const sellerResponse = await fetch(
      `http://127.0.0.1:${sellerPort}/health`,
      { signal: AbortSignal.timeout(500) }
    )
    if (response.ok && sellerResponse.ok) {
      releasePorts()
      break
    }
  } catch {
    /* Wait for the coordinated listeners to start. */
  }
  if (child.exitCode !== null || seller.exitCode !== null) {
    break
  }
  await wait(100)
}

if (allocated) {
  releasePorts()
  stop()
  throw new Error("Instance startup failed. Check the listener output above.")
}
