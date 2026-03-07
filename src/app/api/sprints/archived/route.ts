import { NextResponse } from "next/server";
import { getSession, unauthorized, serverError } from "@/lib/api-helpers";
import { getArchivedSprints } from "@/lib/sprint-manager";

// GET /api/sprints/archived
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const sprints = await getArchivedSprints();
    return NextResponse.json(sprints);
  } catch {
    return serverError();
  }
}
