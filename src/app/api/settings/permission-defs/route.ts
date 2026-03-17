import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PERMISSION_DEFS, DEFAULT_PERMISSIONS } from "@/lib/permissions";
import { getSession, unauthorized, serverError } from "@/lib/api-helpers";

// GET /api/settings/permission-defs
// Available to all authenticated users (used by handbuch.html)
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "role_permissions" } });
    const permissions = row
      ? { ...DEFAULT_PERMISSIONS, ...JSON.parse(row.value) }
      : { ...DEFAULT_PERMISSIONS };

    const defs = Object.entries(PERMISSION_DEFS).map(([key, def]) => ({
      key,
      label: def.label,
      group: def.group,
    }));

    return NextResponse.json({ defs, permissions });
  } catch {
    return serverError();
  }
}
