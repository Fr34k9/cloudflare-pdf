import { z } from "zod";
import { isSafeRegexPattern } from "../security/regexSafety";

/**
 * Mirrors Cloudflare's Browser Rendering /pdf request body field-for-field:
 * https://developers.cloudflare.com/browser-rendering/rest-api/pdf-endpoint/
 *
 * Nested objects that map almost 1:1 onto raw Puppeteer arguments use
 * .passthrough() so unrecognized-but-valid Puppeteer/Cloudflare fields don't
 * get rejected outright.
 */

const dimension = z.union([z.string(), z.number()]);

// Only http/https are ever valid navigation targets. Without this, `url`
// would happily accept file:, chrome:, or other schemes that let a remote
// caller read local files or reach internal browser surfaces.
const httpUrlSchema = z.string().url().refine(
  (value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  },
  { message: "url must use the http or https scheme" },
);

const gotoOptionsSchema = z
  .object({
    timeout: z.number().optional(),
    waitUntil: z
      .union([
        z.enum(["load", "domcontentloaded", "networkidle0", "networkidle2"]),
        z.array(z.enum(["load", "domcontentloaded", "networkidle0", "networkidle2"])),
      ])
      .optional(),
    referer: z.string().optional(),
    referrerPolicy: z.string().optional(),
  })
  .passthrough();

const requestPatternSchema = z
  .string()
  .max(200)
  .refine(isSafeRegexPattern, { message: "unsafe or invalid regex pattern" });

const viewportSchema = z
  .object({
    width: z.number().int().positive().max(10_000),
    height: z.number().int().positive().max(10_000),
    deviceScaleFactor: z.number().optional(),
    hasTouch: z.boolean().optional(),
    isLandscape: z.boolean().optional(),
    isMobile: z.boolean().optional(),
  })
  .passthrough();

const cookieSchema = z
  .object({
    name: z.string(),
    value: z.string(),
    domain: z.string().optional(),
    expires: z.number().optional(),
    httpOnly: z.boolean().optional(),
    path: z.string().optional(),
    secure: z.boolean().optional(),
    sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
  })
  .passthrough();

const authenticateSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// `path` is accepted for schema compatibility with Cloudflare/Puppeteer but is
// always stripped before use (see render/navigate.ts) — it reads a file off
// this server's filesystem, which must never be driven by a remote caller.
const scriptTagSchema = z
  .object({
    url: z.string().optional(),
    path: z.string().optional(),
    content: z.string().optional(),
    type: z.string().optional(),
    id: z.string().optional(),
  })
  .passthrough();

const styleTagSchema = z
  .object({
    url: z.string().optional(),
    path: z.string().optional(),
    content: z.string().optional(),
  })
  .passthrough();

const waitForSelectorSchema = z
  .object({
    selector: z.string(),
    timeout: z.number().optional(),
    visible: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .passthrough();

const marginSchema = z
  .object({
    top: dimension.optional(),
    bottom: dimension.optional(),
    left: dimension.optional(),
    right: dimension.optional(),
  })
  .passthrough();

const pdfOptionsSchema = z
  .object({
    format: z.string().optional(),
    printBackground: z.boolean().optional(),
    margin: marginSchema.optional(),
    scale: z.number().optional(),
    landscape: z.boolean().optional(),
    displayHeaderFooter: z.boolean().optional(),
    headerTemplate: z.string().optional(),
    footerTemplate: z.string().optional(),
    pageRanges: z.string().optional(),
    width: dimension.optional(),
    height: dimension.optional(),
    preferCSSPageSize: z.boolean().optional(),
    timeout: z.number().optional(),
    // `path` is REST-API-server-side-only on Cloudflare; accepted but ignored,
    // we always stream the generated PDF back in the response body.
    path: z.string().optional(),
  })
  .passthrough();

export const pdfRequestSchema = z
  .object({
    url: httpUrlSchema.optional(),
    html: z.string().optional(),
    // No upper bound here: renderPdf.ts clamps this to the server's own
    // overallTimeoutMs, so a caller can only ever shorten the timeout, never
    // extend it past what the operator configured.
    actionTimeout: z.number().positive().optional(),
    waitForTimeout: z.number().optional(),
    gotoOptions: gotoOptionsSchema.optional(),
    viewport: viewportSchema.optional(),
    cookies: z.array(cookieSchema).optional(),
    authenticate: authenticateSchema.optional(),
    userAgent: z.string().optional(),
    setJavaScriptEnabled: z.boolean().optional(),
    setExtraHTTPHeaders: z.record(z.string()).optional(),
    addScriptTag: z.array(scriptTagSchema).optional(),
    addStyleTag: z.array(styleTagSchema).optional(),
    allowRequestPattern: z.array(requestPatternSchema).optional(),
    rejectRequestPattern: z.array(requestPatternSchema).optional(),
    allowResourceTypes: z.array(z.string()).optional(),
    rejectResourceTypes: z.array(z.string()).optional(),
    waitForSelector: waitForSelectorSchema.optional(),
    emulateMediaType: z.string().optional(),
    bestAttempt: z.boolean().optional(),
    pdfOptions: pdfOptionsSchema.optional(),
  })
  .strict()
  .refine((body) => Boolean(body.url) !== Boolean(body.html), {
    message: "Exactly one of `url` or `html` must be provided",
    path: ["url"],
  });

export type PdfRequest = z.infer<typeof pdfRequestSchema>;
