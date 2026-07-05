import { Router } from "express";
import { config } from "../config";

export const limitsRouter = Router();

// Public-safe subset of `config` — the numbers the landing page displays.
// Deliberately excludes anything security-sensitive (e.g. allowPrivateNetworkTargets).
limitsRouter.get("/limits", (_req, res) => {
  res.json({
    maxConcurrentRenders: config.maxConcurrentRenders,
    requestTimeoutMs: config.requestTimeoutMs,
    maxBodySize: config.maxBodySize,
    rateLimitWindowMs: config.rateLimitWindowMs,
    rateLimitMax: config.rateLimitMax,
  });
});
