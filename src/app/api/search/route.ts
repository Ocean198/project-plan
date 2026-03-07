import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, badRequest, serverError } from "@/lib/api-helpers";

// GET /api/search?q=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) return badRequest("Suchbegriff muss mindestens 2 Zeichen haben.");

  try {
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { title: { contains: q } },
          { description: { contains: q } },
          { external_ticket_id: { contains: q } },
        ],
      },
      include: {
        location: { select: { id: true, name: true, color: true } },
        sprint: { select: { id: true, label: true } },
      },
      orderBy: { updated_at: "desc" },
      take: 10,
    });

    return NextResponse.json(tasks);
  } catch {
    return serverError();
  }
}
