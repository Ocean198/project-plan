import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSession, hasRole, unauthorized, forbidden, badRequest, serverError, parseBody,
} from "@/lib/api-helpers";
import { executeCascade } from "@/lib/capacity";
import { logTaskMoved, logCascadeTriggered } from "@/lib/activity-logger";
import { notifyCascade } from "@/lib/notification-service";
import { triggerWebhooks } from "@/lib/webhook";

// POST /api/tasks/move
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "sales", "admin")) return forbidden();

  const body = await parseBody<{ task_id: number; target_sprint_id: number }>(req);
  if (!body?.task_id || !body?.target_sprint_id) {
    return badRequest("task_id und target_sprint_id sind erforderlich.");
  }

  try {
    const task = await prisma.task.findUnique({
      where: { id: body.task_id },
      include: { sprint: true, location: true },
    });
    if (!task) return badRequest("Aufgabe nicht gefunden.");
    if (task.status === "completed") return forbidden("Abgeschlossene Aufgaben können nicht verschoben werden.");

    const targetSprint = await prisma.sprint.findUnique({ where: { id: body.target_sprint_id } });
    if (!targetSprint) return badRequest("Ziel-Sprint nicht gefunden.");
    if (targetSprint.lock_status !== "open") return forbidden("Ziel-Sprint ist gesperrt.");

    const fromSprintLabel = task.sprint.label;
    const toSprintLabel = targetSprint.label;

    const result = await executeCascade(body.task_id, body.target_sprint_id);

    // Aktivitätslog: Task-Verschiebung
    await logTaskMoved(parseInt(session.user.id), body.task_id, {
      from_sprint_id: task.sprint_id,
      to_sprint_id: body.target_sprint_id,
      from_sprint_label: fromSprintLabel,
      to_sprint_label: toSprintLabel,
    });

    // Aktivitätslog + Benachrichtigungen für Cascade
    if (result.cascaded_tasks.length > 0) {
      await logCascadeTriggered(parseInt(session.user.id), body.task_id, {
        triggered_by_task_id: body.task_id,
        cascaded_tasks: result.cascaded_tasks,
      });

      // Benachrichtigung: nach Standorten gruppieren
      const toSprintIds = [...new Set(result.cascaded_tasks.map((t) => t.to_sprint_id))];
      for (const toSprintId of toSprintIds) {
        const toSprint = await prisma.sprint.findUnique({ where: { id: toSprintId } });
        if (!toSprint) continue;
        const affectedCount = result.cascaded_tasks.filter((t) => t.to_sprint_id === toSprintId).length;

        await notifyCascade({
          locationId: task.location_id,
          locationName: task.location.name,
          triggeredByUserName: session.user.name,
          triggeredByUserId: parseInt(session.user.id),
          cascadedCount: affectedCount,
          targetSprintLabel: toSprint.label,
          boardLink: `/board?sprint=${toSprintId}`,
        });
      }
    }

    // Webhooks
    triggerWebhooks("task_moved", {
      task: {
        id: body.task_id,
        from_sprint: fromSprintLabel,
        to_sprint: toSprintLabel,
        location: task.location.name,
      },
      cascade_count: result.cascaded_tasks.length,
    });

    if (result.cascaded_tasks.length > 0) {
      triggerWebhooks("cascade_triggered", {
        triggered_by_task_id: body.task_id,
        location: task.location.name,
        cascaded_tasks: result.cascaded_tasks,
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
