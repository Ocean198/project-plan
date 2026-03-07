/**
 * Sprint-Verwaltung:
 * - Mindestens 3 zukünftige Sprints sicherstellen
 * - Sprint anlegen (inkl. Kapazitäten für alle aktiven Standorte)
 * - Sprint-Locking (open → soft_locked → hard_locked und zurück)
 * - Beim Anlegen eines neuen Standorts: Kapazitäten für alle offenen Sprints
 */

import { prisma } from "@/lib/prisma";
import type { Sprint, SprintLockStatus } from "@prisma/client";
import { getSprintMode } from "@/lib/settings";

const MINIMUM_FUTURE_SPRINTS = 3;

// ─── Label-Helfer ─────────────────────────────────────────────────────────────

function getMonthlyLabel(year: number, month: number, locale = "de-DE"): string {
  return new Date(year, month - 1, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
}

// ─── Monats-Helfer ────────────────────────────────────────────────────────────

function nextMonth(year: number, month: number): { year: number; month: number } {
  const d = new Date(year, month); // month ist 1-basiert; new Date(y, m) = 1. des Folgemonats
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// ─── ISO-Wochen-Helfer ────────────────────────────────────────────────────────

function isoWeekInfo(date: Date): { year: number; week: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return { year: d.getFullYear(), week };
}

function getCurrentISOWeekInfo(): { year: number; week: number } {
  return isoWeekInfo(new Date());
}

/** Anzahl ISO-Wochen im gegebenen Jahr (52 oder 53). */
function maxISOWeek(year: number): number {
  return isoWeekInfo(new Date(year, 11, 28)).week; // 28. Dez liegt immer in der letzten Woche
}

export function nextISOWeek(year: number, week: number): { year: number; week: number } {
  if (week < maxISOWeek(year)) return { year, week: week + 1 };
  return { year: year + 1, week: 1 };
}

function prevISOWeek(year: number, week: number): { year: number; week: number } {
  if (week > 1) return { year, week: week - 1 };
  return { year: year - 1, week: maxISOWeek(year - 1) };
}

/**
 * Gibt ISO-Jahr und -Woche des ersten Montags im angegebenen Monat zurück.
 * Beispiel: März 2026 beginnt mit Sonntag → erster Montag = 2. März = KW 10.
 */
function firstMondayISOWeek(year: number, month: number): { year: number; week: number } {
  const d = new Date(year, month - 1, 1); // 1. des Monats
  const day = d.getDay(); // 0=So, 1=Mo, ..., 6=Sa
  if (day !== 1) d.setDate(d.getDate() + ((8 - day) % 7)); // vorwärts zum nächsten Montag
  return isoWeekInfo(d);
}

/** Gibt den Montag der angegebenen ISO-Woche zurück. */
export function isoWeekToDate(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  return monday;
}

// ─── Sprint anlegen ───────────────────────────────────────────────────────────

/**
 * Legt einen Sprint an:
 * - week = 0 → monatlicher/nummerierter Sprint (month = Kalendermonat 1–12)
 * - week > 0 → wöchentlicher Sprint (month muss 0 sein, week = ISO-Wochennummer)
 */
export async function createSprint(year: number, month: number, week = 0): Promise<Sprint> {
  let label: string;

  if (week > 0) {
    label = `KW ${week} ${year}`;
  } else {
    const mode = await getSprintMode();
    if (mode === "numbered") {
      const count = await prisma.sprint.count({ where: { label: { startsWith: "Sprint " } } });
      label = `Sprint ${count + 1}`;
    } else {
      label = getMonthlyLabel(year, month);
    }
  }

  const sprint = await prisma.sprint.upsert({
    where: { year_month_week: { year, month, week } },
    update: {},
    create: { year, month, week, label },
  });

  // Kapazitäten für alle aktiven Standorte sicherstellen
  const activeLocations = await prisma.location.findMany({ where: { is_active: true } });

  for (const location of activeLocations) {
    const defaultAP = location.default_action_points ?? parseInt(process.env.DEFAULT_AP_BUDGET ?? "50");
    await prisma.sprintCapacity.upsert({
      where: {
        sprint_id_location_id: { sprint_id: sprint.id, location_id: location.id },
      },
      update: {},
      create: {
        sprint_id: sprint.id,
        location_id: location.id,
        max_action_points: defaultAP,
      },
    });
  }

  return sprint;
}

/**
 * Legt den nächsten Sprint basierend auf aktuellem Modus an.
 * Für wöchentlich: immer nach dem letzten wöchentlichen Sprint.
 * Für monatlich: nach dem späteren Ende von letztem Monats- oder letztem Wochen-Sprint.
 */
export async function createNextSprint(): Promise<Sprint> {
  const mode = await getSprintMode();

  if (mode === "weekly") {
    const lastWeekly = await prisma.sprint.findFirst({
      where: { week: { gt: 0 } },
      orderBy: { id: "desc" },
    });

    if (lastWeekly) {
      // Wöchentliche Sequenz fortführen
      const next = nextISOWeek(lastWeekly.year, lastWeekly.week);
      return createSprint(next.year, 0, next.week);
    } else {
      // Noch keine wöchentlichen Sprints — erster Montag im Monat nach dem letzten Monats-Sprint
      const lastMonthly = await prisma.sprint.findFirst({
        where: { week: 0 },
        orderBy: { id: "desc" },
      });
      if (lastMonthly) {
        const nm = nextMonth(lastMonthly.year, lastMonthly.month);
        const { year: wy, week: ww } = firstMondayISOWeek(nm.year, nm.month);
        return createSprint(wy, 0, ww);
      } else {
        const { year, week } = getCurrentISOWeekInfo();
        return createSprint(year, 0, week);
      }
    }
  } else {
    // monthly oder numbered
    const lastMonthly = await prisma.sprint.findFirst({
      where: { week: 0 },
      orderBy: { id: "desc" },
    });
    const lastWeekly = await prisma.sprint.findFirst({
      where: { week: { gt: 0 } },
      orderBy: { id: "desc" },
    });

    // Ausgangspunkt: Monat nach dem letzten wöchentlichen Sprint — falls der nach dem letzten monatlichen liegt
    if (lastWeekly) {
      const weekDate = isoWeekToDate(lastWeekly.year, lastWeekly.week);
      const candidateYear = weekDate.getFullYear();
      const candidateMonth = weekDate.getMonth() + 2; // Monat der Woche + 1
      const nextAfterWeekly = new Date(candidateYear, candidateMonth - 1, 1);
      const nYear = nextAfterWeekly.getFullYear();
      const nMonth = nextAfterWeekly.getMonth() + 1;

      const weeklyIsLater =
        !lastMonthly ||
        nYear > lastMonthly.year ||
        (nYear === lastMonthly.year && nMonth > lastMonthly.month);

      if (weeklyIsLater) {
        return createSprint(nYear, nMonth);
      }
    }

    if (lastMonthly) {
      const next = nextMonth(lastMonthly.year, lastMonthly.month);
      return createSprint(next.year, next.month);
    }

    const now = new Date();
    return createSprint(now.getFullYear(), now.getMonth() + 1);
  }
}

// ─── Mindest-Sprint-Sicherstellung ────────────────────────────────────────────

/**
 * Stellt sicher, dass ab der aktuellen Periode mindestens MINIMUM_FUTURE_SPRINTS
 * offene Sprints des aktuellen Modus existieren. Erstellt fehlende Sprints automatisch.
 */
export async function ensureMinimumFutureSprints(): Promise<void> {
  const mode = await getSprintMode();

  // Wöchentliche Sprints werden manuell angelegt — kein Auto-Auffüllen
  if (mode === "weekly") return;

  {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const futureSprints = await prisma.sprint.findMany({
      where: {
        week: 0,
        OR: [
          { year: { gt: currentYear } },
          { year: currentYear, month: { gte: currentMonth } },
        ],
        lock_status: "open",
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });

    let missing = MINIMUM_FUTURE_SPRINTS - futureSprints.length;
    if (missing <= 0) return;

    let { year, month } =
      futureSprints.length > 0
        ? { year: futureSprints.at(-1)!.year, month: futureSprints.at(-1)!.month }
        : { year: currentYear, month: currentMonth - 1 };

    while (missing > 0) {
      ({ year, month } = nextMonth(year, month));
      await createSprint(year, month);
      missing--;
    }
  }
}

// ─── Sprint-Locking ────────────────────────────────────────────────────────────

const LOCK_ORDER: SprintLockStatus[] = ["open", "soft_locked", "hard_locked"];

/**
 * Setzt den Lock-Status eines Sprints.
 * Erlaubte Übergänge: open → soft_locked → hard_locked und jeweils zurück.
 * Wirft einen Fehler bei ungültigem Übergang.
 */
export async function setSprintLockStatus(
  sprintId: number,
  newStatus: SprintLockStatus
): Promise<Sprint> {
  const sprint = await prisma.sprint.findUniqueOrThrow({ where: { id: sprintId } });

  const currentIndex = LOCK_ORDER.indexOf(sprint.lock_status);
  const newIndex = LOCK_ORDER.indexOf(newStatus);

  if (Math.abs(currentIndex - newIndex) !== 1) {
    throw new Error(
      `Ungültiger Lock-Übergang: ${sprint.lock_status} → ${newStatus}. ` +
        `Erlaubt: jeweils einen Schritt vor oder zurück.`
    );
  }

  return prisma.sprint.update({
    where: { id: sprintId },
    data: { lock_status: newStatus },
  });
}

// ─── Standort hinzugefügt ─────────────────────────────────────────────────────

/**
 * Wenn ein neuer Standort angelegt wird: Für alle existierenden offenen Sprints
 * werden automatisch sprint_capacities-Einträge erstellt.
 */
export async function createCapacitiesForNewLocation(locationId: number): Promise<void> {
  const location = await prisma.location.findUniqueOrThrow({ where: { id: locationId } });
  const defaultAP = location.default_action_points ?? parseInt(process.env.DEFAULT_AP_BUDGET ?? "50");

  const openSprints = await prisma.sprint.findMany({
    where: { lock_status: "open" },
  });

  for (const sprint of openSprints) {
    await prisma.sprintCapacity.upsert({
      where: {
        sprint_id_location_id: { sprint_id: sprint.id, location_id: locationId },
      },
      update: {},
      create: {
        sprint_id: sprint.id,
        location_id: locationId,
        max_action_points: defaultAP,
      },
    });
  }
}

// ─── Sprint-Liste mit AP-Auslastung ────────────────────────────────────────────

export interface SprintWithCapacity {
  id: number;
  year: number;
  month: number;
  week: number;
  label: string;
  lock_status: SprintLockStatus;
  task_count: number;
  capacities: Array<{
    location_id: number;
    location_name: string;
    location_color: string;
    max_action_points: number;
    used_action_points: number;
  }>;
}

function mapSprintWithCapacity(
  sprint: {
    id: number;
    year: number;
    month: number;
    week: number;
    label: string;
    lock_status: SprintLockStatus;
    tasks: Array<{ location_id: number; action_points: number }>;
    capacities: Array<{
      location_id: number;
      max_action_points: number;
      location: { name: string; color: string };
    }>;
  }
): SprintWithCapacity {
  const usedByLocation = new Map<number, number>();
  for (const task of sprint.tasks) {
    usedByLocation.set(
      task.location_id,
      (usedByLocation.get(task.location_id) ?? 0) + task.action_points
    );
  }
  return {
    id: sprint.id,
    year: sprint.year,
    month: sprint.month,
    week: sprint.week,
    label: sprint.label,
    lock_status: sprint.lock_status,
    task_count: sprint.tasks.length,
    capacities: sprint.capacities.map((cap) => ({
      location_id: cap.location_id,
      location_name: cap.location.name,
      location_color: cap.location.color,
      max_action_points: cap.max_action_points,
      used_action_points: usedByLocation.get(cap.location_id) ?? 0,
    })),
  };
}

/** Gibt alle nicht-archivierten Sprints mit berechneter AP-Auslastung zurück. */
export async function getSprintsWithCapacity(): Promise<SprintWithCapacity[]> {
  const sprints = await prisma.sprint.findMany({
    where: { is_archived: false },
    include: {
      capacities: { include: { location: true } },
      tasks: { select: { location_id: true, action_points: true } },
    },
    orderBy: { id: "asc" },
  });

  return sprints.map(mapSprintWithCapacity);
}

/** Gibt alle archivierten Sprints zurück, neueste zuerst. */
export async function getArchivedSprints(): Promise<SprintWithCapacity[]> {
  const sprints = await prisma.sprint.findMany({
    where: { is_archived: true },
    include: {
      capacities: { include: { location: true } },
      tasks: { select: { location_id: true, action_points: true } },
    },
    orderBy: { id: "desc" },
  });

  return sprints.map(mapSprintWithCapacity);
}
