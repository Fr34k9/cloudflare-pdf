import { Router } from "express";
import { isBrowserHealthy } from "../browser/browserManager";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const healthy = await isBrowserHealthy();
  res.status(healthy ? 200 : 503).json({ status: healthy ? "ok" : "browser unavailable" });
});
