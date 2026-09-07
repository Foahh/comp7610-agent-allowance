import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { openDatabase } from "@repo/db";
import { createApp } from "./app";

const environmentPath = fileURLToPath(new URL("../../../.env", import.meta.url));

if (existsSync(environmentPath)) {
  loadEnvFile(environmentPath);
}

const database = openDatabase();
const app = createApp(database.checkConnection);

export function close() {
  database.close();
}

if (import.meta.hot) {
  import.meta.hot.dispose(close);
}

export default app;
