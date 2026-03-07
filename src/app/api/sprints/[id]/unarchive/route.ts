import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasRole, unauthorized, forbidden, notFound, serverError } from "@/lib/api-helpers";

// POST /api/sprints/[id]/unarchive
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  const { id } = await params;
  const sprintId = parseInt(id);

  try {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) return notFound("Sprint nicht gefunden.");

    const updated = await prisma.sprint.update({
      where: { id: sprintId },
      data: { is_archived: false },
    });

    return NextResponse.json(updated);
  } catch {
    return serverError();
  }
}
