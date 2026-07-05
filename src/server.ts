import path from "node:path";
import dotenv from "dotenv";

// Loads variables from a local .env file into process.env, if one exists.
// Never overrides variables already set in the environment (e.g. by
// Coolify/Docker), so platform-injected env vars always take precedence.
dotenv.config();

import express from "express";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { getBrowser, closeBrowser } from "./browser/browserManager";
import { createPdfRouter } from "./routes/pdf";
import { healthRouter } from "./routes/health";
import { limitsRouter } from "./routes/limits";
import { errorHandler } from "./middleware/errorHandler";
import { ConcurrencyLimiter } from "./concurrency";

const app = express();
const limiter = new ConcurrencyLimiter(config.maxConcurrentRenders);

// Needed so express-rate-limit (and any IP-based logic) sees the real client
// IP from X-Forwarded-For rather than Coolify's/Traefik's reverse proxy IP.
app.set("trust proxy", config.trustProxyHops);

app.use(express.json({ limit: config.maxBodySize }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use(healthRouter);
app.use(limitsRouter);
app.use(
  rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, slow down" },
  }),
);
app.use(createPdfRouter(limiter));

app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`cloudflare-pdf listening on port ${config.port}`);
});

// Launch Chromium eagerly so the first real request isn't slowed down by a
// cold browser start, and /health reports accurately right away.
getBrowser().catch((err) => {
  console.error("Failed to launch browser at startup", err);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully`);

  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, config.shutdownGracePeriodMs);

  server.close(async () => {
    await closeBrowser();
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
