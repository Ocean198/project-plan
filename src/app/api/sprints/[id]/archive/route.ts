import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, forbidden, notFound, serverError } from "@/lib/api-helpers";
import { getPermissions, can } from "@/lib/permissions";

// POST /api/sprints/[id]/archive
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  const permissions = await getPermissions();
  if (!can(session.user.role, 'sprints.archive', permissions)) return forbidden();

  const { id } = await params;
  const sprintId = parseInt(id);

  try {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) return notFound("Sprint nicht gefunden.");

    // Hard-lock erzwingen (ggf. zwei Schritte)
    if (sprint.lock_status !== "hard_locked") {
      if (sprint.lock_status === "open") {
        await prisma.sprint.update({ where: { id: sprintId }, data: { lock_status: "soft_locked" } });
      }
      await prisma.sprint.update({ where: { id: sprintId }, data: { lock_status: "hard_locked" } });
    }

    const updated = await prisma.sprint.update({
      where: { id: sprintId },
      data: { is_archived: true },
    });

    return NextResponse.json(updated);
  } catch {
    return serverError();
  }
}
