import type { Page, PDFOptions } from "puppeteer";
import type { PdfRequest } from "../schema/pdfRequest.schema";

/**
 * Runs page.pdf() with the request's pdfOptions. `path` is intentionally
 * dropped — Cloudflare only honors it server-side for its own REST API, and
 * this service always streams the PDF back in the HTTP response body.
 */
export async function generatePdf(page: Page, body: PdfRequest): Promise<Buffer> {
  const { path, ...pdfOptions } = body.pdfOptions ?? {};
  void path;
  const buffer = await page.pdf(pdfOptions as PDFOptions);
  return Buffer.from(buffer);
}
