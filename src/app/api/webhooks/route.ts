import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasRole, unauthorized, forbidden, badRequest, serverError, parseBody } from "@/lib/api-helpers";
import type { Prisma } from "@prisma/client";

const VALID_EVENTS = ["task_completed", "task_moved", "task_created", "cascade_triggered"];

// GET /api/webhooks
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  try {
    const webhooks = await prisma.webhookEndpoint.findMany({ orderBy: { created_at: "desc" } });
    return NextResponse.json(webhooks);
  } catch {
    return serverError();
  }
}

// POST /api/webhooks
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  const body = await parseBody<{
    name: string;
    url: string;
    secret: string;
    events: string[];
  }>(req);

  if (!body) return badRequest("Ungültiger Request-Body.");
  if (!body.name?.trim()) return badRequest("Name ist erforderlich.");
  if (!body.url?.trim()) return badRequest("URL ist erforderlich.");
  if (!body.secret?.trim()) return badRequest("Secret ist erforderlich.");
  if (!Array.isArray(body.events) || body.events.length === 0) return badRequest("Mindestens ein Event muss ausgewählt sein.");

  const invalidEvents = body.events.filter((e) => !VALID_EVENTS.includes(e));
  if (invalidEvents.length > 0) return badRequest(`Ungültige Events: ${invalidEvents.join(", ")}`);

  try {
    new URL(body.url); // URL-Validierung
  } catch {
    return badRequest("URL ist keine gültige URL.");
  }

  try {
    const webhook = await prisma.webhookEndpoint.create({
      data: {
        name: body.name.trim(),
        url: body.url.trim(),
        secret: body.secret.trim(),
        events: body.events as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json(webhook, { status: 201 });
  } catch {
    return serverError();
  }
}
