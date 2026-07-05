import { Router } from "express";
import { ZodError } from "zod";
import { pdfRequestSchema } from "../schema/pdfRequest.schema";
import { renderPdf, RenderTimeoutError, SsrfBlockedError } from "../render/renderPdf";
import { ConcurrencyLimiter } from "../concurrency";
import { HttpError } from "../middleware/errorHandler";
import { config } from "../config";

export function createPdfRouter(limiter: ConcurrencyLimiter): Router {
  const router = Router();

  router.post("/pdf", async (req, res, next) => {
    if (limiter.isAtCapacity) {
      res.set("Retry-After", "5");
      res.status(429).json({ error: "Too many concurrent renders, try again shortly" });
      return;
    }

    let body;
    try {
      body = pdfRequestSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        next(new HttpError(400, "Invalid request body", err.issues));
        return;
      }
      next(err);
      return;
    }

    try {
      const pdfBuffer = await limiter.run(() => renderPdf(body, config.requestTimeoutMs));
      res.status(200).set("Content-Type", "application/pdf").send(pdfBuffer);
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        next(new HttpError(400, err.message));
        return;
      }
      if (err instanceof RenderTimeoutError) {
        next(new HttpError(504, err.message));
        return;
      }
      next(new HttpError(502, "Failed to render PDF", (err as Error)?.message));
    }
  });

  return router;
}
