import type { Page, CookieParam } from "puppeteer";
import type { PdfRequest } from "../schema/pdfRequest.schema";
import { isBlockedTarget } from "../security/ssrfGuard";

function compilePatterns(patterns: string[]): RegExp[] {
  const compiled: RegExp[] = [];
  for (const p of patterns) {
    try {
      compiled.push(new RegExp(p));
    } catch {
      // Already validated by the schema (isSafeRegexPattern compiles each
      // pattern too) — this is just a defensive backstop.
    }
  }
  return compiled;
}

function buildUserFilter(body: PdfRequest) {
  const rejectResourceTypes = body.rejectResourceTypes ?? [];
  const allowResourceTypes = body.allowResourceTypes ?? [];
  const rejectPatterns = compilePatterns(body.rejectRequestPattern ?? []);
  const allowPatterns = compilePatterns(body.allowRequestPattern ?? []);

  return function shouldAllow(url: string, resourceType: string): boolean {
    if (rejectResourceTypes.includes(resourceType)) return false;
    if (rejectPatterns.some((re) => re.test(url))) return false;
    if (allowResourceTypes.length > 0 && !allowResourceTypes.includes(resourceType)) {
      return false;
    }
    if (allowPatterns.length > 0 && !allowPatterns.some((re) => re.test(url))) {
      return false;
    }
    return true;
  };
}

/**
 * Applies every page-level option that must be set up BEFORE navigation:
 * JS toggle, request interception, extra headers, viewport, cookies,
 * HTTP auth, and user agent.
 */
export async function applyPageOptions(page: Page, body: PdfRequest): Promise<void> {
  if (typeof body.setJavaScriptEnabled === "boolean") {
    await page.setJavaScriptEnabled(body.setJavaScriptEnabled);
  }

  // Request interception is always armed (not just when the caller supplies
  // allow/reject options) so the SSRF guard below applies to every request
  // the page makes — including sub-resources loaded by injected scripts or
  // by a redirect — not just the initial navigation. This check cannot be
  // overridden by the caller's own allow/reject rules.
  //
  // Deliberately NOT cached per-hostname: a cached "safe" verdict would let a
  // DNS-rebinding attacker pass the check once on a public IP, then flip DNS
  // to a private address for a later sub-resource request on the same
  // hostname within the same render. Re-checking every request is cheap
  // (dns.lookup is fast and the OS resolver caches repeat lookups anyway).
  const shouldAllowByUserRules = buildUserFilter(body);

  await page.setRequestInterception(true);
  page.on("request", (request) => {
    void (async () => {
      const url = request.url();
      const resourceType = request.resourceType();

      try {
        if (url.startsWith("http:") || url.startsWith("https:")) {
          if (await isBlockedTarget(url)) {
            await request.abort("blockedbyclient");
            return;
          }
        }

        if (shouldAllowByUserRules(url, resourceType)) {
          await request.continue();
        } else {
          await request.abort();
        }
      } catch {
        // request may already be handled/detached (e.g. navigation aborted
        // concurrently) — nothing to do.
      }
    })();
  });

  if (body.setExtraHTTPHeaders) {
    await page.setExtraHTTPHeaders(body.setExtraHTTPHeaders);
  }

  if (body.viewport) {
    await page.setViewport(body.viewport);
  }

  if (body.cookies?.length) {
    const cookies: CookieParam[] = body.cookies.map((cookie) => {
      if (!cookie.domain && body.url) {
        return { ...cookie, url: body.url };
      }
      return cookie;
    });
    await page.setCookie(...cookies);
  }

  if (body.authenticate) {
    await page.authenticate(body.authenticate);
  }

  if (body.userAgent) {
    await page.setUserAgent(body.userAgent);
  }
}
