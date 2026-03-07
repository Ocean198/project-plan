"use client";

import type { LocationInfo, ActiveFilters } from "@/types/board";

const STATUS_OPTIONS: Array<{ value: "open" | "in_progress" | "completed"; label: string }> = [
  { value: "open", label: "Offen" },
  { value: "in_progress", label: "In Bearbeitung" },
  { value: "completed", label: "Abgeschlossen" },
];

interface FilterBarProps {
  locations: LocationInfo[];
  filters: ActiveFilters;
  onChange: (filters: ActiveFilters) => void;
}

export function FilterBar({ locations, filters, onChange }: FilterBarProps) {
  const hasActiveFilters =
    filters.locationIds.length > 0 || filters.statuses.length > 0;

  function toggleLocation(id: number) {
    const ids = filters.locationIds.includes(id)
      ? filters.locationIds.filter((l) => l !== id)
      : [...filters.locationIds, id];
    onChange({ ...filters, locationIds: ids });
  }

  function toggleStatus(status: "open" | "in_progress" | "completed") {
    const statuses = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ ...filters, statuses });
  }

  function clearAll() {
    onChange({ locationIds: [], statuses: [] });
  }

  return (
    <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-100 flex-wrap">
      {/* Standort-Filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-medium text-gray-400 mr-1">Standort</span>
        {locations.map((loc) => {
          const active = filters.locationIds.includes(loc.id);
          return (
            <button
              key={loc.id}
              onClick={() => toggleLocation(loc.id)}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium
                border transition-all
                ${active
                  ? "border-transparent text-white shadow-sm"
                  : "border-gray-200 text-gray-600 bg-white hover:border-gray-300"
                }
              `}
              style={active ? { backgroundColor: loc.color, borderColor: loc.color } : {}}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: active ? "rgba(255,255,255,0.7)" : loc.color }}
              />
              {loc.name}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-gray-200" />

      {/* Status-Filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-medium text-gray-400 mr-1">Status</span>
        {STATUS_OPTIONS.map((opt) => {
          const active = filters.statuses.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => toggleStatus(opt.value)}
              className={`
                px-3 py-1 rounded-full text-xs font-medium border transition-all
                ${active
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-600 bg-white hover:border-gray-300"
                }
              `}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Alle zurücksetzen */}
      {hasActiveFilters && (
        <>
          <div className="h-5 w-px bg-gray-200" />
          <button
            onClick={clearAll}
            className="text-xs text-gray-400 hover:text-gray-600 transition underline underline-offset-2"
          >
            Filter zurücksetzen
          </button>
        </>
      )}

    </div>
  );
}
