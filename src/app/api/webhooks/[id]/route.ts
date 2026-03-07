import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasRole, unauthorized, forbidden, badRequest, notFound, serverError, parseBody } from "@/lib/api-helpers";
import type { Prisma } from "@prisma/client";

const VALID_EVENTS = ["task_completed", "task_moved", "task_created", "cascade_triggered"];

// PATCH /api/webhooks/[id]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  const { id } = await params;
  const webhookId = parseInt(id);
  if (isNaN(webhookId)) return badRequest("Ungültige ID.");

  const body = await parseBody<{
    name?: string;
    url?: string;
    secret?: string;
    events?: string[];
    is_active?: boolean;
  }>(req);

  if (!body) return badRequest("Ungültiger Request-Body.");

  try {
    const existing = await prisma.webhookEndpoint.findUnique({ where: { id: webhookId } });
    if (!existing) return notFound("Webhook nicht gefunden.");

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.url !== undefined) {
      try { new URL(body.url); } catch { return badRequest("URL ist keine gültige URL."); }
      updateData.url = body.url.trim();
    }
    if (body.secret !== undefined) updateData.secret = body.secret.trim();
    if (body.events !== undefined) {
      const invalid = body.events.filter((e) => !VALID_EVENTS.includes(e));
      if (invalid.length > 0) return badRequest(`Ungültige Events: ${invalid.join(", ")}`);
      updateData.events = body.events as Prisma.InputJsonValue;
    }
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    const webhook = await prisma.webhookEndpoint.update({ where: { id: webhookId }, data: updateData });
    return NextResponse.json(webhook);
  } catch {
    return serverError();
  }
}

// DELETE /api/webhooks/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  const { id } = await params;
  const webhookId = parseInt(id);
  if (isNaN(webhookId)) return badRequest("Ungültige ID.");

  try {
    const existing = await prisma.webhookEndpoint.findUnique({ where: { id: webhookId } });
    if (!existing) return notFound("Webhook nicht gefunden.");

    await prisma.webhookEndpoint.delete({ where: { id: webhookId } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return serverError();
  }
}
