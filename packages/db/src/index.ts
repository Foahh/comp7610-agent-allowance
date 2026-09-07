import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-sqlite";

const defaultDatabasePath = fileURLToPath(new URL("../../../data/data.sqlite", import.meta.url));

export function openDatabase(filename = process.env.DATABASE_PATH || defaultDatabasePath) {
  const databasePath = filename === ":memory:" ? filename : resolve(filename);

  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const sqlite = new DatabaseSync(databasePath);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec("PRAGMA busy_timeout = 5000");

  const db = drizzle({ client: sqlite });

  function checkConnection() {
    sqlite.prepare("SELECT 1").get();
  }

  function close() {
    sqlite.close();
  }

  return { db, checkConnection, close };
}
