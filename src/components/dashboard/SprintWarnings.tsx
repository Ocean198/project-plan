"use client";

import type { FullSprintWarning } from "@/app/api/dashboard/route";

interface SprintWarningsProps {
  warnings: FullSprintWarning[];
}

export function SprintWarnings({ warnings }: SprintWarningsProps) {
  if (warnings.length === 0) return null;

  return (
    <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h3 className="text-sm font-semibold text-orange-800">
          {warnings.length} {warnings.length === 1 ? "Sprint" : "Sprints"} fast oder vollständig ausgelastet
        </h3>
      </div>
      <div className="space-y-2">
        {warnings.map((w, i) => (
          <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-orange-100">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: w.location_color }} />
              <div>
                <span className="text-sm font-medium text-gray-800">{w.sprint_label}</span>
                <span className="text-gray-400 mx-1.5">·</span>
                <span className="text-sm text-gray-600">{w.location_name}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{w.used}/{w.max} AP</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                w.pct >= 100
                  ? "bg-red-100 text-red-700"
                  : "bg-orange-100 text-orange-700"
              }`}>
                {w.pct}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
