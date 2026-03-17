import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, forbidden, badRequest, notFound, serverError, parseBody } from "@/lib/api-helpers";
import { logTaskCommented } from "@/lib/activity-logger";

// POST /api/tasks/[id]/comment
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await params;
  const taskId = parseInt(id);

  const body = await parseBody<{ comment: string }>(req);
  if (!body || !body.comment?.trim()) return badRequest("Kommentar darf nicht leer sein.");

  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return notFound("Aufgabe nicht gefunden.");

    await logTaskCommented(parseInt(session.user.id), taskId, { comment: body.comment.trim() });

    return NextResponse.json({ success: true });
  } catch {
    return serverError();
  }
}
