import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, badRequest, serverError, parseBody } from "@/lib/api-helpers";

// GET /api/users/me
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(session.user.id) },
      select: { id: true, name: true, email: true, role: true, locale: true },
    });
    return NextResponse.json(user);
  } catch {
    return serverError();
  }
}

// PATCH /api/users/me – eigenes Profil aktualisieren (Locale)
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const body = await parseBody<{ locale?: "de" | "en" }>(req);
  if (!body) return badRequest("Ungültiger Request-Body.");

  const updateData: Record<string, unknown> = {};
  if (body.locale && ["de", "en"].includes(body.locale)) {
    updateData.locale = body.locale;
  }

  try {
    const user = await prisma.user.update({
      where: { id: parseInt(session.user.id) },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, locale: true },
    });
    return NextResponse.json(user);
  } catch {
    return serverError();
  }
}
