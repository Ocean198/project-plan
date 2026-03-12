"use client";

import { useState, useEffect } from "react";
import { CapacityOverview, CapacitySummaryCards } from "@/components/dashboard/CapacityOverview";
import { VelocityChart } from "@/components/dashboard/VelocityChart";
import { SprintWarnings } from "@/components/dashboard/SprintWarnings";
import type { DashboardData } from "@/app/api/dashboard/route";

interface DashboardClientProps {
  canExport: boolean;
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-gray-100 rounded-xl animate-pulse ${className}`} />;
}

export function DashboardClient({ canExport }: DashboardClientProps) {
  const [data, setData] = useState<DashboardData & { locationColors: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  async function handleExportCSV() {
    setExporting(true);
    try {
      const res = await fetch("/api/export?format=csv");
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sprintboard-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPDF() {
    setExporting(true);
    try {
      const res = await fetch("/api/export?format=pdf");
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sprintboard-report-${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="px-6 py-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Übersicht über SP-Auslastung und Velocity</p>
        </div>
        {canExport && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CSV
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              PDF
            </button>
          </div>
        )}
      </div>

      {/* Warnungen */}
      {!loading && data && data.fullSprints.length > 0 && (
        <SprintWarnings warnings={data.fullSprints} />
      )}

      {/* Zusammenfassungs-Kacheln */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Offene Aufgaben" value={data.summary.totalOpen} color="text-gray-700" />
          <StatCard label="In Bearbeitung" value={data.summary.totalInProgress} color="text-blue-600" />
          <StatCard label="Abgeschlossen" value={data.summary.totalCompleted} color="text-green-600" />
        </div>
      ) : null}

      {/* Aktueller Sprint – Standort-Kacheln */}
      {!loading && data && data.capacityOverview.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {data.capacityOverview[0].sprint_label} – Aktuell
          </h2>
          <CapacitySummaryCards data={data.capacityOverview} />
        </div>
      )}

      {/* Kapazitäts-Übersicht (Balkendiagramme) */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-1">SP-Auslastung – Nächste 6 Sprints</h2>
        <p className="text-xs text-gray-400 mb-5">Orangene Linie = 90%-Warnschwelle</p>
        {loading ? (
          <Skeleton className="h-64" />
        ) : data ? (
          <CapacityOverview data={data.capacityOverview} />
        ) : null}
      </div>

      {/* Velocity-Tracking */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Velocity – Abgeschlossene SP pro Monat</h2>
        <p className="text-xs text-gray-400 mb-5">Letzte 12 Monate, Durchschnitt der letzten 6 Monate</p>
        {loading ? (
          <Skeleton className="h-72" />
        ) : data ? (
          <VelocityChart data={data.velocityData} locationColors={data.locationColors} />
        ) : null}
      </div>
    </div>
  );
}
