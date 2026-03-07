"use client";

import { useState, useEffect } from "react";
import type { BoardTask } from "@/types/board";

interface ActivityEntry {
  id: number;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  user: { id: number; name: string } | null;
}

const ACTION_LABELS: Record<string, string> = {
  task_created: "Aufgabe erstellt",
  task_moved: "Aufgabe verschoben",
  task_completed: "Aufgabe abgeschlossen",
  task_priority_changed: "Priorität geändert",
  cascade_triggered: "Cascade ausgelöst",
};

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  open: { label: "Offen", classes: "bg-gray-100 text-gray-600" },
  in_progress: { label: "In Bearbeitung", classes: "bg-blue-100 text-blue-700" },
  completed: { label: "Abgeschlossen", classes: "bg-green-100 text-green-700" },
};

const AP_COLORS: Record<number, string> = {
  1: "bg-green-100 text-green-700",
  2: "bg-yellow-100 text-yellow-700",
  3: "bg-red-100 text-red-700",
};

interface TaskDetailModalProps {
  task: BoardTask;
  userRole: string;
  onClose: () => void;
  onStatusChange: (taskId: number, status: "open" | "in_progress" | "completed") => Promise<void>;
}

export function TaskDetailModal({ task, userRole, onClose, onStatusChange }: TaskDetailModalProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [changingStatus, setChangingStatus] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(task.status);

  const isCompleted = currentStatus === "completed";
  const canEdit = (userRole === "sales" || userRole === "admin") && !isCompleted;
  const isHardLocked = task.sprint.lock_status === "hard_locked";

  useEffect(() => {
    async function loadActivities() {
      setLoadingActivities(true);
      try {
        const res = await fetch(`/api/activity?target_type=task&limit=10`);
        if (res.ok) {
          const data = await res.json();
          const taskActivities = data.logs.filter(
            (l: ActivityEntry & { target_id: number }) => l.target_id === task.id
          );
          setActivities(taskActivities);
        }
      } finally {
        setLoadingActivities(false);
      }
    }
    loadActivities();
  }, [task.id]);

  async function handleStatusChange(status: "open" | "in_progress" | "completed") {
    if (changingStatus || isHardLocked) return;
    setChangingStatus(true);
    try {
      await onStatusChange(task.id, status);
      setCurrentStatus(status);
    } finally {
      setChangingStatus(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Farbstreifen oben */}
        <div className="h-1.5 rounded-t-2xl" style={{ backgroundColor: task.location.color }} />

        {/* Header */}
        <div className="px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className={`text-lg font-semibold text-gray-900 leading-snug ${isCompleted ? "line-through text-gray-400" : ""}`}>
                {task.title}
              </h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: task.location.color }}
                >
                  {task.location.name}
                </span>
                <span className="text-xs text-gray-400">{task.sprint.label}</span>
                {task.external_ticket_id && (
                  <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">
                    {task.external_ticket_id}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition shrink-0 p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 space-y-5">
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-1 rounded ${AP_COLORS[task.action_points]}`}>
              {task.action_points} Action {task.action_points === 1 ? "Point" : "Points"}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded ${STATUS_CONFIG[currentStatus]?.classes}`}>
              {STATUS_CONFIG[currentStatus]?.label}
            </span>
          </div>

          {/* Beschreibung */}
          {task.description && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Beschreibung</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Metadaten */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Erstellt von</p>
              <p className="font-medium text-gray-700">{task.creator.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Erstellt am</p>
              <p className="font-medium text-gray-700">{formatDate(task.created_at)}</p>
            </div>
            {task.completed_at && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Abgeschlossen am</p>
                <p className="font-medium text-green-700">{formatDate(task.completed_at)}</p>
              </div>
            )}
          </div>

          {/* Status ändern (nur für berechtigte User, nicht hard-locked, nicht abgeschlossen) */}
          {canEdit && !isHardLocked && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Status ändern</p>
              <div className="flex gap-2">
                {(["open", "in_progress", "completed"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    disabled={changingStatus || s === currentStatus}
                    className={`
                      flex-1 py-2 rounded-lg text-xs font-medium transition border
                      ${s === currentStatus
                        ? "border-transparent " + STATUS_CONFIG[s].classes
                        : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Admin: abgeschlossene Aufgabe wieder öffnen */}
          {isCompleted && userRole === "admin" && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Admin-Aktion</p>
              <button
                onClick={async () => {
                  if (changingStatus) return;
                  setChangingStatus(true);
                  try {
                    await onStatusChange(task.id, "open");
                    setCurrentStatus("open");
                  } finally {
                    setChangingStatus(false);
                  }
                }}
                disabled={changingStatus}
                className="w-full py-2 rounded-lg text-xs font-medium border border-amber-200 text-amber-700 hover:bg-amber-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Aufgabe wieder öffnen
              </button>
            </div>
          )}

          {/* Mini-Aktivitätslog */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Aktivität</p>
            {loadingActivities ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : activities.length === 0 ? (
              <p className="text-xs text-gray-400">Noch keine Aktivitäten.</p>
            ) : (
              <div className="space-y-2">
                {activities.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2.5 text-xs">
                    <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">
                      {entry.user?.name.charAt(0) ?? "S"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-700">
                        {entry.user?.name ?? "System"}
                      </span>
                      {" · "}
                      <span className="text-gray-500">
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                      <p className="text-gray-400 text-[11px] mt-0.5">{formatDate(entry.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
