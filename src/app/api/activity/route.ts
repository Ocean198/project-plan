import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, serverError } from "@/lib/api-helpers";

// GET /api/activity
// Query: user_id, action, target_type, page, limit
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  const action = searchParams.get("action");
  const targetType = searchParams.get("target_type");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const skip = (page - 1) * limit;

  try {
    const where: Record<string, unknown> = {};
    if (userId) where.user_id = parseInt(userId);
    if (action) where.action = action;
    if (targetType) where.target_type = targetType;

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      prisma.activityLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, page, limit, pages: Math.ceil(total / limit) });
  } catch {
    return serverError();
  }
}
