"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import type { CapacityOverviewEntry } from "@/app/api/dashboard/route";

function getBarColor(pct: number): string {
  if (pct >= 100) return "#EF4444";
  if (pct >= 90) return "#F97316";
  if (pct >= 70) return "#EAB308";
  return "#22C55E";
}

interface CapacityOverviewProps {
  data: CapacityOverviewEntry[];
}

export function CapacityOverview({ data }: CapacityOverviewProps) {
  // Für jede Location einen Chart-Datenpunkt pro Sprint
  const allLocations = data.length > 0
    ? data[0].locations.map((l) => ({ id: l.location_id, name: l.location_name, color: l.location_color }))
    : [];

  // Flaches Array: { sprint_label, [Standort]: pct, ... }
  const chartData = data.map((entry) => {
    const row: Record<string, string | number> = { sprint: entry.sprint_label };
    entry.locations.forEach((loc) => {
      row[loc.location_name] = loc.pct;
    });
    return row;
  });

  if (data.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">Keine Daten verfügbar.</p>;
  }

  return (
    <div className="space-y-6">
      {allLocations.map((loc) => {
        const locData = data.map((entry) => {
          const cap = entry.locations.find((l) => l.location_id === loc.id);
          return {
            sprint: entry.sprint_label.replace(/\s\d{4}$/, ""),
            pct: cap?.pct ?? 0,
            used: cap?.used ?? 0,
            max: cap?.max ?? 0,
          };
        });

        return (
          <div key={loc.id}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: loc.color }} />
              <span className="text-sm font-medium text-gray-700">{loc.name}</span>
            </div>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={locData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="sprint" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip
                  formatter={(val, _name, props) =>
                    [`${(props?.payload as { used?: number })?.used ?? 0} / ${(props?.payload as { max?: number })?.max ?? 0} AP (${val}%)`, "Auslastung"]
                  }
                  labelStyle={{ fontWeight: 600 }}
                  contentStyle={{ borderRadius: 8, border: "1px solid #f0f0f0", fontSize: 12 }}
                />
                <ReferenceLine y={90} stroke="#F97316" strokeDasharray="4 4" strokeWidth={1} />
                <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                  {locData.map((entry, idx) => (
                    <Cell key={idx} fill={getBarColor(entry.pct)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}

      {/* Legende */}
      <div className="flex items-center gap-4 text-xs text-gray-400 pt-1">
        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-green-500 inline-block" /> &lt;70%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-yellow-400 inline-block" /> 70–89%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-orange-500 inline-block" /> 90–99%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-red-500 inline-block" /> 100%+</span>
      </div>
    </div>
  );
}

// Kompakte Übersichts-Kacheln pro Standort
export function CapacitySummaryCards({ data }: CapacityOverviewProps) {
  if (data.length === 0) return null;
  const nextSprint = data[0];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {nextSprint.locations.map((loc) => (
        <div key={loc.location_id} className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: loc.location_color }} />
            <span className="text-sm font-semibold text-gray-800">{loc.location_name}</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: loc.location_color }}>
            {loc.pct}%
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{loc.used}/{loc.max} AP</p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, loc.pct)}%`,
                backgroundColor: loc.pct >= 100 ? "#EF4444" : loc.pct >= 90 ? "#F97316" : loc.pct >= 70 ? "#EAB308" : "#22C55E",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
