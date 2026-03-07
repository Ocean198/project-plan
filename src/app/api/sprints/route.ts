import { NextResponse } from "next/server";
import { getSession, hasRole, unauthorized, forbidden, serverError } from "@/lib/api-helpers";
import { getSprintsWithCapacity, ensureMinimumFutureSprints, createNextSprint } from "@/lib/sprint-manager";

// GET /api/sprints
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    await ensureMinimumFutureSprints();
    const sprints = await getSprintsWithCapacity();
    return NextResponse.json(sprints);
  } catch {
    return serverError();
  }
}

// POST /api/sprints — legt den nächsten Sprint nach dem letzten vorhandenen an
export async function POST() {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  try {
    const sprint = await createNextSprint();
    return NextResponse.json(sprint, { status: 201 });
  } catch (err) {
    if (err instanceof Error) return NextResponse.json({ error: err.message }, { status: 400 });
    return serverError();
  }
}
