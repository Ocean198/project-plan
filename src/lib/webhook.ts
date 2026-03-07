import { prisma } from "@/lib/prisma";
import type { WebhookEndpoint } from "@prisma/client";
import crypto from "crypto";

export type WebhookEvent = "task_completed" | "task_moved" | "task_created" | "cascade_triggered";

export interface WebhookPayload {
  event: string;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Sends a single webhook request with HMAC-SHA256 signature.
 * Returns true on success (2xx response), false otherwise.
 */
export async function sendWebhook(
  webhook: WebhookEndpoint,
  payload: WebhookPayload
): Promise<boolean> {
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", webhook.secret)
    .update(body)
    .digest("hex");

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ressourcify-Signature": `sha256=${signature}`,
        "X-Ressourcify-Event": payload.event,
      },
      body,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sends webhook with exponential backoff retry (3 attempts: 1s, 5s, 30s).
 * Updates last_status and last_triggered_at after final attempt.
 */
async function sendWithRetry(webhook: WebhookEndpoint, payload: WebhookPayload): Promise<void> {
  const delays = [1000, 5000, 30000];
  let success = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    success = await sendWebhook(webhook, payload);
    if (success) break;
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }

  await prisma.webhookEndpoint.update({
    where: { id: webhook.id },
    data: {
      last_status: success ? "success" : "failed",
      last_triggered_at: new Date(),
    },
  });
}

/**
 * Triggers all active webhooks subscribed to a given event.
 * Runs fire-and-forget (does not block the caller).
 */
export function triggerWebhooks(event: WebhookEvent, payload: Omit<WebhookPayload, "event" | "timestamp">): void {
  const fullPayload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  // Fire and forget — do not await
  (async () => {
    try {
      const webhooks = await prisma.webhookEndpoint.findMany({
        where: { is_active: true },
      });

      for (const webhook of webhooks) {
        const subscribedEvents = webhook.events as string[];
        if (subscribedEvents.includes(event)) {
          // Each webhook is retried independently
          sendWithRetry(webhook, fullPayload).catch(() => {/* already handled */});
        }
      }
    } catch {
      // Webhook dispatch errors must never crash the main flow
    }
  })();
}
