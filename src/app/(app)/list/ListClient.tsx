"use client";

import { useState, useEffect, useCallback } from "react";

interface Task {
  id: number;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "completed";
  action_points: number;
  priority: number;
  external_ticket_id: string | null;
  location: { id: number; name: string; color: string };
  sprint: { id: number; label: string; year: number; month: number };
  creator: { id: number; name: string } | null;
}

interface TasksResponse {
  tasks: Task[];
  total: number;
  page: number;
  pages: number;
}

interface Location {
  id: number;
  name: string;
  color: string;
}

interface Sprint {
  id: number;
  label: string;
}

type SortKey = "sprint" | "priority" | "status" | "action_points" | "location";
type SortDir = "asc" | "desc";

const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  completed: "Abgeschlossen",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

const AP_COLORS: Record<number, string> = {
  1: "bg-green-100 text-green-700",
  2: "bg-yellow-100 text-yellow-700",
  3: "bg-red-100 text-red-700",
};

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      className={`w-3.5 h-3.5 ml-1 inline-block transition-transform ${active ? "text-blue-600" : "text-gray-300"} ${active && dir === "desc" ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );
}

export function ListClient({ canExport }: { canExport: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filter state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [sprintFilter, setSprintFilter] = useState("");

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>("sprint");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 25;

  // Options for filter dropdowns
  const [locations, setLocations] = useState<Location[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, locationFilter, sprintFilter]);

  // Load filter options
  useEffect(() => {
    Promise.all([
      fetch("/api/locations").then((r) => r.json()),
      fetch("/api/sprints").then((r) => r.json()),
    ]).then(([locData, sprintData]) => {
      setLocations(Array.isArray(locData) ? locData : []);
      setSprints(Array.isArray(sprintData) ? sprintData : []);
    });
  }, []);

  const fetchTasks = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (locationFilter) params.set("location_id", locationFilter);
    if (sprintFilter) params.set("sprint_id", sprintFilter);

    fetch(`/api/tasks?${params}`)
      .then((r) => r.json() as Promise<TasksResponse>)
      .then((data) => {
        // Client-side sort (API returns by sprint/priority; we re-sort for other columns)
        let sorted = [...data.tasks];
        sorted.sort((a, b) => {
          let av: string | number = 0;
          let bv: string | number = 0;
          switch (sortKey) {
            case "sprint":
              av = a.sprint.year * 100 + a.sprint.month;
              bv = b.sprint.year * 100 + b.sprint.month;
              break;
            case "priority":
              av = a.priority;
              bv = b.priority;
              break;
            case "status":
              av = a.status;
              bv = b.status;
              break;
            case "action_points":
              av = a.action_points;
              bv = b.action_points;
              break;
            case "location":
              av = a.location.name;
              bv = b.location.name;
              break;
          }
          if (av < bv) return sortDir === "asc" ? -1 : 1;
          if (av > bv) return sortDir === "asc" ? 1 : -1;
          return 0;
        });
        setTasks(sorted);
        setTotal(data.total);
        setPages(data.pages);
      })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, statusFilter, locationFilter, sprintFilter, sortKey, sortDir]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

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

  const hasFilters = search || statusFilter || locationFilter || sprintFilter;

  return (
    <div className="px-6 py-6 space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Listenansicht</h1>
          <p className="text-sm text-gray-400 mt-0.5">Alle Aufgaben tabellarisch, sortierbar und filterbar</p>
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

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 min-w-48">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Suche nach Titel, Beschreibung, Ticket-ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Alle Status</option>
            <option value="open">Offen</option>
            <option value="in_progress">In Bearbeitung</option>
            <option value="completed">Abgeschlossen</option>
          </select>

          {/* Location filter */}
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Alle Standorte</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          {/* Sprint filter */}
          <select
            value={sprintFilter}
            onChange={(e) => setSprintFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Alle Sprints</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setStatusFilter(""); setLocationFilter(""); setSprintFilter(""); }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Zurücksetzen
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Titel</th>
                <th
                  onClick={() => toggleSort("location")}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700"
                >
                  Standort <SortIcon active={sortKey === "location"} dir={sortDir} />
                </th>
                <th
                  onClick={() => toggleSort("sprint")}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700"
                >
                  Sprint <SortIcon active={sortKey === "sprint"} dir={sortDir} />
                </th>
                <th
                  onClick={() => toggleSort("status")}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700"
                >
                  Status <SortIcon active={sortKey === "status"} dir={sortDir} />
                </th>
                <th
                  onClick={() => toggleSort("action_points")}
                  className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700"
                >
                  AP <SortIcon active={sortKey === "action_points"} dir={sortDir} />
                </th>
                <th
                  onClick={() => toggleSort("priority")}
                  className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700"
                >
                  Prio <SortIcon active={sortKey === "priority"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Ticket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                    Keine Aufgaben gefunden.
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-400 font-mono">{task.id}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 max-w-xs truncate">{task.title}</div>
                      {task.description && (
                        <div className="text-xs text-gray-400 max-w-xs truncate mt-0.5">{task.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-sm text-gray-700">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: task.location.color }}
                        />
                        {task.location.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{task.sprint.label}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[task.status]}`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${AP_COLORS[task.action_points]}`}>
                        {task.action_points}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-500">{task.priority}</td>
                    <td className="px-4 py-3 text-sm text-gray-400 font-mono text-xs">
                      {task.external_ticket_id ?? "–"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {total} Aufgabe{total !== 1 ? "n" : ""} gesamt
              {pages > 1 && ` · Seite ${page} von ${pages}`}
            </p>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  ←
                </button>
                {Array.from({ length: Math.min(7, pages) }, (_, i) => {
                  const p = pages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= pages - 3 ? pages - 6 + i : page - 3 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-3 py-1.5 text-sm border rounded-lg transition ${
                        p === page
                          ? "bg-blue-600 text-white border-blue-600"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page === pages}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
