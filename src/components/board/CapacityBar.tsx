"use client";

import type { SprintCapacityInfo } from "@/types/board";

function getCapacityColor(pct: number): string {
  if (pct >= 100) return "#EF4444"; // rot – voll/überbucht
  if (pct >= 90) return "#F97316"; // orange
  if (pct >= 70) return "#EAB308"; // gelb
  return "#22C55E"; // grün
}

interface CapacityBarProps {
  capacity: SprintCapacityInfo;
  compact?: boolean;
}

export function CapacityBar({ capacity, compact }: CapacityBarProps) {
  const pct = capacity.max_action_points > 0
    ? Math.min(100, Math.round((capacity.used_action_points / capacity.max_action_points) * 100))
    : 0;
  const color = getCapacityColor(pct);
  const overbooked = capacity.used_action_points > capacity.max_action_points;

  return (
    <div className={compact ? "" : "space-y-0.5"}>
      <div className="flex items-center justify-between gap-2">
        {/* Standort-Dot + Name */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: capacity.location_color }}
          />
          {!compact && (
            <span className="text-xs text-gray-500 truncate">{capacity.location_name}</span>
          )}
        </div>
        {/* AP-Zahlen */}
        <span className={`text-xs font-medium tabular-nums shrink-0 ${overbooked ? "text-red-600" : "text-gray-500"}`}>
          {capacity.used_action_points}/{capacity.max_action_points}
        </span>
      </div>

      {/* Balken */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}
