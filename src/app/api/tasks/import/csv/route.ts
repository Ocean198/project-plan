import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, forbidden } from "@/lib/api-helpers";
import { findEarliestSprintWithCapacity } from "@/lib/capacity";
import { logTaskImported } from "@/lib/activity-logger";
import { notifyTaskImported } from "@/lib/notification-service";

interface CsvRow {
  title: string;
  description?: string;
  story_points?: number;
  location_name: string;
  external_ticket_id?: string;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return forbidden();

  let rows: CsvRow[];
  try {
    rows = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Keine Zeilen gefunden." }, { status: 400 });
  }

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

  const results: {
    row: number;
    success: boolean;
    title: string;
    sprint?: string;
    error?: string;
  }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row.title?.trim()) {
        results.push({ row: i + 1, success: false, title: "(leer)", error: "Titel fehlt." });
        continue;
      }
      if (!row.location_name?.trim()) {
        results.push({ row: i + 1, success: false, title: row.title, error: "Standortname fehlt." });
        continue;
      }

      const action_points = row.story_points ?? 1;
      if (!Number.isInteger(action_points) || action_points < 1 || action_points > 10) {
        results.push({ row: i + 1, success: false, title: row.title, error: "Story Points müssen 1–10 sein." });
        continue;
      }

      const location = await prisma.location.findFirst({
        where: { name: { equals: row.location_name.trim() }, is_active: true },
      });
      if (!location) {
        results.push({ row: i + 1, success: false, title: row.title, error: `Standort "${row.location_name}" nicht gefunden.` });
        continue;
      }

      if (row.external_ticket_id?.trim()) {
        const duplicate = await prisma.task.findUnique({
          where: { external_ticket_id: row.external_ticket_id.trim() },
        });
        if (duplicate) {
          results.push({ row: i + 1, success: false, title: row.title, error: `Ticket-ID "${row.external_ticket_id}" existiert bereits.` });
          continue;
        }
      }

      const targetSprint = await findEarliestSprintWithCapacity(location.id, action_points, fromSprintId);

      const maxPriority = await prisma.task.aggregate({
        where: { sprint_id: targetSprint.id, location_id: location.id },
        _max: { priority: true },
      });
      const nextPriority = (maxPriority._max.priority ?? 0) + 1;

      const task = await prisma.task.create({
        data: {
          title: row.title.trim(),
          description: row.description?.trim() || null,
          action_points,
          location_id: location.id,
          sprint_id: targetSprint.id,
          status: "open",
          priority: nextPriority,
          external_ticket_id: row.external_ticket_id?.trim() || null,
          created_by: parseInt(session.user.id),
        },
      });

      await logTaskImported(task.id, {
        title: task.title,
        external_ticket_id: row.external_ticket_id?.trim() ?? "",
        sprint_id: targetSprint.id,
        location_id: location.id,
      });

      await notifyTaskImported({
        locationId: location.id,
        locationName: location.name,
        taskTitle: task.title,
        externalTicketId: row.external_ticket_id?.trim(),
        sprintLabel: targetSprint.label,
      });

      results.push({ row: i + 1, success: true, title: task.title, sprint: targetSprint.label });
    } catch {
      results.push({ row: i + 1, success: false, title: row.title || `Zeile ${i + 1}`, error: "Interner Fehler." });
    }
  }

  return NextResponse.json({ results });
}
