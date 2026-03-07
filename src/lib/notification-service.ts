/**
 * Benachrichtigungs-Service:
 * Erstellt In-App-Benachrichtigungen für betroffene User basierend auf user_locations.
 * - Admins erhalten Benachrichtigungen für ALLE Standorte
 * - Sales/Viewer nur für ihre zugeordneten Standorte (user_locations)
 */

import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";

interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

/**
 * Sendet eine Benachrichtigung an alle User, die dem Standort `locationId` zugeordnet sind.
 * Admins erhalten sie immer, unabhängig von user_locations.
 * `excludeUserId` überspringt den auslösenden User (der sieht den Bestätigungsdialog).
 */
export async function notifyLocationUsers(
  locationId: number,
  notification: NotificationInput,
  excludeUserId?: number
): Promise<void> {
  // Alle Admins
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true },
  });

  // Sales/Viewer mit Zuordnung zu diesem Standort
  const assignedUsers = await prisma.userLocation.findMany({
    where: { location_id: locationId },
    select: { user_id: true },
  });

  const userIds = new Set<number>([
    ...admins.map((a) => a.id),
    ...assignedUsers.map((u) => u.user_id),
  ]);

  if (excludeUserId) {
    userIds.delete(excludeUserId);
  }

  if (userIds.size === 0) return;

  await prisma.notification.createMany({
    data: Array.from(userIds).map((userId) => ({
      user_id: userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      link: notification.link ?? null,
    })),
  });
}

/**
 * Benachrichtigung nach einer Cascade-Operation.
 * Wird an alle User geschickt, die dem betroffenen Standort zugeordnet sind.
 */
export async function notifyCascade(options: {
  locationId: number;
  locationName: string;
  triggeredByUserName: string;
  triggeredByUserId: number;
  cascadedCount: number;
  targetSprintLabel: string;
  boardLink?: string;
}): Promise<void> {
  const { locationId, locationName, triggeredByUserName, triggeredByUserId, cascadedCount, targetSprintLabel, boardLink } = options;

  await notifyLocationUsers(
    locationId,
    {
      type: "cascade_triggered",
      title: `${cascadedCount} Aufgabe${cascadedCount !== 1 ? "n" : ""} verschoben`,
      message: `${cascadedCount} Aufgabe${cascadedCount !== 1 ? "n" : ""} wurde${cascadedCount !== 1 ? "n" : ""} in den ${targetSprintLabel} verschoben (Standort ${locationName}), ausgelöst durch ${triggeredByUserName}.`,
      link: boardLink,
    },
    triggeredByUserId
  );
}

/**
 * Benachrichtigung nach Sprint-Locking.
 */
export async function notifySprintLocked(options: {
  locationId: number;
  sprintLabel: string;
  newStatus: string;
  triggeredByUserId: number;
  triggeredByUserName: string;
}): Promise<void> {
  const { locationId, sprintLabel, newStatus, triggeredByUserId, triggeredByUserName } = options;

  const statusLabel = newStatus === "soft_locked" ? "soft-gesperrt" : "hard-gesperrt";

  await notifyLocationUsers(
    locationId,
    {
      type: "sprint_locked",
      title: `Sprint gesperrt: ${sprintLabel}`,
      message: `Der Sprint "${sprintLabel}" wurde von ${triggeredByUserName} ${statusLabel}.`,
    },
    triggeredByUserId
  );
}

/**
 * Benachrichtigung nach Änderung des AP-Budgets.
 */
export async function notifyCapacityChanged(options: {
  locationId: number;
  locationName: string;
  sprintLabel: string;
  oldValue: number;
  newValue: number;
  triggeredByUserId: number;
  triggeredByUserName: string;
}): Promise<void> {
  const { locationId, locationName, sprintLabel, oldValue, newValue, triggeredByUserId, triggeredByUserName } = options;

  await notifyLocationUsers(
    locationId,
    {
      type: "capacity_changed",
      title: `AP-Budget geändert: ${locationName}`,
      message: `Das AP-Budget für "${locationName}" im Sprint "${sprintLabel}" wurde von ${triggeredByUserName} von ${oldValue} auf ${newValue} geändert.`,
    },
    triggeredByUserId
  );
}

/**
 * Benachrichtigung nach Task-Import via API.
 */
export async function notifyTaskImported(options: {
  locationId: number;
  locationName: string;
  taskTitle: string;
  externalTicketId?: string;
  sprintLabel: string;
}): Promise<void> {
  const { locationId, locationName, taskTitle, externalTicketId, sprintLabel } = options;

  await notifyLocationUsers(locationId, {
    type: "task_imported",
    title: `Aufgabe importiert: ${locationName}`,
    message: `Aufgabe "${taskTitle}"${externalTicketId ? ` (${externalTicketId})` : ""} wurde automatisch dem Sprint "${sprintLabel}" (Standort ${locationName}) zugewiesen.`,
  });
}
