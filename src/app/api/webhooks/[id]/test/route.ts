import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasRole, unauthorized, forbidden, badRequest, notFound, serverError } from "@/lib/api-helpers";
import { sendWebhook } from "@/lib/webhook";

// POST /api/webhooks/[id]/test
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  const { id } = await params;
  const webhookId = parseInt(id);
  if (isNaN(webhookId)) return badRequest("Ungültige ID.");

  try {
    const webhook = await prisma.webhookEndpoint.findUnique({ where: { id: webhookId } });
    if (!webhook) return notFound("Webhook nicht gefunden.");

    const testPayload = {
      event: "test",
      timestamp: new Date().toISOString(),
      message: "Dies ist ein Test-Webhook von ressourcify.",
      webhook_id: webhookId,
    };

    const success = await sendWebhook(webhook, testPayload);

    await prisma.webhookEndpoint.update({
      where: { id: webhookId },
      data: {
        last_status: success ? "success" : "failed",
        last_triggered_at: new Date(),
      },
    });

    return NextResponse.json({ success, message: success ? "Test erfolgreich gesendet." : "Test fehlgeschlagen." });
  } catch {
    return serverError();
  }
}
