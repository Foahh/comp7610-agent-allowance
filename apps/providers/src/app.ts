import { Hono } from "hono";
import { healthRoutes } from "./routes/health";

const router = new Hono();

export const app = router.route("/health", healthRoutes);
