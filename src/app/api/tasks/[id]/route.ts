import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSession, hasRole, unauthorized, forbidden, badRequest,
  notFound, serverError, parseBody,
} from "@/lib/api-helpers";
import { logTaskCompleted, logTaskPriorityChanged } from "@/lib/activity-logger";
import { triggerWebhooks } from "@/lib/webhook";
import { getPermissions, can } from "@/lib/permissions";

// GET /api/tasks/[id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await params;
  const taskId = parseInt(id);

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        location: { select: { id: true, name: true, color: true } },
        sprint: { select: { id: true, label: true, year: true, month: true, lock_status: true } },
        creator: { select: { id: true, name: true } },
      },
    });

    if (!task) return notFound("Aufgabe nicht gefunden.");
    return NextResponse.json(task);
  } catch {
    return serverError();
  }
}

// PATCH /api/tasks/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  const permissions = await getPermissions();
  const role = session.user.role;
  if (!can(role, 'board.change_status', permissions)) return forbidden();

  const { id } = await params;
  const taskId = parseInt(id);

  const body = await parseBody<{
    title?: string;
    description?: string;
    action_points?: number;
    status?: "open" | "in_progress" | "completed";
    priority?: number;
  }>(req);

  if (!body) return badRequest("Ungültiger Request-Body.");

  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return notFound("Aufgabe nicht gefunden.");

    if (task.status === "completed") {
      // Users with reopen permission can reactivate a completed task by setting it back to open or in_progress
      if (can(role, 'board.reopen_tasks', permissions) && body.status && body.status !== "completed") {
        const updated = await prisma.task.update({
          where: { id: taskId },
          data: { status: body.status, completed_at: null },
          include: {
            location: { select: { id: true, name: true, color: true } },
            sprint: { select: { id: true, label: true } },
          },
        });
        return NextResponse.json(updated);
      }
      return forbidden("Abgeschlossene Aufgaben können nicht mehr bearbeitet werden.");
    }

    const sprint = await prisma.sprint.findUnique({ where: { id: task.sprint_id } });
    if (sprint?.lock_status === "hard_locked") {
      return forbidden("Hard-gelockte Sprints können nicht bearbeitet werden.");
    }

    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.description !== undefined) updateData.description = body.description.trim() || null;
    if (body.action_points !== undefined) {
      if (![1, 2, 3].includes(body.action_points)) return badRequest("Action Points müssen 1, 2 oder 3 sein.");
      updateData.action_points = body.action_points;
    }
    if (body.priority !== undefined) {
      const oldPriority = task.priority;
      updateData.priority = body.priority;
      await logTaskPriorityChanged(parseInt(session.user.id), taskId, {
        old_priority: oldPriority,
        new_priority: body.priority,
      });
    }
    if (body.status !== undefined) {
      if (body.status === "completed") {
        updateData.status = "completed";
        updateData.completed_at = new Date();
        await logTaskCompleted(parseInt(session.user.id), taskId, {
          title: task.title,
          sprint_id: task.sprint_id,
        });
        // Webhook fire-and-forget after DB update (done below)
      } else {
        updateData.status = body.status;
      }
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        location: { select: { id: true, name: true, color: true } },
        sprint: { select: { id: true, label: true } },
      },
    });

    // Trigger webhooks
    if (body.status === "completed") {
      triggerWebhooks("task_completed", {
        task: {
          id: updated.id,
          title: updated.title,
          external_ticket_id: updated.external_ticket_id,
          action_points: updated.action_points,
          location: updated.location.name,
          sprint: updated.sprint.label,
          status: updated.status,
          completed_at: updated.completed_at,
        },
      });
    }

    return NextResponse.json(updated);
  } catch {
    return serverError();
  }
}

// DELETE /api/tasks/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  const permissions = await getPermissions();
  if (!can(session.user.role, 'board.delete_tasks', permissions)) return forbidden();

  const { id } = await params;
  const taskId = parseInt(id);

  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return notFound("Aufgabe nicht gefunden.");

    await prisma.task.delete({ where: { id: taskId } });
    return NextResponse.json({ success: true });
  } catch {
    return serverError();
  }
}
