import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSession, hasRole, unauthorized, forbidden, badRequest,
  notFound, serverError, parseBody,
} from "@/lib/api-helpers";
import { logCapacityChanged } from "@/lib/activity-logger";
import { notifyCapacityChanged } from "@/lib/notification-service";
import { createNextSprint } from "@/lib/sprint-manager";

// GET /api/sprints/[id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await params;
  const sprintId = parseInt(id);

  try {
    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId },
      include: {
        capacities: {
          include: { location: { select: { id: true, name: true, color: true } } },
        },
        tasks: {
          include: {
            location: { select: { id: true, name: true, color: true } },
            creator: { select: { id: true, name: true } },
          },
          orderBy: { priority: "asc" },
        },
      },
    });

    if (!sprint) return notFound("Sprint nicht gefunden.");
    return NextResponse.json(sprint);
  } catch {
    return serverError();
  }
}

// PATCH /api/sprints/[id]
// Aktualisiert das AP-Budget einer Standort/Sprint-Kombination oder das Label
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  const { id } = await params;
  const sprintId = parseInt(id);

  const body = await parseBody<{
    label?: string;
    location_id?: number;
    max_action_points?: number;
  }>(req);

  if (!body) return badRequest("Ungültiger Request-Body.");

  // Label-Update
  if (body.label !== undefined) {
    const trimmed = body.label.trim();
    if (!trimmed) return badRequest("Label darf nicht leer sein.");
    try {
      const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
      if (!sprint) return notFound("Sprint nicht gefunden.");
      const updated = await prisma.sprint.update({ where: { id: sprintId }, data: { label: trimmed } });
      return NextResponse.json(updated);
    } catch {
      return serverError();
    }
  }

  if (!body.location_id) return badRequest("location_id ist erforderlich.");
  if (body.max_action_points == null || body.max_action_points < 0) {
    return badRequest("max_action_points muss eine positive Zahl sein.");
  }

  try {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) return notFound("Sprint nicht gefunden.");

    const location = await prisma.location.findUnique({ where: { id: body.location_id } });
    if (!location) return notFound("Standort nicht gefunden.");

    const existing = await prisma.sprintCapacity.findUnique({
      where: { sprint_id_location_id: { sprint_id: sprintId, location_id: body.location_id } },
    });

    const oldValue = existing?.max_action_points ?? 0;

    const capacity = await prisma.sprintCapacity.upsert({
      where: { sprint_id_location_id: { sprint_id: sprintId, location_id: body.location_id } },
      update: { max_action_points: body.max_action_points },
      create: {
        sprint_id: sprintId,
        location_id: body.location_id,
        max_action_points: body.max_action_points,
      },
    });

    await logCapacityChanged(parseInt(session.user.id), capacity.id, {
      sprint_id: sprintId,
      location_id: body.location_id,
      old_value: oldValue,
      new_value: body.max_action_points,
    });

    await notifyCapacityChanged({
      locationId: body.location_id,
      locationName: location.name,
      sprintLabel: sprint.label,
      oldValue,
      newValue: body.max_action_points,
      triggeredByUserId: parseInt(session.user.id),
      triggeredByUserName: session.user.name,
    });

    return NextResponse.json(capacity);
  } catch {
    return serverError();
  }
}

// DELETE /api/sprints/[id]
// Verschiebt alle Tasks auf den nächsten Sprint, löscht dann diesen Sprint.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  const { id } = await params;
  const sprintId = parseInt(id);

  try {
    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId },
      include: { tasks: true },
    });
    if (!sprint) return notFound("Sprint nicht gefunden.");

    // Nächsten Sprint nach diesem finden (nach ID-Reihenfolge, nicht archiviert)
    let nextSprint = await prisma.sprint.findFirst({
      where: { is_archived: false, id: { gt: sprintId } },
      orderBy: { id: "asc" },
    });

    // Tasks verschieben — nur wenn welche vorhanden
    if (sprint.tasks.length > 0) {
      // Keinen Folge-Sprint → modus-bewusst einen neuen anlegen
      if (!nextSprint) {
        nextSprint = await createNextSprint();
      }
      await prisma.task.updateMany({
        where: { sprint_id: sprintId },
        data: { sprint_id: nextSprint.id },
      });
    }

    // Sprint löschen (Cascade löscht sprint_capacities)
    await prisma.sprint.delete({ where: { id: sprintId } });

    return NextResponse.json({ movedTasks: sprint.tasks.length, targetSprintId: nextSprint?.id ?? null });
  } catch {
    return serverError();
  }
}
