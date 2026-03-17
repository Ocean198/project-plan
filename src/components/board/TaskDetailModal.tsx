"use client";

import { useState, useEffect } from "react";
import type { BoardTask, LocationInfo } from "@/types/board";
import { can, type RolePermissions } from "@/lib/permissions";

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
  task_status_changed: "Status geändert",
  task_priority_changed: "Priorität geändert",
  task_location_changed: "Standort geändert",
  task_commented: "Kommentar",
  cascade_triggered: "Cascade ausgelöst",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  completed: "Abgeschlossen",
};

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  open: { label: "Offen", classes: "bg-gray-100 text-gray-600" },
  in_progress: { label: "In Bearbeitung", classes: "bg-blue-100 text-blue-700" },
  completed: { label: "Abgeschlossen", classes: "bg-green-100 text-green-700" },
};

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function getApColor(sp: number): string {
  if (sp <= 3) return "bg-green-100 text-green-700";
  if (sp <= 6) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

interface TaskDetailModalProps {
  task: BoardTask;
  userRole: string;
  permissions: RolePermissions;
  locations: LocationInfo[];
  currentUser: { id: number; name: string };
  onClose: () => void;
  onStatusChange: (taskId: number, status: "open" | "in_progress" | "completed") => Promise<void>;
  onDelete?: (taskId: number) => Promise<void>;
  onTaskUpdated?: (taskId: number) => void;
}

export function TaskDetailModal({ task, userRole, permissions, locations, currentUser, onClose, onStatusChange, onDelete, onTaskUpdated }: TaskDetailModalProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [changingStatus, setChangingStatus] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(task.status);
  const [currentAssignee, setCurrentAssignee] = useState<{ id: number; name: string } | null>(task.assignee);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentActionPoints, setCurrentActionPoints] = useState(task.action_points);
  const [savingSP, setSavingSP] = useState(false);
  const [currentLocationId, setCurrentLocationId] = useState(task.location.id);
  const [savingLocation, setSavingLocation] = useState(false);
  const [comment, setComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const isCompleted = currentStatus === "completed";
  const isHardLocked = task.sprint.lock_status === "hard_locked";
  const canEdit = can(userRole, 'board.change_status', permissions) && !isCompleted;
  const canEditSP = can(userRole, 'board.edit_story_points', permissions) && !isCompleted && !isHardLocked;
  const canChangeLocation = can(userRole, 'board.change_location', permissions) && !isCompleted && !isHardLocked;

  async function loadActivities() {
    setLoadingActivities(true);
    try {
      const res = await fetch(`/api/activity?target_type=task&target_id=${task.id}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data.logs.filter((l: ActivityEntry) => l.action !== "task_priority_changed"));
      }
    } finally {
      setLoadingActivities(false);
    }
  }

  useEffect(() => {
    loadActivities();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  async function handleStatusChange(status: "open" | "in_progress" | "completed") {
    if (changingStatus || isHardLocked) return;
    setChangingStatus(true);
    try {
      await onStatusChange(task.id, status);
      setCurrentStatus(status);
      setCurrentAssignee(status === "in_progress" ? currentUser : null);
      await loadActivities();
    } finally {
      setChangingStatus(false);
    }
  }

  async function handleSPChange(newSP: number) {
    if (!canEditSP || savingSP) return;
    setSavingSP(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_points: newSP }),
      });
      if (res.ok) setCurrentActionPoints(newSP);
    } finally {
      setSavingSP(false);
    }
  }

  async function handleLocationChange(newLocationId: number) {
    if (!canChangeLocation || savingLocation) return;
    setSavingLocation(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: newLocationId }),
      });
      if (res.ok) {
        setCurrentLocationId(newLocationId);
        onTaskUpdated?.(task.id);
        await loadActivities();
      }
    } finally {
      setSavingLocation(false);
    }
  }

  async function handleCommentSubmit() {
    if (!comment.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comment.trim() }),
      });
      if (res.ok) {
        setComment("");
        await loadActivities();
      }
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete(task.id);
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const currentLocation = locations.find((l) => l.id === currentLocationId) ?? task.location;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Farbstreifen oben */}
        <div className="h-1.5 rounded-t-2xl" style={{ backgroundColor: currentLocation.color }} />

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
                  style={{ backgroundColor: currentLocation.color }}
                >
                  {currentLocation.name}
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
            {canEditSP ? (
              <div className="flex items-center gap-1.5">
                <select
                  value={currentActionPoints}
                  onChange={(e) => handleSPChange(parseInt(e.target.value))}
                  disabled={savingSP}
                  className={`text-xs font-bold px-2 py-1 rounded border border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 cursor-pointer ${getApColor(currentActionPoints)}`}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((sp) => (
                    <option key={sp} value={sp}>{sp} SP</option>
                  ))}
                </select>
                {savingSP && <span className="text-xs text-gray-400">Speichern...</span>}
              </div>
            ) : (
              <span className={`text-xs font-bold px-2 py-1 rounded ${getApColor(currentActionPoints)}`}>
                {currentActionPoints} Story {currentActionPoints === 1 ? "Point" : "Points"}
              </span>
            )}
            {canChangeLocation && locations.length > 1 ? (
              <div className="flex items-center gap-1.5">
                <select
                  value={currentLocationId}
                  onChange={(e) => handleLocationChange(parseInt(e.target.value))}
                  disabled={savingLocation}
                  className="text-xs px-2 py-1 rounded border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 cursor-pointer bg-white"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
                {savingLocation && <span className="text-xs text-gray-400">Speichern...</span>}
              </div>
            ) : (
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: currentLocation.color }}
              >
                {currentLocation.name}
              </span>
            )}
            <span className={`text-xs font-medium px-2 py-1 rounded ${STATUS_CONFIG[currentStatus]?.classes}`}>
              {STATUS_CONFIG[currentStatus]?.label}
            </span>
            {currentAssignee && (
              <span className="text-xs text-gray-500 font-medium">{currentAssignee.name}</span>
            )}
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

          {/* Status ändern */}
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

          {/* Aufgabe wieder öffnen */}
          {can(userRole, 'board.reopen_tasks', permissions) && isCompleted && (
            <button
              onClick={async () => {
                if (changingStatus) return;
                setChangingStatus(true);
                try {
                  await onStatusChange(task.id, "open");
                  setCurrentStatus("open");
                  setCurrentAssignee(null);
                  await loadActivities();
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
          )}

          {/* Kommentar schreiben */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Kommentar hinzufügen</p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Kommentar eingeben..."
              rows={3}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-gray-300"
            />
            <button
              onClick={handleCommentSubmit}
              disabled={!comment.trim() || submittingComment}
              className="mt-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submittingComment ? "Speichern..." : "Kommentar speichern"}
            </button>
          </div>

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
                      {entry.user ? getInitials(entry.user.name) : "SY"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-700">
                        {entry.user?.name ?? "System"}
                      </span>
                      {" · "}
                      <span className="text-gray-500">
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                      {entry.action === "task_commented" && typeof entry.details?.comment === "string" && (
                        <p className="text-gray-600 mt-0.5 text-[11px] bg-gray-50 rounded px-2 py-1 whitespace-pre-wrap">
                          {entry.details.comment}
                        </p>
                      )}
                      {entry.action === "task_status_changed" && typeof entry.details?.old_status === "string" && typeof entry.details?.new_status === "string" && (
                        <span className="text-gray-400 text-[11px]"> ({STATUS_LABELS[entry.details.old_status] ?? entry.details.old_status} → {STATUS_LABELS[entry.details.new_status] ?? entry.details.new_status})</span>
                      )}
                      <p className="text-gray-400 text-[11px] mt-0.5">{formatDate(entry.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Aufgabe löschen */}
          {can(userRole, 'board.delete_tasks', permissions) && !deleteConfirm && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="w-full py-2 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 transition flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Aufgabe löschen
            </button>
          )}
          {can(userRole, 'board.delete_tasks', permissions) && deleteConfirm && (
            <div className="border border-red-200 rounded-lg p-3 bg-red-50">
              <p className="text-xs text-red-700 font-medium mb-2">Wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-1.5 rounded text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
                >
                  {deleting ? "Löschen..." : "Ja, löschen"}
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 py-1.5 rounded text-xs font-medium border border-red-200 text-red-600 hover:bg-white transition"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
