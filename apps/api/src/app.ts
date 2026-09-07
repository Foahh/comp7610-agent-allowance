import { Hono } from "hono";
import { createHealthRoutes } from "./routes/health";

export function createApp(checkDatabase: () => void) {
  const app = new Hono();
  const api = app.basePath("/api");
  const healthRoutes = createHealthRoutes(checkDatabase);

  const routes = api.route("/health", healthRoutes);

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
