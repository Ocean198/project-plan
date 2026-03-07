import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSession, hasRole, unauthorized, forbidden, badRequest,
  notFound, serverError, parseBody,
} from "@/lib/api-helpers";
import { setSprintLockStatus } from "@/lib/sprint-manager";
import { logSprintLocked, logSprintUnlocked } from "@/lib/activity-logger";
import { notifySprintLocked } from "@/lib/notification-service";
import type { SprintLockStatus } from "@prisma/client";

// POST /api/sprints/[id]/lock
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  const { id } = await params;
  const sprintId = parseInt(id);

  const body = await parseBody<{ lock_status: SprintLockStatus }>(req);
  if (!body?.lock_status) return badRequest("lock_status ist erforderlich.");

  const validStatuses: SprintLockStatus[] = ["open", "soft_locked", "hard_locked"];
  if (!validStatuses.includes(body.lock_status)) {
    return badRequest(`Ungültiger lock_status. Erlaubt: ${validStatuses.join(", ")}`);
  }

  try {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) return notFound("Sprint nicht gefunden.");

    const oldStatus = sprint.lock_status;
    const updated = await setSprintLockStatus(sprintId, body.lock_status);

    const isLocking = ["soft_locked", "hard_locked"].includes(body.lock_status);
    const logFn = isLocking ? logSprintLocked : logSprintUnlocked;

    await logFn(parseInt(session.user.id), sprintId, {
      old_status: oldStatus,
      new_status: body.lock_status,
      label: sprint.label,
    });

    // Alle aktiven Standorte benachrichtigen
    if (isLocking) {
      const locations = await prisma.location.findMany({ where: { is_active: true } });
      for (const location of locations) {
        await notifySprintLocked({
          locationId: location.id,
          sprintLabel: sprint.label,
          newStatus: body.lock_status,
          triggeredByUserId: parseInt(session.user.id),
          triggeredByUserName: session.user.name,
        });
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
