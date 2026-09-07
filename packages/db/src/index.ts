import { mkdirSync, readFileSync, readdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { projectRoot } from "@repo/utils/config"
import { drizzle } from "drizzle-orm/node-sqlite"
import { eq } from "drizzle-orm"
import * as schema from "./schema.ts"

export type TableName = keyof typeof schema

export function openDatabase(
  filename = process.env.DATABASE_PATH ||
    resolve(projectRoot(), "data/buyer.sqlite")
) {
  const path = filename === ":memory:" ? filename : resolve(filename)
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true })
  }

  const sqlite = new DatabaseSync(path)
  sqlite.exec(
    "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;"
  )
  sqlite.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)")
  const migrationPath = resolve(projectRoot(), "packages/db/migrations")

  for (const name of readdirSync(migrationPath)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    if (
      sqlite.prepare("SELECT name FROM _migrations WHERE name = ?").get(name)
    ) {
      continue
    }
    sqlite.exec("BEGIN IMMEDIATE")
    try {
      sqlite.exec(readFileSync(resolve(migrationPath, name), "utf8"))
      sqlite.prepare("INSERT INTO _migrations VALUES (?)").run(name)
      sqlite.exec("COMMIT")
    } catch (error) {
      sqlite.exec("ROLLBACK")
      throw error
    }
  }

  const db = drizzle({ client: sqlite })

  function put<T>(tableName: TableName, id: string, scope: string, value: T) {
    const table = schema[tableName]
    const row = {
      id,
      scope,
      data: JSON.stringify(value),
      createdAt: Date.now(),
    }
    db.insert(table)
      .values(row)
      .onConflictDoUpdate({
        target: table.id,
        set: { scope, data: row.data },
      })
      .run()
  }

  function get<T>(tableName: TableName, id: string): T | undefined {
    const table = schema[tableName]
    const row = db.select().from(table).where(eq(table.id, id)).get()
    return row ? (JSON.parse(row.data) as T) : undefined
  }

  function list<T>(tableName: TableName, scope?: string): T[] {
    const table = schema[tableName]
    const query = db.select().from(table)
    const rows =
      scope === undefined
        ? query.orderBy(table.createdAt).all()
        : query.where(eq(table.scope, scope)).orderBy(table.createdAt).all()
    return rows.map((row) => JSON.parse(row.data) as T)
  }

  function remove(tableName: TableName, id: string) {
    const table = schema[tableName]
    db.delete(table).where(eq(table.id, id)).run()
  }

  return {
    db,
    put,
    get,
    list,
    remove,
    checkConnection() {
      sqlite.prepare("SELECT 1").get()
    },
    close() {
      sqlite.close()
    },
  }
}

export type Store = ReturnType<typeof openDatabase>
