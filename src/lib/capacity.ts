/**
 * AP-Kapazitätslogik:
 * - AP-Verbrauch pro Sprint/Standort berechnen
 * - Overflow: Aufgabe in frühesten offenen Sprint mit Kapazität einordnen
 * - Cascade: Wenn Aufgabe vorgezogen wird und Sprint voll wird,
 *   wird die Aufgabe mit niedrigster Priorität (höchste Prioritätszahl) verschoben
 * - Dry-Run: Cascade simulieren ohne DB-Änderungen
 */

import { prisma } from "@/lib/prisma";
import { ensureMinimumFutureSprints, createSprint } from "@/lib/sprint-manager";
import type { Sprint } from "@prisma/client";

// ─── AP-Verbrauch ────────────────────────────────────────────────────────────

/** Gibt die Summe aller AP einer Standort/Sprint-Kombination zurück.
 *  Abgeschlossene Aufgaben zählen mit (belegen ihren Platz dauerhaft). */
export async function getUsedAP(
  sprintId: number,
  locationId: number
): Promise<number> {
  const result = await prisma.task.aggregate({
    where: { sprint_id: sprintId, location_id: locationId },
    _sum: { action_points: true },
  });
  return result._sum.action_points ?? 0;
}

/** Gibt das konfigurierte AP-Budget einer Standort/Sprint-Kombination zurück. */
export async function getMaxAP(
  sprintId: number,
  locationId: number
): Promise<number> {
  const capacity = await prisma.sprintCapacity.findUnique({
    where: { sprint_id_location_id: { sprint_id: sprintId, location_id: locationId } },
  });
  return capacity?.max_action_points ?? parseInt(process.env.DEFAULT_AP_BUDGET ?? "50");
}

/** Gibt den freien AP-Puffer zurück (kann negativ sein bei Überbuchung). */
export async function getRemainingAP(
  sprintId: number,
  locationId: number
): Promise<number> {
  const [used, max] = await Promise.all([
    getUsedAP(sprintId, locationId),
    getMaxAP(sprintId, locationId),
  ]);
  return max - used;
}

// ─── Overflow: frühester offener Sprint mit Kapazität ─────────────────────────

/**
 * Findet den frühesten offenen Sprint ab `fromSprintId` (inkl.),
 * der genug AP-Puffer für `neededAP` beim Standort `locationId` hat.
 * Erstellt neue Sprints, falls keiner passt.
 */
export async function findEarliestSprintWithCapacity(
  locationId: number,
  neededAP: number,
  fromSprintId: number
): Promise<Sprint> {
  // Sicherstellen, dass genug zukünftige Sprints existieren
  await ensureMinimumFutureSprints();

  const openSprints = await prisma.sprint.findMany({
    where: {
      id: { gte: fromSprintId },
      lock_status: "open",
    },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  for (const sprint of openSprints) {
    const remaining = await getRemainingAP(sprint.id, locationId);
    if (remaining >= neededAP) {
      return sprint;
    }
  }

  // Kein passender Sprint vorhanden → neuen Sprint erzeugen
  const lastSprint = openSprints.at(-1);
  let year: number;
  let month: number;

  if (lastSprint) {
    const nextDate = new Date(lastSprint.year, lastSprint.month); // month ist 1-basiert, +0 = nächster Monat
    year = nextDate.getFullYear();
    month = nextDate.getMonth() + 1;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const newSprint = await createSprint(year, month);
  return newSprint;
}

// ─── Cascade Dry-Run ──────────────────────────────────────────────────────────

export interface CascadeTask {
  id: number;
  title: string;
  external_ticket_id: string | null;
  action_points: number;
  current_sprint_id: number;
  current_sprint_label: string;
  target_sprint_id: number;
  target_sprint_label: string;
}

export interface CascadePreviewResult {
  fits_without_cascade: boolean;
  affected_tasks: CascadeTask[];
  sprints_affected: number;
  new_sprints_created: number;
}

/**
 * Simuliert das Verschieben von `taskId` in `targetSprintId`.
 * Gibt zurück, welche Aufgaben durch Cascade verschoben werden würden.
 * Führt KEINE Datenbankänderungen durch.
 */
export async function previewCascade(
  taskId: number,
  targetSprintId: number
): Promise<CascadePreviewResult> {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { sprint: true },
  });

  const targetSprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: targetSprintId },
  });

  // In-Memory-Simulation der AP-Verbrauch pro Sprint/Standort
  // key: `${sprintId}:${locationId}`, value: verwendete AP
  const usedAPOverride = new Map<string, number>();

  const getUsedAPSim = async (sprintId: number, locationId: number): Promise<number> => {
    const key = `${sprintId}:${locationId}`;
    if (usedAPOverride.has(key)) return usedAPOverride.get(key)!;
    const used = await getUsedAP(sprintId, locationId);
    usedAPOverride.set(key, used);
    return used;
  };

  const addAPSim = (sprintId: number, locationId: number, ap: number) => {
    const key = `${sprintId}:${locationId}`;
    const current = usedAPOverride.get(key) ?? 0;
    usedAPOverride.set(key, current + ap);
  };

  const removeAPSim = (sprintId: number, locationId: number, ap: number) => {
    const key = `${sprintId}:${locationId}`;
    const current = usedAPOverride.get(key) ?? 0;
    usedAPOverride.set(key, current - ap);
  };

  // Vorher: AP des zu verschiebenden Tasks aus aktuellem Sprint entfernen
  await getUsedAPSim(task.sprint_id, task.location_id); // Initialisierung
  removeAPSim(task.sprint_id, task.location_id, task.action_points);

  // Prüfe, ob der Task in den Ziel-Sprint passt
  const maxAP = await getMaxAP(targetSprintId, task.location_id);
  const currentUsed = await getUsedAPSim(targetSprintId, task.location_id);
  const fits = currentUsed + task.action_points <= maxAP;

  if (fits) {
    return {
      fits_without_cascade: true,
      affected_tasks: [],
      sprints_affected: 0,
      new_sprints_created: 0,
    };
  }

  // Cascade nötig: Task in Ziel-Sprint hinzufügen, niedrigst-priorisierte verdrängen
  addAPSim(targetSprintId, task.location_id, task.action_points);

  const affectedTasks: CascadeTask[] = [];
  const sprintsAffected = new Set<number>();

  // Alle offenen Sprints ab Ziel-Sprint holen
  await ensureMinimumFutureSprints();
  const openSprints = await prisma.sprint.findMany({
    where: { lock_status: "open", id: { gte: targetSprintId } },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  // Simulation: Für jeden Sprint prüfen ob er überläuft
  for (let i = 0; i < openSprints.length; i++) {
    const sprint = openSprints[i];
    const used = await getUsedAPSim(sprint.id, task.location_id);
    const max = await getMaxAP(sprint.id, task.location_id);

    if (used <= max) continue;

    // Sprint überläuft → niedrigst-priorisierte nicht-abgeschlossene Task verdrängen
    const overflow = used - max;
    const tasksInSprint = await prisma.task.findMany({
      where: {
        sprint_id: sprint.id,
        location_id: task.location_id,
        status: { not: "completed" },
        id: { not: taskId }, // Den zu verschiebenden Task nicht verdrängen
      },
      orderBy: { priority: "desc" }, // höchste Zahl = niedrigste Priorität zuerst
      include: { sprint: true },
    });

    let remainingOverflow = overflow;
    for (const t of tasksInSprint) {
      if (remainingOverflow <= 0) break;

      // Bestimme Ziel-Sprint für diesen Task
      const nextSprintIndex = i + 1;
      let nextSprint: Sprint;

      if (nextSprintIndex < openSprints.length) {
        nextSprint = openSprints[nextSprintIndex];
      } else {
        // Würde neuen Sprint benötigen – für Dry-Run virtuellen Sprint erzeugen
        const lastSprint = openSprints.at(-1)!;
        const nextDate = new Date(lastSprint.year, lastSprint.month);
        nextSprint = {
          id: -1 * (nextSprintIndex + 1), // virtuelle ID
          year: nextDate.getFullYear(),
          month: nextDate.getMonth() + 1,
          week: 0,
          label: nextDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" }),
          lock_status: "open",
          is_archived: false,
          created_at: new Date(),
          updated_at: new Date(),
        };
      }

      sprintsAffected.add(sprint.id);
      affectedTasks.push({
        id: t.id,
        title: t.title,
        external_ticket_id: t.external_ticket_id,
        action_points: t.action_points,
        current_sprint_id: sprint.id,
        current_sprint_label: sprint.label,
        target_sprint_id: nextSprint.id,
        target_sprint_label: nextSprint.label,
      });

      removeAPSim(sprint.id, task.location_id, t.action_points);
      addAPSim(nextSprint.id, task.location_id, t.action_points);
      remainingOverflow -= t.action_points;
    }
  }

  const newSprintsCreated = affectedTasks.filter((t) => t.target_sprint_id < 0).length > 0 ? 1 : 0;

  return {
    fits_without_cascade: false,
    affected_tasks: affectedTasks,
    sprints_affected: sprintsAffected.size,
    new_sprints_created: newSprintsCreated,
  };
}

// ─── Cascade-Ausführung ───────────────────────────────────────────────────────

export interface CascadeResult {
  moved_task: { id: number; sprint_id: number };
  cascaded_tasks: Array<{ id: number; from_sprint_id: number; to_sprint_id: number }>;
  new_sprints_created: number;
}

/**
 * Verschiebt `taskId` in `targetSprintId` und führt Cascade in einer Transaktion aus.
 * Abgeschlossene Aufgaben werden NIEMALS verschoben.
 */
export async function executeCascade(
  taskId: number,
  targetSprintId: number
): Promise<CascadeResult> {
  await ensureMinimumFutureSprints();

  return await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUniqueOrThrow({
      where: { id: taskId },
    });

    if (task.status === "completed") {
      throw new Error("Abgeschlossene Aufgaben können nicht verschoben werden.");
    }

    const targetSprint = await tx.sprint.findUniqueOrThrow({
      where: { id: targetSprintId },
    });

    if (targetSprint.lock_status !== "open") {
      throw new Error("Ziel-Sprint ist gesperrt.");
    }

    // AP aus altem Sprint entfernen (in-memory für Transaktion)
    const usedMap = new Map<string, number>();
    // Tracks next prepend-priority per sprint/location (evicted tasks go to top)
    const prependPriorityMap = new Map<string, number>();

    const consumePrependPriority = async (sprintId: number, locationId: number): Promise<number> => {
      const key = `${sprintId}:${locationId}`;
      if (!prependPriorityMap.has(key)) {
        const result = await tx.task.aggregate({
          where: { sprint_id: sprintId, location_id: locationId },
          _min: { priority: true },
        });
        prependPriorityMap.set(key, (result._min.priority ?? 1) - 1);
      }
      const val = prependPriorityMap.get(key)!;
      prependPriorityMap.set(key, val - 1);
      return val;
    };

    const getUsed = async (sprintId: number, locationId: number): Promise<number> => {
      const key = `${sprintId}:${locationId}`;
      if (usedMap.has(key)) return usedMap.get(key)!;
      const result = await tx.task.aggregate({
        where: { sprint_id: sprintId, location_id: locationId },
        _sum: { action_points: true },
      });
      const val = result._sum.action_points ?? 0;
      usedMap.set(key, val);
      return val;
    };

    const modifyUsed = (sprintId: number, locationId: number, delta: number) => {
      const key = `${sprintId}:${locationId}`;
      usedMap.set(key, (usedMap.get(key) ?? 0) + delta);
    };

    const getMax = async (sprintId: number, locationId: number): Promise<number> => {
      const capacity = await tx.sprintCapacity.findUnique({
        where: { sprint_id_location_id: { sprint_id: sprintId, location_id: locationId } },
      });
      return capacity?.max_action_points ?? parseInt(process.env.DEFAULT_AP_BUDGET ?? "50");
    };

    // Task in Ziel-Sprint verschieben
    await tx.task.update({
      where: { id: taskId },
      data: { sprint_id: targetSprintId },
    });

    await getUsed(task.sprint_id, task.location_id); // Initialisierung vor Modifikation
    modifyUsed(task.sprint_id, task.location_id, -task.action_points);
    await getUsed(targetSprintId, task.location_id);
    modifyUsed(targetSprintId, task.location_id, task.action_points);

    const cascadedTasks: Array<{ id: number; from_sprint_id: number; to_sprint_id: number }> = [];
    let newSprintsCreated = 0;

    // Alle offenen Sprints ab Ziel-Sprint (aufsteigend)
    const openSprints = await tx.sprint.findMany({
      where: { lock_status: "open", id: { gte: targetSprintId } },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });

    for (let i = 0; i < openSprints.length; i++) {
      const sprint = openSprints[i];
      const used = await getUsed(sprint.id, task.location_id);
      const max = await getMax(sprint.id, task.location_id);

      if (used <= max) continue;

      // Niedrigst-priorisierte nicht-abgeschlossene Tasks verdrängen
      const tasksToEvict = await tx.task.findMany({
        where: {
          sprint_id: sprint.id,
          location_id: task.location_id,
          status: { not: "completed" },
          id: { not: taskId },
        },
        orderBy: { priority: "desc" },
      });

      let remainingOverflow = used - max;

      for (const t of tasksToEvict) {
        if (remainingOverflow <= 0) break;

        // Nächsten Sprint finden oder erzeugen
        let nextSprint: Sprint;
        if (i + 1 < openSprints.length) {
          nextSprint = openSprints[i + 1];
        } else {
          // Neuen Sprint erzeugen
          const lastSprint = openSprints.at(-1)!;
          const nextDate = new Date(lastSprint.year, lastSprint.month);
          const newYear = nextDate.getFullYear();
          const newMonth = nextDate.getMonth() + 1;

          // Sprint in Transaktion anlegen
          const label = new Date(newYear, newMonth - 1, 1).toLocaleDateString("de-DE", {
            month: "long",
            year: "numeric",
          });
          nextSprint = await tx.sprint.create({
            data: { year: newYear, month: newMonth, label },
          });

          // Kapazitäten für alle aktiven Standorte anlegen
          const activeLocations = await tx.location.findMany({ where: { is_active: true } });
          for (const loc of activeLocations) {
            const defaultAP = loc.default_action_points ?? parseInt(process.env.DEFAULT_AP_BUDGET ?? "50");
            await tx.sprintCapacity.create({
              data: {
                sprint_id: nextSprint.id,
                location_id: loc.id,
                max_action_points: defaultAP,
              },
            });
          }

          openSprints.push(nextSprint);
          newSprintsCreated++;
        }

        const prependPriority = await consumePrependPriority(nextSprint.id, task.location_id);
        await tx.task.update({
          where: { id: t.id },
          data: { sprint_id: nextSprint.id, priority: prependPriority },
        });

        modifyUsed(sprint.id, task.location_id, -t.action_points);
        await getUsed(nextSprint.id, task.location_id);
        modifyUsed(nextSprint.id, task.location_id, t.action_points);
        remainingOverflow -= t.action_points;

        cascadedTasks.push({
          id: t.id,
          from_sprint_id: sprint.id,
          to_sprint_id: nextSprint.id,
        });
      }
    }

    return {
      moved_task: { id: taskId, sprint_id: targetSprintId },
      cascaded_tasks: cascadedTasks,
      new_sprints_created: newSprintsCreated,
    };
  });
}

// ─── Kapazitäts-Rebalancing ───────────────────────────────────────────────────

export interface RebalanceResult {
  pulled_task_ids: number[];
  pushed_task_ids: number[];
}

/**
 * Gleicht Tasks automatisch aus, wenn das SP-Budget eines Sprints geändert wird:
 * - Erhöhung: zieht Tasks vom nächsten Sprint vor (von oben)
 * - Verringerung: schiebt überzählige Tasks in den nächsten Sprint (nach oben dort)
 */
export async function rebalanceAfterCapacityChange(
  sprintId: number,
  locationId: number,
  oldMax: number,
  newMax: number
): Promise<RebalanceResult> {
  if (newMax === oldMax) return { pulled_task_ids: [], pushed_task_ids: [] };

  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint || sprint.lock_status !== "open") return { pulled_task_ids: [], pushed_task_ids: [] };

  const usedResult = await prisma.task.aggregate({
    where: { sprint_id: sprintId, location_id: locationId },
    _sum: { action_points: true },
  });
  const used = usedResult._sum.action_points ?? 0;

  if (newMax > oldMax) {
    // Kapazität erhöht → Tasks vom nächsten Sprint vorziehen
    const freeCapacity = newMax - used;
    if (freeCapacity <= 0) return { pulled_task_ids: [], pushed_task_ids: [] };

    const nextSprint = await prisma.sprint.findFirst({
      where: {
        is_archived: false,
        lock_status: { not: "hard_locked" },
        OR: [
          { year: { gt: sprint.year } },
          { year: sprint.year, month: { gt: sprint.month } },
        ],
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    if (!nextSprint) return { pulled_task_ids: [], pushed_task_ids: [] };

    const candidates = await prisma.task.findMany({
      where: { sprint_id: nextSprint.id, location_id: locationId, status: { not: "completed" } },
      orderBy: { priority: "asc" },
    });

    const maxPriorityResult = await prisma.task.aggregate({
      where: { sprint_id: sprintId, location_id: locationId },
      _max: { priority: true },
    });
    let appendPriority = (maxPriorityResult._max.priority ?? 0) + 1;

    let remaining = freeCapacity;
    const pulled: number[] = [];
    for (const task of candidates) {
      if (task.action_points > remaining) break;
      await prisma.task.update({
        where: { id: task.id },
        data: { sprint_id: sprintId, priority: appendPriority++ },
      });
      remaining -= task.action_points;
      pulled.push(task.id);
    }
    return { pulled_task_ids: pulled, pushed_task_ids: [] };

  } else {
    // Kapazität verringert → überzählige Tasks in den nächsten Sprint schieben
    const overflow = used - newMax;
    if (overflow <= 0) return { pulled_task_ids: [], pushed_task_ids: [] };

    let nextSprint = await prisma.sprint.findFirst({
      where: {
        is_archived: false,
        OR: [
          { year: { gt: sprint.year } },
          { year: sprint.year, month: { gt: sprint.month } },
        ],
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    if (!nextSprint) {
      const nm = sprint.month === 12
        ? { year: sprint.year + 1, month: 1 }
        : { year: sprint.year, month: sprint.month + 1 };
      nextSprint = await createSprint(nm.year, nm.month);
    }

    const toEvict = await prisma.task.findMany({
      where: { sprint_id: sprintId, location_id: locationId, status: { not: "completed" } },
      orderBy: { priority: "desc" }, // niedrigste Prio zuerst (höchste Zahl)
    });

    const minPriorityResult = await prisma.task.aggregate({
      where: { sprint_id: nextSprint.id, location_id: locationId },
      _min: { priority: true },
    });

    // Zu evictierende Tasks sammeln
    const selected: typeof toEvict = [];
    let remainingOverflow = overflow;
    for (const task of toEvict) {
      if (remainingOverflow <= 0) break;
      selected.push(task);
      remainingOverflow -= task.action_points;
    }

    // Umkehren: wichtigste der Evicted-Gruppe kommt ganz oben in den nächsten Sprint
    selected.reverse();
    const count = selected.length;
    const startPriority = (minPriorityResult._min.priority ?? 1) - count;

    const pushed: number[] = [];
    for (let i = 0; i < selected.length; i++) {
      await prisma.task.update({
        where: { id: selected[i].id },
        data: { sprint_id: nextSprint.id, priority: startPriority + i },
      });
      pushed.push(selected[i].id);
    }
    return { pulled_task_ids: [], pushed_task_ids: pushed };
  }
}
