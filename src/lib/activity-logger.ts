/**
 * Aktivitätslog-Service:
 * Schreibt bei jeder relevanten Aktion einen strukturierten Log-Eintrag.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { ActivityAction, ActivityTargetType } from "@prisma/client";

export interface LogEntryInput {
  userId?: number | null;
  action: ActivityAction;
  targetType: ActivityTargetType;
  targetId: number;
  details?: Record<string, unknown>;
}

export async function logActivity(input: LogEntryInput): Promise<void> {
  await prisma.activityLog.create({
    data: {
      user_id: input.userId ?? null,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      details: input.details ? (input.details as Prisma.InputJsonValue) : undefined,
    },
  });
}

// ─── Typisierte Convenience-Funktionen ────────────────────────────────────────

export async function logTaskCreated(
  userId: number,
  taskId: number,
  details: { title: string; sprint_id: number; location_id: number; action_points: number }
) {
  await logActivity({ userId, action: "task_created", targetType: "task", targetId: taskId, details });
}

export async function logTaskMoved(
  userId: number,
  taskId: number,
  details: { from_sprint_id: number; to_sprint_id: number; from_sprint_label: string; to_sprint_label: string }
) {
  await logActivity({ userId, action: "task_moved", targetType: "task", targetId: taskId, details });
}

export async function logTaskCompleted(
  userId: number,
  taskId: number,
  details: { title: string; sprint_id: number }
) {
  await logActivity({ userId, action: "task_completed", targetType: "task", targetId: taskId, details });
}

export async function logTaskPriorityChanged(
  userId: number,
  taskId: number,
  details: { old_priority: number; new_priority: number }
) {
  await logActivity({ userId, action: "task_priority_changed", targetType: "task", targetId: taskId, details });
}

export async function logTaskLocationChanged(
  userId: number,
  taskId: number,
  details: { old_location_id: number; new_location_id: number; old_location_name: string; new_location_name: string }
) {
  await logActivity({ userId, action: "task_location_changed", targetType: "task", targetId: taskId, details });
}

export async function logTaskStatusChanged(
  userId: number,
  taskId: number,
  details: { old_status: string; new_status: string }
) {
  await logActivity({ userId, action: "task_status_changed", targetType: "task", targetId: taskId, details });
}

export async function logTaskCommented(
  userId: number,
  taskId: number,
  details: { comment: string }
) {
  await logActivity({ userId, action: "task_commented", targetType: "task", targetId: taskId, details });
}

export async function logCascadeTriggered(
  userId: number,
  taskId: number,
  details: {
    triggered_by_task_id: number;
    cascaded_tasks: Array<{ id: number; from_sprint_id: number; to_sprint_id: number }>;
  }
) {
  await logActivity({ userId, action: "cascade_triggered", targetType: "task", targetId: taskId, details });
}

export async function logSprintLocked(
  userId: number,
  sprintId: number,
  details: { old_status: string; new_status: string; label: string }
) {
  await logActivity({ userId, action: "sprint_locked", targetType: "sprint", targetId: sprintId, details });
}

export async function logSprintUnlocked(
  userId: number,
  sprintId: number,
  details: { old_status: string; new_status: string; label: string }
) {
  await logActivity({ userId, action: "sprint_unlocked", targetType: "sprint", targetId: sprintId, details });
}

export async function logSprintCreated(
  sprintId: number,
  details: { label: string; year: number; month: number }
) {
  await logActivity({ userId: null, action: "sprint_created", targetType: "sprint", targetId: sprintId, details });
}

export async function logCapacityChanged(
  userId: number,
  sprintCapacityId: number,
  details: { sprint_id: number; location_id: number; old_value: number; new_value: number }
) {
  await logActivity({ userId, action: "capacity_changed", targetType: "sprint_capacity", targetId: sprintCapacityId, details });
}

export async function logTaskImported(
  taskId: number,
  details: { title: string; external_ticket_id: string; sprint_id: number; location_id: number }
) {
  await logActivity({ userId: null, action: "task_imported", targetType: "task", targetId: taskId, details });
}

export async function logLocationCreated(
  userId: number,
  locationId: number,
  details: { name: string; color: string }
) {
  await logActivity({ userId, action: "location_created", targetType: "location", targetId: locationId, details });
}

export async function logUserCreated(
  userId: number,
  newUserId: number,
  details: { name: string; role: string }
) {
  await logActivity({ userId, action: "user_created", targetType: "user", targetId: newUserId, details });
}
