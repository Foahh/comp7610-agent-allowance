import { existsSync } from "node:fs"
import { dirname, resolve, sep } from "node:path"

export function projectRoot() {
  let directory = resolve(process.env.PROJECT_ROOT || process.cwd())

  while (!existsSync(resolve(directory, "pnpm-workspace.yaml"))) {
    const parent = dirname(directory)

    if (parent === directory) {
      throw new Error("Run from the Mandate repository or set PROJECT_ROOT.")
    }

    directory = parent
  }

  return `${directory}${sep}`
}
