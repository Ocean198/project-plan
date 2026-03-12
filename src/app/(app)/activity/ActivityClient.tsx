"use client";

import { useState, useEffect, useCallback } from "react";

interface ActivityLog {
  id: number;
  action: string;
  target_type: string;
  target_id: number;
  details: Record<string, unknown> | null;
  created_at: string;
  user: { id: number; name: string } | null;
}

interface ActivityResponse {
  logs: ActivityLog[];
  total: number;
  page: number;
  pages: number;
}

const ACTION_LABELS: Record<string, string> = {
  task_created: "Aufgabe erstellt",
  task_moved: "Aufgabe verschoben",
  task_completed: "Aufgabe abgeschlossen",
  task_priority_changed: "Priorität geändert",
  cascade_triggered: "Cascade ausgelöst",
  sprint_locked: "Sprint gesperrt",
  sprint_unlocked: "Sprint entsperrt",
  sprint_created: "Sprint erstellt",
  capacity_changed: "SP-Budget geändert",
  task_imported: "Aufgabe importiert",
  location_created: "Standort erstellt",
  user_created: "User erstellt",
};

const ACTION_ICONS: Record<string, { icon: string; bg: string; text: string }> = {
  task_created: { icon: "✦", bg: "bg-blue-100", text: "text-blue-600" },
  task_moved: { icon: "→", bg: "bg-purple-100", text: "text-purple-600" },
  task_completed: { icon: "✓", bg: "bg-green-100", text: "text-green-600" },
  task_priority_changed: { icon: "↕", bg: "bg-yellow-100", text: "text-yellow-600" },
  cascade_triggered: { icon: "⚡", bg: "bg-orange-100", text: "text-orange-600" },
  sprint_locked: { icon: "🔒", bg: "bg-red-100", text: "text-red-600" },
  sprint_unlocked: { icon: "🔓", bg: "bg-gray-100", text: "text-gray-600" },
  sprint_created: { icon: "+", bg: "bg-teal-100", text: "text-teal-600" },
  capacity_changed: { icon: "≡", bg: "bg-indigo-100", text: "text-indigo-600" },
  task_imported: { icon: "↓", bg: "bg-cyan-100", text: "text-cyan-600" },
  location_created: { icon: "◉", bg: "bg-pink-100", text: "text-pink-600" },
  user_created: { icon: "👤", bg: "bg-violet-100", text: "text-violet-600" },
};

function formatDetails(action: string, details: Record<string, unknown> | null): string {
  if (!details) return "";
  switch (action) {
    case "task_moved":
      return `Von „${details.from_sprint_label}" → „${details.to_sprint_label}"`;
    case "task_created":
      return `${details.action_points ?? ""} SP`;
    case "cascade_triggered": {
      const tasks = details.cascaded_tasks as { to_sprint_id: number }[] | undefined;
      return tasks ? `${tasks.length} Aufgabe${tasks.length !== 1 ? "n" : ""} weiterverschoben` : "";
    }
    case "capacity_changed":
      return `${details.old_value} SP → ${details.new_value} SP`;
    case "task_priority_changed":
      return `Prio ${details.old_priority} → ${details.new_priority}`;
    case "sprint_locked":
    case "sprint_unlocked":
      return details.new_status ? String(details.new_status).replace("_", " ") : "";
    case "task_imported":
      return details.external_ticket_id ? `Ticket ${details.external_ticket_id}` : "";
    default:
      return "";
  }
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `vor ${days} Tag${days !== 1 ? "en" : ""}`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function ActivityClient() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 30;

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (actionFilter) params.set("action", actionFilter);

    fetch(`/api/activity?${params}`)
      .then((r) => r.json() as Promise<ActivityResponse>)
      .then((data) => {
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
        setPages(data.pages ?? 1);
      })
      .finally(() => setLoading(false));
  }, [page, actionFilter]);

  useEffect(() => {
    setPage(1);
  }, [actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Group by date
  const grouped = logs.reduce<{ date: string; items: ActivityLog[] }[]>((acc, log) => {
    const date = new Date(log.created_at).toLocaleDateString("de-DE", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });
    const last = acc[acc.length - 1];
    if (last && last.date === date) {
      last.items.push(log);
    } else {
      acc.push({ date, items: [log] });
    }
    return acc;
  }, []);

  return (
    <div className="px-6 py-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Aktivität</h1>
          <p className="text-sm text-gray-400 mt-0.5">Chronologisches Protokoll aller Aktionen · {total} Einträge</p>
        </div>
        <button
          onClick={fetchLogs}
          className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
        >
          Aktualisieren
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Alle Aktionen</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {actionFilter && (
          <button
            onClick={() => setActionFilter("")}
            className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            Zurücksetzen
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0 mt-1" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-48" />
                <div className="h-3 bg-gray-100 rounded w-32" />
              </div>
            </div>
          ))
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">
            Keine Aktivitäten gefunden.
          </div>
        ) : (
          grouped.map(({ date, items }) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-gray-100" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{date}</span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
              <div className="space-y-1">
                {items.map((log, idx) => {
                  const cfg = ACTION_ICONS[log.action] ?? { icon: "•", bg: "bg-gray-100", text: "text-gray-600" };
                  const detail = formatDetails(log.action, log.details);
                  const isLast = idx === items.length - 1;

                  return (
                    <div key={log.id} className="flex gap-4">
                      {/* Timeline line + icon */}
                      <div className="flex flex-col items-center shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${cfg.bg} ${cfg.text}`}>
                          {cfg.icon}
                        </div>
                        {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1 mb-0 min-h-[1.5rem]" />}
                      </div>

                      {/* Content */}
                      <div className="pb-4 flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">
                            {log.user?.name ?? "System"}
                          </span>
                          <span className="text-sm text-gray-600">{ACTION_LABELS[log.action] ?? log.action}</span>
                          {detail && (
                            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{detail}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="text-xs text-gray-400 cursor-default"
                            title={formatAbsoluteTime(log.created_at)}
                          >
                            {formatRelativeTime(log.created_at)}
                          </span>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400">
                            {log.target_type} #{log.target_id}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">Seite {page} von {pages}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
            >
              ← Zurück
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
            >
              Weiter →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
