"use client";

import { useState, useEffect } from "react";

interface SprintCapacity {
  location_id: number;
  location_name: string;
  location_color: string;
  max_action_points: number;
  used_action_points: number;
}

interface ArchivedSprint {
  id: number;
  label: string;
  year: number;
  month: number;
  capacities: SprintCapacity[];
}

export function ArchiveView() {
  const [sprints, setSprints] = useState<ArchivedSprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [unarchiving, setUnarchiving] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const data = await fetch("/api/sprints/archived").then((r) => r.json());
    setSprints(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleUnarchive(sprintId: number) {
    setUnarchiving(sprintId);
    const res = await fetch(`/api/sprints/${sprintId}/unarchive`, { method: "POST" });
    setUnarchiving(null);
    if (res.ok) {
      setSprints((prev) => prev.filter((s) => s.id !== sprintId));
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  if (sprints.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
        <svg className="w-10 h-10 mx-auto mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
        <p className="text-sm text-gray-400">Keine archivierten Sprints</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sprints.map((sprint) => (
        <div key={sprint.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{sprint.label}</p>
            <div className="flex gap-3 mt-1 flex-wrap">
              {sprint.capacities.map((cap) => (
                <span key={cap.location_id} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cap.location_color }} />
                  {cap.location_name}: {cap.used_action_points}/{cap.max_action_points} SP
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => handleUnarchive(sprint.id)}
            disabled={unarchiving === sprint.id}
            className="shrink-0 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition"
          >
            {unarchiving === sprint.id ? "..." : "Rückgängig"}
          </button>
        </div>
      ))}
    </div>
  );
}
