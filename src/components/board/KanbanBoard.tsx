"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";

import { useBoardData } from "@/hooks/useBoardData";
import { FilterBar } from "./FilterBar";
import { SprintColumn } from "./SprintColumn";
import { TaskCard, TaskCardOverlay } from "./TaskCard";
import { CascadeConfirmDialog } from "./CascadeConfirmDialog";
import { TaskDetailModal } from "./TaskDetailModal";
import type { BoardTask, BoardSprint, ActiveFilters, CascadePreview, LocationInfo } from "@/types/board";

interface KanbanBoardProps {
  userRole: string;
}

interface PendingMove {
  task: BoardTask;
  targetSprintId: number;
  targetSprint: BoardSprint;
  preview: CascadePreview;
  insertBeforeTaskId?: number;
}

export function KanbanBoard({ userRole }: KanbanBoardProps) {
  const { sprints, tasks, setTasks, loading, error, refetch, silentRefetch } = useBoardData();
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [liveOverId, setLiveOverId] = useState<string | null>(null);
  const [debugDrop, setDebugDrop] = useState<{ overId: string; targetSprint: number; insertBefore?: number; action: string; draggedLoc?: number; overLoc?: number; oldIdx?: number } | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  useEffect(() => {
    setDebugMode(localStorage.getItem("sb_debug_mode") === "true");
  }, []);
  const [filters, setFilters] = useState<ActiveFilters>({ locationIds: [], statuses: [] });
  const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState<{ sprintId: number; label: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error"; undoAction?: () => void } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canDrag = userRole === "sales" || userRole === "admin";

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Alle Standorte aus den Sprints extrahieren
  const locations: LocationInfo[] = useMemo(() => {
    const map = new Map<number, LocationInfo>();
    sprints.forEach((s) =>
      s.capacities.forEach((c) => {
        if (!map.has(c.location_id)) {
          map.set(c.location_id, {
            id: c.location_id,
            name: c.location_name,
            color: c.location_color,
          });
        }
      })
    );
    return Array.from(map.values());
  }, [sprints]);

  // Gefilterte Tasks pro Sprint
  const filteredTasksBySprint = useMemo(() => {
    const result = new Map<number, BoardTask[]>();
    sprints.forEach((s) => result.set(s.id, []));

    tasks.forEach((task) => {
      if (filters.locationIds.length > 0 && !filters.locationIds.includes(task.location.id)) return;
      if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) return;
      const list = result.get(task.sprint.id);
      if (list) list.push(task);
    });

    // Nach Priorität sortieren
    result.forEach((list) => list.sort((a, b) => a.priority - b.priority));
    return result;
  }, [tasks, sprints, filters]);

  function showToast(message: string, type: "success" | "error" = "success", undoAction?: () => void) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type, undoAction });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }

  // ─── Drag-Handlers ───────────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    const taskId = parseInt(id.replace("task-", ""));
    const task = tasks.find((t) => t.id === taskId);
    if (task) setActiveTask(task);
  }

  function handleDragOver(event: DragOverEvent) {
    setLiveOverId(event.over ? String(event.over.id) : null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    setLiveOverId(null);

    if (!over || !active) return;

    const overId = String(over.id);
    const taskId = parseInt(String(active.id).replace("task-", ""));
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === "completed") return;

    // Ziel-Sprint ermitteln
    let targetSprintId: number;
    let insertBeforeTaskId: number | undefined;

    if (overId.startsWith("sprint-")) {
      targetSprintId = parseInt(overId.replace("sprint-", ""));
    } else if (overId.startsWith("task-")) {
      const overTaskId = parseInt(overId.replace("task-", ""));
      const overTask = tasks.find((t) => t.id === overTaskId);
      if (!overTask) return;
      targetSprintId = overTask.sprint.id;
      insertBeforeTaskId = overTaskId;
    } else {
      return;
    }

    // Innerhalb desselben Sprints: Reihenfolge ändern
    if (targetSprintId === task.sprint.id) {
      const overTask = insertBeforeTaskId ? tasks.find(t => t.id === insertBeforeTaskId) : undefined;
      setDebugDrop({ overId, targetSprint: targetSprintId, insertBefore: insertBeforeTaskId, action: "reorder", draggedLoc: task.location.id, overLoc: overTask?.location.id });
      if (insertBeforeTaskId !== undefined) {
        await handleReorder(task, `task-${insertBeforeTaskId}`);
      }
      return;
    }

    // Sprint wechseln
    const targetSprint = sprints.find((s) => s.id === targetSprintId);
    if (!targetSprint || targetSprint.lock_status !== "open") {
      showToast("Ziel-Sprint ist gesperrt.", "error");
      return;
    }

    setDebugDrop({ overId, targetSprint: targetSprintId, insertBefore: insertBeforeTaskId, action: "cross-column" });
    await handleMoveToSprint(task, targetSprintId, targetSprint, insertBeforeTaskId);
  }

  async function handleReorder(task: BoardTask, overId: string | number) {
    // Alle Tasks im Sprint — Priorität ist ein gemeinsamer Sortierwert über alle Locations
    const allSprintTasks = filteredTasksBySprint.get(task.sprint.id) ?? [];

    const overTaskId = parseInt(String(overId).replace("task-", ""));
    const currentIdx = allSprintTasks.findIndex((t) => t.id === task.id);
    const overIdx = allSprintTasks.findIndex((t) => t.id === overTaskId);

    if (overIdx === -1 || currentIdx === -1 || currentIdx === overIdx) return;

    const reordered = arrayMove(allSprintTasks, currentIdx, overIdx);
    setDebugDrop(prev => prev ? { ...prev, oldIdx: overIdx, action: `reorder ✓ (${currentIdx}→${overIdx})` } : prev);

    // Prioritäten neu berechnen (1-basiert, global über alle Locations)
    const updates = reordered.map((t, i) => ({ id: t.id, priority: (i + 1) * 10 }));

    // Optimistisches Update im State
    setTasks((prev) =>
      prev.map((t) => {
        const upd = updates.find((u) => u.id === t.id);
        return upd ? { ...t, priority: upd.priority } : t;
      })
    );

    // API-Calls für alle verschobenen Tasks
    await Promise.all(
      updates.map(({ id, priority }) =>
        fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority }),
        })
      )
    );
  }

  async function handleMoveToSprint(task: BoardTask, targetSprintId: number, targetSprint: BoardSprint, insertBeforeTaskId?: number) {
    // Preview holen
    const previewRes = await fetch("/api/tasks/move/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: task.id, target_sprint_id: targetSprintId }),
    });

    if (!previewRes.ok) {
      showToast("Fehler beim Laden der Vorschau.", "error");
      return;
    }

    const preview: CascadePreview = await previewRes.json();

    if (preview.fits_without_cascade) {
      // Direkt verschieben ohne Dialog
      await executeMove(task.id, targetSprintId, task.sprint.id, insertBeforeTaskId);
    } else {
      // Cascade-Dialog zeigen
      setPendingMove({ task, targetSprintId, targetSprint, preview, insertBeforeTaskId });
    }
  }

  async function executeMove(taskId: number, targetSprintId: number, originalSprintId?: number, insertBeforeTaskId?: number) {
    setMoveLoading(true);

    const targetSprintInfo = sprints.find((s) => s.id === targetSprintId);
    const previousTasks = tasks;
    const movedTask = tasks.find((t) => t.id === taskId);

    // Gewünschte Reihenfolge im Ziel-Sprint/Standort berechnen
    // (basiert auf demselben Snapshot wie der Placeholder — konsistent & stabil)
    let priorityUpdates: { id: number; priority: number }[] = [];
    if (targetSprintInfo && movedTask) {
      // Alle Tasks im Ziel-Sprint — global sortiert, keine per-location Trennung
      const allTargetTasks = tasks
        .filter((t) => t.sprint.id === targetSprintId && t.id !== taskId)
        .sort((a, b) => a.priority - b.priority);

      const insertIdx = insertBeforeTaskId !== undefined
        ? allTargetTasks.findIndex((t) => t.id === insertBeforeTaskId)
        : -1;
      const finalInsertIdx = insertIdx !== -1 ? insertIdx : allTargetTasks.length;

      const ordered = [
        ...allTargetTasks.slice(0, finalInsertIdx),
        movedTask,
        ...allTargetTasks.slice(finalInsertIdx),
      ];

      priorityUpdates = ordered.map((t, i) => ({ id: t.id, priority: (i + 1) * 10 }));
    }

    // Optimistisches Update: Task sofort an korrekte Position schieben
    if (targetSprintInfo) {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === taskId) {
            const upd = priorityUpdates.find((u) => u.id === t.id);
            return {
              ...t,
              sprint: {
                id: targetSprintInfo.id,
                label: targetSprintInfo.label,
                year: targetSprintInfo.year,
                month: targetSprintInfo.month,
                lock_status: targetSprintInfo.lock_status,
              },
              priority: upd?.priority ?? 999999,
            };
          }
          // Prioritäten der anderen Tasks im Ziel-Sprint ebenfalls optimistisch aktualisieren
          const upd = priorityUpdates.find((u) => u.id === t.id);
          return upd ? { ...t, priority: upd.priority } : t;
        })
      );
    }

    try {
      const res = await fetch("/api/tasks/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, target_sprint_id: targetSprintId }),
      });

      if (!res.ok) {
        setTasks(previousTasks); // Rollback
        showToast("Verschiebung fehlgeschlagen.", "error");
        return;
      }

      // Vollständiger Reorder: alle betroffenen Tasks in richtiger Reihenfolge patchen
      // (robuster als Priority-Offset, funktioniert auch bei verdichteten Prioritäten)
      if (priorityUpdates.length > 0) {
        await Promise.all(
          priorityUpdates.map(({ id, priority }) =>
            fetch(`/api/tasks/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ priority }),
            }).catch(() => null)
          )
        );
      }

      // Stilles Refetch — kein Loading-Flackern, kein Scroll-Sprung
      await silentRefetch();

      // Undo-Aktion: nur wenn originalSprintId bekannt und verschieden
      const undoAction = originalSprintId && originalSprintId !== targetSprintId
        ? () => executeMove(taskId, originalSprintId)
        : undefined;

      showToast("Aufgabe erfolgreich verschoben.", "success", undoAction);
    } catch {
      setTasks(previousTasks); // Rollback
      showToast("Netzwerkfehler.", "error");
    } finally {
      setMoveLoading(false);
      setPendingMove(null);
    }
  }

  async function handleDeleteTask(taskId: number) {
    const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setSelectedTask(null);
      showToast("Aufgabe gelöscht.");
    } else {
      showToast("Aufgabe konnte nicht gelöscht werden.", "error");
    }
  }

  async function handleStatusChange(taskId: number, status: "open" | "in_progress" | "completed") {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)));
      if (status === "completed") showToast("Aufgabe abgeschlossen.");
    } else {
      showToast("Statusänderung fehlgeschlagen.", "error");
    }
  }

  const handleTaskClick = useCallback((task: BoardTask) => {
    setSelectedTask(task);
  }, []);

  async function handleLockChange(sprintId: number, newStatus: "open" | "soft_locked" | "hard_locked") {
    const sprint = sprints.find((s) => s.id === sprintId);
    const currentStatus = sprint?.lock_status;

    // hard_locked → open requires two steps (backend enforces single-step transitions)
    if (currentStatus === "hard_locked" && newStatus === "open") {
      const res1 = await fetch(`/api/sprints/${sprintId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lock_status: "soft_locked" }),
      });
      if (!res1.ok) {
        showToast("Lock-Status konnte nicht geändert werden.", "error");
        return;
      }
    }

    const res = await fetch(`/api/sprints/${sprintId}/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lock_status: newStatus }),
    });
    if (res.ok) {
      await silentRefetch();
    } else {
      showToast("Lock-Status konnte nicht geändert werden.", "error");
    }
  }

  async function handleArchiveConfirm() {
    if (!archiveConfirm) return;
    const res = await fetch(`/api/sprints/${archiveConfirm.sprintId}/archive`, { method: "POST" });
    setArchiveConfirm(null);
    if (res.ok) {
      await silentRefetch();
    } else {
      showToast("Sprint konnte nicht archiviert werden.", "error");
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex gap-5 p-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-72 shrink-0 h-96 bg-white rounded-xl border border-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 font-medium">{error}</p>
          <button onClick={refetch} className="mt-3 text-sm text-blue-600 hover:underline">
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter-Leiste */}
      <FilterBar locations={locations} filters={filters} onChange={setFilters} />

      {/* Debug-Leiste */}
      {debugMode && <div className="mx-6 mb-2 p-3 bg-gray-900 text-white rounded-lg text-xs font-mono flex gap-4 flex-wrap items-center">
        <span className="opacity-50">dragging:</span>
        <span>{activeTask ? `task-${activeTask.id} loc=${activeTask.location.id} prio=${activeTask.priority}` : "—"}</span>
        <span className="opacity-30">|</span>
        <span className="opacity-50">live over.id:</span>
        <span>{liveOverId ?? "—"}</span>
        {debugDrop && (
          <>
            <span className="opacity-30">|</span>
            <span className="opacity-50">action:</span>
            <span>{debugDrop.action}</span>
            <span className="opacity-30">|</span>
            <span className="opacity-50">drop over.id:</span>
            <span>{debugDrop.overId}</span>
            <span className="opacity-50">dragged loc:</span>
            <span>{debugDrop.draggedLoc ?? "?"}</span>
            <span className="opacity-50">over loc:</span>
            <span>{debugDrop.overLoc ?? "?"}</span>
            <span className="opacity-50">same loc?</span>
            <span>{debugDrop.draggedLoc === debugDrop.overLoc ? "✓" : "✗ MISMATCH"}</span>
            <span className="opacity-50">insertBefore:</span>
            <span>{debugDrop.insertBefore ?? "end"}</span>
            {debugDrop.oldIdx !== undefined && (
              <>
                <span className="opacity-50">oldIdx:</span>
                <span>{debugDrop.oldIdx}</span>
              </>
            )}
          </>
        )}
      </div>}

      {/* Board */}
      <DndContext
        sensors={sensors}
        modifiers={[restrictToWindowEdges]}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-5 p-6 min-w-max pb-8">
            {sprints.map((sprint) => (
              <SprintColumn
                key={sprint.id}
                sprint={sprint}
                tasks={filteredTasksBySprint.get(sprint.id) ?? []}
                onTaskClick={handleTaskClick}
                canDrag={canDrag}
                activeTask={activeTask}
                overId={liveOverId}
                isAdmin={userRole === "admin"}
                onLockChange={handleLockChange}
                onArchive={(sprintId) => {
                  const sprint = sprints.find((s) => s.id === sprintId);
                  if (sprint) setArchiveConfirm({ sprintId, label: sprint.label });
                }}
              />
            ))}
          </div>
        </div>

        <DragOverlay modifiers={[restrictToWindowEdges]}>
          {activeTask && <TaskCardOverlay task={activeTask} />}
        </DragOverlay>
      </DndContext>

      {/* Cascade-Bestätigungsdialog */}
      {pendingMove && (
        <CascadeConfirmDialog
          preview={pendingMove.preview}
          taskTitle={pendingMove.task.title}
          targetSprintLabel={pendingMove.targetSprint.label}
          onConfirm={() => executeMove(pendingMove.task.id, pendingMove.targetSprintId, pendingMove.task.sprint.id, pendingMove.insertBeforeTaskId)}
          onCancel={() => setPendingMove(null)}
          loading={moveLoading}
        />
      )}

      {/* Archivierungs-Bestätigungsdialog */}
      {archiveConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-100 p-6 max-w-sm w-full shadow-lg">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Sprint archivieren</h3>
            <p className="text-sm text-gray-600 mb-5">
              Möchtest du „{archiveConfirm.label}" wirklich archivieren? Der Sprint wird automatisch hard-gesperrt und verschwindet vom Board.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleArchiveConfirm}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-900 rounded-lg transition"
              >
                Archivieren
              </button>
              <button
                onClick={() => setArchiveConfirm(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task-Detail-Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          userRole={userRole}
          onClose={() => setSelectedTask(null)}
          onStatusChange={handleStatusChange}
          onDelete={userRole === "admin" ? handleDeleteTask : undefined}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`
          fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-medium
          animate-in slide-in-from-right-5 fade-in duration-300
          ${toast.type === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"}
        `}>
          <span>{toast.message}</span>
          {toast.undoAction && (
            <button
              onClick={() => {
                toast.undoAction?.();
                setToast(null);
                if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
              }}
              className="ml-1 underline text-white/80 hover:text-white text-xs font-semibold transition"
            >
              Rückgängig
            </button>
          )}
          <button
            onClick={() => { setToast(null); if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }}
            className="ml-1 text-white/60 hover:text-white transition"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
