import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSession, hasRole, unauthorized, forbidden, badRequest, serverError, parseBody,
} from "@/lib/api-helpers";
import { createCapacitiesForNewLocation } from "@/lib/sprint-manager";
import { logLocationCreated } from "@/lib/activity-logger";

// GET /api/locations
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const locations = await prisma.location.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(locations);
  } catch {
    return serverError();
  }
}

// POST /api/locations
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  const body = await parseBody<{
    name: string;
    color: string;
    default_action_points?: number;
  }>(req);

  if (!body) return badRequest("Ungültiger Request-Body.");
  if (!body.name?.trim()) return badRequest("Name ist erforderlich.");
  if (!body.color?.match(/^#[0-9A-Fa-f]{6}$/)) return badRequest("Farbe muss ein gültiger Hex-Code sein (z. B. #3B82F6).");

  try {
    const location = await prisma.location.create({
      data: {
        name: body.name.trim(),
        color: body.color,
        default_action_points: body.default_action_points ?? null,
      },
    });

    // Sprint-Kapazitäten für alle offenen Sprints anlegen
    await createCapacitiesForNewLocation(location.id);

    await logLocationCreated(parseInt(session.user.id), location.id, {
      name: location.name,
      color: location.color,
    });

    return NextResponse.json(location, { status: 201 });
  } catch {
    return serverError();
  }
}

// PATCH /api/locations – Update eines Standorts
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  const body = await parseBody<{
    id: number;
    name?: string;
    color?: string;
    default_action_points?: number | null;
    is_active?: boolean;
  }>(req);

  if (!body?.id) return badRequest("id ist erforderlich.");

  try {
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.color !== undefined) {
      if (!body.color.match(/^#[0-9A-Fa-f]{6}$/)) return badRequest("Ungültiger Hex-Code.");
      updateData.color = body.color;
    }
    if (body.default_action_points !== undefined) updateData.default_action_points = body.default_action_points;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    const location = await prisma.location.update({
      where: { id: body.id },
      data: updateData,
    });

    return NextResponse.json(location);
  } catch {
    return serverError();
  }
}
