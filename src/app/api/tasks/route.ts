import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasRole, unauthorized, forbidden, badRequest, serverError, parseBody } from "@/lib/api-helpers";
import { findEarliestSprintWithCapacity } from "@/lib/capacity";
import { logTaskCreated } from "@/lib/activity-logger";

// GET /api/tasks
// Query: location_id, sprint_id, status, search, page, limit
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("location_id");
  const sprintId = searchParams.get("sprint_id");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const skip = (page - 1) * limit;

  try {
    const where: Record<string, unknown> = {};
    if (locationId) where.location_id = parseInt(locationId);
    if (sprintId) where.sprint_id = parseInt(sprintId);
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { external_ticket_id: { contains: search } },
      ];
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          location: { select: { id: true, name: true, color: true } },
          sprint: { select: { id: true, label: true, year: true, month: true, lock_status: true } },
          creator: { select: { id: true, name: true } },
        },
        orderBy: [{ sprint: { year: "asc" } }, { sprint: { month: "asc" } }, { priority: "asc" }],
        skip,
        take: limit,
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json({
      tasks,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch {
    return serverError();
  }
}

// POST /api/tasks
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "sales", "admin")) return forbidden();

  const body = await parseBody<{
    title: string;
    description?: string;
    action_points: number;
    location_id: number;
    sprint_id?: number;
    priority?: number;
    external_ticket_id?: string;
  }>(req);

  if (!body) return badRequest("Ungültiger Request-Body.");
  if (!body.title?.trim()) return badRequest("Titel ist erforderlich.");
  if (![1, 2, 3].includes(body.action_points)) return badRequest("Action Points müssen 1, 2 oder 3 sein.");
  if (!body.location_id) return badRequest("Standort ist erforderlich.");

  try {
    const location = await prisma.location.findUnique({ where: { id: body.location_id } });
    if (!location || !location.is_active) return badRequest("Standort existiert nicht oder ist deaktiviert.");

    if (body.external_ticket_id) {
      const existing = await prisma.task.findUnique({ where: { external_ticket_id: body.external_ticket_id } });
      if (existing) return NextResponse.json({ error: "Externe Ticket-ID existiert bereits." }, { status: 409 });
    }

    // Sprint bestimmen: entweder angegeben oder frühester freier Sprint
    let targetSprintId: number;
    if (body.sprint_id) {
      const sprint = await prisma.sprint.findUnique({ where: { id: body.sprint_id } });
      if (!sprint) return badRequest("Sprint existiert nicht.");
      if (sprint.lock_status !== "open") return badRequest("Ziel-Sprint ist gesperrt.");
      targetSprintId = body.sprint_id;
    } else {
      // Frühester Sprint ab jetzt mit Kapazität
      const now = new Date();
      const currentSprint = await prisma.sprint.findFirst({
        where: {
          year: now.getFullYear(),
          month: { gte: now.getMonth() + 1 },
          lock_status: "open",
        },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      });
      const fromSprintId = currentSprint?.id ?? 1;
      const sprint = await findEarliestSprintWithCapacity(body.location_id, body.action_points, fromSprintId);
      targetSprintId = sprint.id;
    }

    // Höchste Prioritätszahl im Ziel-Sprint/Standort ermitteln
    const maxPriority = await prisma.task.aggregate({
      where: { sprint_id: targetSprintId, location_id: body.location_id },
      _max: { priority: true },
    });
    const nextPriority = (maxPriority._max.priority ?? 0) + 1;

    const task = await prisma.task.create({
      data: {
        title: body.title.trim(),
        description: body.description?.trim() ?? null,
        action_points: body.action_points,
        location_id: body.location_id,
        sprint_id: targetSprintId,
        status: "open",
        priority: body.priority ?? nextPriority,
        external_ticket_id: body.external_ticket_id ?? null,
        created_by: parseInt(session.user.id),
      },
      include: {
        location: { select: { id: true, name: true, color: true } },
        sprint: { select: { id: true, label: true } },
      },
    });

    await logTaskCreated(parseInt(session.user.id), task.id, {
      title: task.title,
      sprint_id: task.sprint_id,
      location_id: task.location_id,
      action_points: task.action_points,
    });

    return NextResponse.json(task, { status: 201 });
  } catch {
    return serverError();
  }
}
