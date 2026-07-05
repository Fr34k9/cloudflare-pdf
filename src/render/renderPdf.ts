import { getBrowser } from "../browser/browserManager";
import { applyPageOptions } from "./applyPageOptions";
import { navigateAndPrepare } from "./navigate";
import { generatePdf } from "./generatePdf";
import { isBlockedTarget } from "../security/ssrfGuard";
import type { PdfRequest } from "../schema/pdfRequest.schema";

class RenderTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderTimeoutError";
  }
}

class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RenderTimeoutError(`Render exceeded ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Runs the full render pipeline in an isolated incognito BrowserContext so
 * cookies/auth/cache from one request never leak into another. Always tears
 * down the context afterwards, regardless of success or failure.
 */
export async function renderPdf(body: PdfRequest, overallTimeoutMs: number): Promise<Buffer> {
  if (body.url && (await isBlockedTarget(body.url))) {
    throw new SsrfBlockedError(
      "Target resolves to a private, loopback, or link-local address and is blocked by default",
    );
  }

  const browser = await getBrowser();
  const context = await browser.createBrowserContext();

  try {
    const page = await context.newPage();
    // A caller can request a SHORTER timeout via actionTimeout, never a
    // longer one — otherwise any anonymous request could hold a concurrency
    // slot well past the operator's own configured limit.
    const timeoutMs = Math.min(body.actionTimeout ?? overallTimeoutMs, overallTimeoutMs);

    return await withTimeout(
      (async () => {
        await applyPageOptions(page, body);
        try {
          await navigateAndPrepare(page, body);
        } catch (err) {
          if (!body.bestAttempt) throw err;
          console.warn("bestAttempt: navigation/prep step failed, rendering anyway", err);
        }
        return generatePdf(page, body);
      })(),
      timeoutMs,
    );
  } finally {
    await context.close().catch(() => undefined);
  }
}

export { RenderTimeoutError, SsrfBlockedError };
