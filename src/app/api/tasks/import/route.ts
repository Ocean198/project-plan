import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError, parseBody } from "@/lib/api-helpers";
import { findEarliestSprintWithCapacity } from "@/lib/capacity";
import { logTaskImported } from "@/lib/activity-logger";
import { notifyTaskImported } from "@/lib/notification-service";

function validateApiKey(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  return token === process.env.API_KEY;
}

// POST /api/tasks/import
export async function POST(req: Request) {
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: "Ungültiger oder fehlender API-Key." }, { status: 401 });
  }

  const body = await parseBody<{
    title: string;
    description?: string;
    action_points?: number;
    location_id?: number;
    location_name?: string;
    external_ticket_id: string;
  }>(req);

  if (!body) return badRequest("Ungültiger Request-Body.");

  // Validierung
  if (!body.title?.trim()) return badRequest("Titel ist erforderlich.");
  const action_points = body.action_points ?? 1;
  if (![1, 2, 3].includes(action_points)) return badRequest("action_points muss 1, 2 oder 3 sein.");
  if (!body.location_id && !body.location_name) return badRequest("location_id oder location_name ist erforderlich.");

  try {
    // Standort prüfen
    const location = body.location_id
      ? await prisma.location.findUnique({ where: { id: body.location_id } })
      : await prisma.location.findFirst({ where: { name: body.location_name!, is_active: true } });
    if (!location) {
      return NextResponse.json({ error: "Standort nicht gefunden." }, { status: 404 });
    }
    if (!location.is_active) {
      return NextResponse.json({ error: "Der Standort ist deaktiviert." }, { status: 404 });
    }

    // Duplikat-Schutz
    if (body.external_ticket_id) {
      const duplicate = await prisma.task.findUnique({
        where: { external_ticket_id: body.external_ticket_id },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `Externe Ticket-ID "${body.external_ticket_id}" existiert bereits.` },
          { status: 409 }
        );
      }
    }

    // Frühester offener Sprint mit Kapazität
    const now = new Date();
    const currentSprint = await prisma.sprint.findFirst({
      where: {
        OR: [
          { year: { gt: now.getFullYear() } },
          { year: now.getFullYear(), month: { gte: now.getMonth() + 1 } },
        ],
        lock_status: "open",
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });

    const fromSprintId = currentSprint?.id ?? 1;
    const targetSprint = await findEarliestSprintWithCapacity(
      location.id,
      action_points,
      fromSprintId
    );

    // Priorität ans Ende setzen
    const maxPriority = await prisma.task.aggregate({
      where: { sprint_id: targetSprint.id, location_id: location.id },
      _max: { priority: true },
    });
    const nextPriority = (maxPriority._max.priority ?? 0) + 1;

    const task = await prisma.task.create({
      data: {
        title: body.title.trim(),
        description: body.description?.trim() ?? null,
        action_points,
        location_id: location.id,
        sprint_id: targetSprint.id,
        status: "open",
        priority: nextPriority,
        external_ticket_id: body.external_ticket_id ?? null,
        created_by: 1, // System-Import: Admin-User (ID 1)
      },
    });

    await logTaskImported(task.id, {
      title: task.title,
      external_ticket_id: body.external_ticket_id ?? "",
      sprint_id: targetSprint.id,
      location_id: location.id,
    });

    await notifyTaskImported({
      locationId: location.id,
      locationName: location.name,
      taskTitle: task.title,
      externalTicketId: body.external_ticket_id,
      sprintLabel: targetSprint.label,
    });

    return NextResponse.json(
      {
        id: task.id,
        title: task.title,
        action_points: task.action_points,
        location: location.name,
        location_id: location.id,
        assigned_sprint: targetSprint.label,
        sprint_id: targetSprint.id,
        status: "open",
      },
      { status: 201 }
    );
  } catch {
    return serverError();
  }
}
