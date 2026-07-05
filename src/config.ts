function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: parseIntEnv(process.env.PORT, 3000),
  maxConcurrentRenders: parseIntEnv(process.env.MAX_CONCURRENT_RENDERS, 4),
  requestTimeoutMs: parseIntEnv(process.env.REQUEST_TIMEOUT_MS, 60_000),
  maxBodySize: process.env.MAX_BODY_SIZE ?? "2mb",
  shutdownGracePeriodMs: parseIntEnv(process.env.SHUTDOWN_GRACE_PERIOD_MS, 15_000),
  // Blocks navigation/sub-requests to private, loopback, link-local, and
  // cloud-metadata addresses by default (SSRF protection). Only disable this
  // if the service intentionally needs to reach internal network targets.
  allowPrivateNetworkTargets: process.env.ALLOW_PRIVATE_NETWORK_TARGETS === "true",
  rateLimitWindowMs: parseIntEnv(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  rateLimitMax: parseIntEnv(process.env.RATE_LIMIT_MAX, 30),
  trustProxyHops: parseIntEnv(process.env.TRUST_PROXY_HOPS, 1),
};
