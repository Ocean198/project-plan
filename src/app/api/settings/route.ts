import { NextResponse } from "next/server";
import { getSession, hasRole, unauthorized, forbidden, badRequest, serverError } from "@/lib/api-helpers";
import { getSetting, setSetting } from "@/lib/settings";

// GET /api/settings — returns all relevant app settings
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const sprint_mode = (await getSetting("sprint_mode")) ?? "monthly";
    return NextResponse.json({ sprint_mode });
  } catch {
    return serverError();
  }
}

// PATCH /api/settings — updates a setting (admin only)
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  try {
    const body = await req.json() as { key: string; value: string };
    if (!body.key || body.value === undefined) return badRequest("key und value sind erforderlich.");

    const ALLOWED_KEYS = ["sprint_mode"];
    if (!ALLOWED_KEYS.includes(body.key)) return badRequest("Unbekannter Einstellungsschlüssel.");

    if (body.key === "sprint_mode" && !["monthly", "weekly", "numbered"].includes(body.value)) {
      return badRequest("Ungültiger Wert für sprint_mode.");
    }

    await setSetting(body.key, body.value);
    return NextResponse.json({ [body.key]: body.value });
  } catch {
    return serverError();
  }
}
