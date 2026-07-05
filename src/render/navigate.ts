import type { Page } from "puppeteer";
import type { PdfRequest } from "../schema/pdfRequest.schema";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Navigates to the target (url or html), then applies wait conditions and
 * post-load injections (waitForSelector/waitForTimeout, addScriptTag/
 * addStyleTag, emulateMediaType). Throws on failure — the caller decides
 * whether to honor `bestAttempt` and proceed to PDF generation anyway.
 */
export async function navigateAndPrepare(page: Page, body: PdfRequest): Promise<void> {
  if (body.url) {
    await page.goto(body.url, body.gotoOptions);
  } else if (body.html) {
    // page.setContent()'s waitUntil type is narrower than page.goto()'s
    // (no networkidle0/2); Cloudflare's schema doesn't distinguish the two,
    // so pass gotoOptions through as-is and let Puppeteer validate at runtime.
    await page.setContent(body.html, body.gotoOptions as Parameters<typeof page.setContent>[1]);
  }

  if (body.waitForSelector) {
    const { selector, ...options } = body.waitForSelector;
    await page.waitForSelector(selector, options);
  }

  if (typeof body.waitForTimeout === "number") {
    await wait(body.waitForTimeout);
  }

  if (body.addScriptTag?.length) {
    for (const tag of body.addScriptTag) {
      // `path` reads a file off this server's own filesystem — never honor
      // it from a remote request, or any caller could read arbitrary local
      // files (e.g. {"path": "/etc/passwd"}) into the rendered page. If that
      // was the only thing specified, skip the tag rather than erroring.
      const { path, ...safeTag } = tag;
      void path;
      if (!safeTag.url && !safeTag.content) continue;
      await page.addScriptTag(safeTag);
    }
  }

  if (body.addStyleTag?.length) {
    for (const tag of body.addStyleTag) {
      const { path, ...safeTag } = tag;
      void path;
      if (!safeTag.url && !safeTag.content) continue;
      await page.addStyleTag(safeTag);
    }
  }

  if (body.emulateMediaType) {
    await page.emulateMediaType(body.emulateMediaType);
  }
}
