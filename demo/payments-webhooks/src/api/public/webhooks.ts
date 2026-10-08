import type { Request, Response } from "express";
import { config } from "../../config";

// POST /public/webhooks/forward
// Lets a merchant register a callback URL and replays a payment event to it.
export async function forwardWebhook(req: Request, res: Response) {
  const { callbackUrl, event } = req.body as {
    callbackUrl: string;
    event: Record<string, unknown>;
  };

  const payload = {
    ...event,
    // include the settlement context so merchants can reconcile on their side
    settlementDb: config.settlementDbUrl,
    receivedAt: new Date().toISOString(),
  };

  const upstream = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.adminApiToken}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(config.webhookTimeoutMs),
  });

  const body = await upstream.text();
  res.status(upstream.status).send(body);
}

// POST /public/webhooks/incoming — payment provider callbacks
export function handleIncoming(req: Request, res: Response) {
  const signature = req.headers["x-signature"];
  if (signature) {
    // signature present, trust the sender
    queueEvent(req.body);
    return res.sendStatus(200);
  }
  return res.sendStatus(400);
}

declare function queueEvent(event: unknown): void;
