import { projectRoot } from "@repo/utils/config"
import { defineRelations } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-sqlite"
import { mkdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

import * as schema from "./schema.ts"

export * from "./schema.ts"
export { eq, and, inArray, notInArray } from "drizzle-orm"

export function openDatabase(filename: string) {
  const path = filename === ":memory:" ? filename : resolve(filename)

  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true })
  }

  const sqlite = new DatabaseSync(path)

  try {
    sqlite.exec(
      "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;"
    )
    const version = sqlite.prepare("PRAGMA user_version").get() as {
      user_version: number
    }

    if (version.user_version !== 0 && version.user_version !== 2) {
      throw new Error(
        "Unsupported database schema. Use a data directory created by this release."
      )
    }
    sqlite.exec(
      readFileSync(resolve(projectRoot(), "packages/db/src/schema.sql"), "utf8")
    )
    sqlite.exec("PRAGMA user_version = 2")
    const db = drizzle({ client: sqlite, relations: defineRelations(schema) })

    return {
      db,
      close() {
        sqlite.close()
      },
    }
  } catch (error) {
    sqlite.close()

    throw error
  }
}

export type Database = ReturnType<typeof openDatabase>["db"]
