import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, forbidden, notFound, serverError } from "@/lib/api-helpers";

// PATCH /api/notifications/[id] – einzelne als gelesen markieren
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await params;
  const notificationId = parseInt(id);

  try {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) return notFound("Benachrichtigung nicht gefunden.");
    if (notification.user_id !== parseInt(session.user.id)) return forbidden();

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { is_read: true },
    });

    return NextResponse.json(updated);
  } catch {
    return serverError();
  }
}
