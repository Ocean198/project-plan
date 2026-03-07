import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSession, hasRole, unauthorized, forbidden, badRequest, serverError, parseBody,
} from "@/lib/api-helpers";
import { logUserCreated } from "@/lib/activity-logger";
import bcrypt from "bcryptjs";
import type { UserRole, UserLocale } from "@prisma/client";

// GET /api/users
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        locale: true,
        created_at: true,
        user_locations: {
          include: { location: { select: { id: true, name: true, color: true } } },
        },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(users);
  } catch {
    return serverError();
  }
}

// PATCH /api/users – User aktualisieren
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  const body = await parseBody<{
    id: number;
    name?: string;
    email?: string;
    password?: string;
    role?: UserRole;
    locale?: UserLocale;
    location_ids?: number[];
  }>(req);

  if (!body?.id) return badRequest("id ist erforderlich.");

  try {
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.email !== undefined) updateData.email = body.email.trim().toLowerCase();
    if (body.role !== undefined) {
      const validRoles: UserRole[] = ["viewer", "sales", "admin"];
      if (!validRoles.includes(body.role)) return badRequest("Ungültige Rolle.");
      updateData.role = body.role;
    }
    if (body.locale !== undefined) updateData.locale = body.locale;
    if (body.password !== undefined) {
      if (body.password.length < 8) return badRequest("Passwort muss mindestens 8 Zeichen haben.");
      updateData.password = await bcrypt.hash(body.password, 12);
    }

    await prisma.user.update({ where: { id: body.id }, data: updateData });

    // Standort-Zuordnungen ersetzen
    if (body.location_ids !== undefined) {
      await prisma.userLocation.deleteMany({ where: { user_id: body.id } });
      if (body.location_ids.length > 0) {
        await prisma.userLocation.createMany({
          data: body.location_ids.map((locationId) => ({
            user_id: body.id,
            location_id: locationId,
          })),
          skipDuplicates: true,
        });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: body.id },
      select: { id: true, name: true, email: true, role: true, locale: true, created_at: true },
    });
    return NextResponse.json(user);
  } catch {
    return serverError();
  }
}

// POST /api/users
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  const body = await parseBody<{
    name: string;
    email: string;
    password: string;
    role: UserRole;
    locale?: UserLocale;
    location_ids?: number[];
  }>(req);

  if (!body) return badRequest("Ungültiger Request-Body.");
  if (!body.name?.trim()) return badRequest("Name ist erforderlich.");
  if (!body.email?.trim()) return badRequest("E-Mail ist erforderlich.");
  if (!body.password || body.password.length < 8) return badRequest("Passwort muss mindestens 8 Zeichen haben.");

  const validRoles: UserRole[] = ["viewer", "sales", "admin"];
  if (!validRoles.includes(body.role)) return badRequest(`Ungültige Rolle. Erlaubt: ${validRoles.join(", ")}`);

  try {
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return NextResponse.json({ error: "E-Mail bereits vergeben." }, { status: 409 });

    const hashedPassword = await bcrypt.hash(body.password, 12);

    const user = await prisma.user.create({
      data: {
        name: body.name.trim(),
        email: body.email.trim().toLowerCase(),
        password: hashedPassword,
        role: body.role,
        locale: body.locale ?? "de",
      },
    });

    // Standort-Zuordnungen
    if (body.location_ids?.length) {
      await prisma.userLocation.createMany({
        data: body.location_ids.map((locationId) => ({
          user_id: user.id,
          location_id: locationId,
        })),
        skipDuplicates: true,
      });
    }

    await logUserCreated(parseInt(session.user.id), user.id, {
      name: user.name,
      role: user.role,
    });

    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json(userWithoutPassword, { status: 201 });
  } catch {
    return serverError();
  }
}
