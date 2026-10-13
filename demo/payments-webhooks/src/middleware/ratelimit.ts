import type { NextFunction, Request, Response } from "express";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

const hits = new Map<string, number[]>();

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = String(req.headers["x-forwarded-for"] ?? req.ip);
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  if (recent.length > MAX_REQUESTS) {
    return res.status(429).json({ error: "rate_limited" });
  }
  next();
}
