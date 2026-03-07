import { NextResponse } from "next/server";
import {
  getSession, hasRole, unauthorized, forbidden, badRequest, serverError, parseBody,
} from "@/lib/api-helpers";
import { previewCascade } from "@/lib/capacity";

// POST /api/tasks/move/preview
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasRole(session, "sales", "admin")) return forbidden();

  const body = await parseBody<{ task_id: number; target_sprint_id: number }>(req);
  if (!body?.task_id || !body?.target_sprint_id) {
    return badRequest("task_id und target_sprint_id sind erforderlich.");
  }

  try {
    const result = await previewCascade(body.task_id, body.target_sprint_id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
