import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, serverError } from "@/lib/api-helpers";

// GET /api/notifications – eigene Benachrichtigungen
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "true";

  try {
    const notifications = await prisma.notification.findMany({
      where: {
        user_id: parseInt(session.user.id),
        ...(unreadOnly ? { is_read: false } : {}),
      },
      orderBy: { created_at: "desc" },
      take: 50,
    });

    const unreadCount = await prisma.notification.count({
      where: { user_id: parseInt(session.user.id), is_read: false },
    });

    return NextResponse.json({ notifications, unread_count: unreadCount });
  } catch {
    return serverError();
  }
}

// PATCH /api/notifications – alle als gelesen markieren
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    await prisma.notification.updateMany({
      where: { user_id: parseInt(session.user.id), is_read: false },
      data: { is_read: true },
    });
    return NextResponse.json({ success: true });
  } catch {
    return serverError();
  }
}
