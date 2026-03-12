import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasRole, unauthorized, forbidden, badRequest, serverError, parseBody } from "@/lib/api-helpers";
import { DEFAULT_PERMISSIONS, invalidatePermissionsCache, type RolePermissions } from "@/lib/permissions";

// GET /api/settings/permissions
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "role_permissions" } });
    const permissions: RolePermissions = row
      ? { ...DEFAULT_PERMISSIONS, ...JSON.parse(row.value) }
      : { ...DEFAULT_PERMISSIONS };
    return NextResponse.json(permissions);
  } catch {
    return serverError();
  }
}

// PATCH /api/settings/permissions
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "admin")) return forbidden();

  const body = await parseBody<RolePermissions>(req);
  if (!body) return badRequest("Ungültiger Request-Body.");

  try {
    await prisma.appSetting.upsert({
      where: { key: "role_permissions" },
      create: { key: "role_permissions", value: JSON.stringify(body) },
      update: { value: JSON.stringify(body) },
    });
    invalidatePermissionsCache();
    return NextResponse.json({ success: true });
  } catch {
    return serverError();
  }
}
