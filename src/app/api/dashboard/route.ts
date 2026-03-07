import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, serverError } from "@/lib/api-helpers";

export interface DashboardData {
  capacityOverview: CapacityOverviewEntry[];
  velocityData: VelocityEntry[];
  fullSprints: FullSprintWarning[];
  summary: { totalOpen: number; totalInProgress: number; totalCompleted: number };
}

export interface CapacityOverviewEntry {
  sprint_id: number;
  sprint_label: string;
  locations: Array<{
    location_id: number;
    location_name: string;
    location_color: string;
    used: number;
    max: number;
    pct: number;
  }>;
}

export interface VelocityEntry {
  sprint_label: string;
  sprint_id: number;
  [locationName: string]: number | string; // dynamisch pro Standort
}

export interface FullSprintWarning {
  sprint_id: number;
  sprint_label: string;
  location_name: string;
  location_color: string;
  used: number;
  max: number;
  pct: number;
}

// GET /api/dashboard
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const now = new Date();

    // Nächste 6 offene Sprints für Kapazitäts-Übersicht
    const futureSprints = await prisma.sprint.findMany({
      where: {
        OR: [
          { year: { gt: now.getFullYear() } },
          { year: now.getFullYear(), month: { gte: now.getMonth() + 1 } },
        ],
      },
      include: {
        capacities: { include: { location: true } },
        tasks: { select: { location_id: true, action_points: true, status: true } },
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
      take: 6,
    });

    // Letzte 12 Sprints für Velocity
    const pastSprints = await prisma.sprint.findMany({
      include: {
        capacities: { include: { location: true } },
        tasks: {
          where: { status: "completed" },
          select: { location_id: true, action_points: true },
        },
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
      take: 12,
    });

    // Standort-Farben zusammenbauen
    const locationColorMap = new Map<number, { name: string; color: string }>();
    [...futureSprints, ...pastSprints].forEach((s) =>
      s.capacities.forEach((c) =>
        locationColorMap.set(c.location_id, { name: c.location.name, color: c.location.color })
      )
    );

    // Kapazitäts-Übersicht
    const capacityOverview: CapacityOverviewEntry[] = futureSprints.map((sprint) => {
      const usedByLocation = new Map<number, number>();
      sprint.tasks.forEach((t) => {
        usedByLocation.set(t.location_id, (usedByLocation.get(t.location_id) ?? 0) + t.action_points);
      });

      return {
        sprint_id: sprint.id,
        sprint_label: sprint.label,
        locations: sprint.capacities.map((cap) => {
          const used = usedByLocation.get(cap.location_id) ?? 0;
          const max = cap.max_action_points;
          return {
            location_id: cap.location_id,
            location_name: cap.location.name,
            location_color: cap.location.color,
            used,
            max,
            pct: max > 0 ? Math.round((used / max) * 100) : 0,
          };
        }),
      };
    });

    // Velocity-Daten (abgeschlossene AP pro Sprint/Standort)
    const velocityData: VelocityEntry[] = pastSprints.map((sprint) => {
      const entry: VelocityEntry = {
        sprint_label: sprint.label.replace(/\s\d{4}$/, ""), // Monat ohne Jahr für kurze Labels
        sprint_id: sprint.id,
      };
      sprint.tasks.forEach((t) => {
        const loc = locationColorMap.get(t.location_id);
        if (loc) {
          entry[loc.name] = ((entry[loc.name] as number) ?? 0) + t.action_points;
        }
      });
      // Fehlende Standorte auf 0 setzen
      locationColorMap.forEach(({ name }) => {
        if (entry[name] === undefined) entry[name] = 0;
      });
      return entry;
    });

    // Warnungen: Sprints die >= 90% ausgelastet sind
    const fullSprints: FullSprintWarning[] = [];
    for (const sprint of futureSprints) {
      const usedByLocation = new Map<number, number>();
      sprint.tasks.forEach((t) =>
        usedByLocation.set(t.location_id, (usedByLocation.get(t.location_id) ?? 0) + t.action_points)
      );
      for (const cap of sprint.capacities) {
        const used = usedByLocation.get(cap.location_id) ?? 0;
        const pct = cap.max_action_points > 0
          ? Math.round((used / cap.max_action_points) * 100)
          : 0;
        if (pct >= 90) {
          fullSprints.push({
            sprint_id: sprint.id,
            sprint_label: sprint.label,
            location_name: cap.location.name,
            location_color: cap.location.color,
            used,
            max: cap.max_action_points,
            pct,
          });
        }
      }
    }

    // Gesamt-Zusammenfassung
    const [totalOpen, totalInProgress, totalCompleted] = await Promise.all([
      prisma.task.count({ where: { status: "open" } }),
      prisma.task.count({ where: { status: "in_progress" } }),
      prisma.task.count({ where: { status: "completed" } }),
    ]);

    return NextResponse.json({
      capacityOverview,
      velocityData,
      fullSprints,
      summary: { totalOpen, totalInProgress, totalCompleted },
      locationColors: Object.fromEntries(
        Array.from(locationColorMap.entries()).map(([id, v]) => [v.name, v.color])
      ),
    });
  } catch {
    return serverError();
  }
}
