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
import { CreateTaskModal } from "./CreateTaskModal";
import type { BoardTask, BoardSprint, ActiveFilters, CascadePreview, LocationInfo } from "@/types/board";
import { can, type RolePermissions } from "@/lib/permissions";

interface KanbanBoardProps {
  userRole: string;
  permissions: RolePermissions;
  currentUser: { id: number; name: string };
}

interface PendingMove {
  task: BoardTask;
  targetSprintId: number;
  targetSprint: BoardSprint;
  preview: CascadePreview;
  insertBeforeTaskId?: number;
}

export function KanbanBoard({ userRole, permissions, currentUser }: KanbanBoardProps) {
  const { sprints, tasks, setTasks, loading, error, refetch, silentRefetch } = useBoardData();
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [liveOverId, setLiveOverId] = useState<string | null>(null);
  const [debugDrop, setDebugDrop] = useState<{ overId: string; targetSprint: number; insertBefore?: number; action: string; draggedLoc?: number; overLoc?: number; oldIdx?: number } | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [debugEvents, setDebugEvents] = useState<string[]>([]);
  useEffect(() => {
    setDebugMode(localStorage.getItem("sb_debug_mode") === "true");
  }, []);

  function dbg(msg: string) {
    const ts = new Date().toISOString().slice(11, 23);
    const line = `[${ts}] ${msg}`;
    console.log("[DEBUG]", line);
    setDebugEvents((prev) => [line, ...prev].slice(0, 30));
  }
  const [filters, setFilters] = useState<ActiveFilters>({ locationIds: [], statuses: [] });
  const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState<{ sprintId: number; label: string } | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error"; undoAction?: () => void } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canDrag = can(userRole, 'board.move_tasks', permissions);

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

  // used_action_points live aus dem Task-State berechnen (immer synchron mit Optimistic-Updates)
  const sprintsWithLiveCapacity = useMemo(() => {
    const usedBySprintLoc = new Map<string, number>();
    tasks.forEach((task) => {
      const key = `${task.sprint.id}:${task.location.id}`;
      usedBySprintLoc.set(key, (usedBySprintLoc.get(key) ?? 0) + task.action_points);
    });
    return sprints.map((sprint) => ({
      ...sprint,
      capacities: sprint.capacities.map((cap) => ({
        ...cap,
        used_action_points: usedBySprintLoc.get(`${sprint.id}:${cap.location_id}`) ?? 0,
      })),
    }));
  }, [sprints, tasks]);

  // Gefilterte Tasks pro Sprint
  const filteredTasksBySprint = useMemo(() => {
    const result = new Map<number, BoardTask[]>();
    sprintsWithLiveCapacity.forEach((s) => result.set(s.id, []));

    tasks.forEach((task) => {
      if (filters.locationIds.length > 0 && !filters.locationIds.includes(task.location.id)) return;
      if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) return;
      const list = result.get(task.sprint.id);
      if (list) list.push(task);
    });

    // Nach Priorität sortieren
    result.forEach((list) => list.sort((a, b) => a.priority - b.priority));
    return result;
  }, [tasks, sprintsWithLiveCapacity, filters]);

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
      if (overTask.status === "in_progress" || overTask.status === "completed") {
        // Hinter dem gesperrten Task einordnen: nächsten freien Task suchen
        const sprintTasks = tasks
          .filter((t) => t.sprint.id === overTask.sprint.id)
          .sort((a, b) => a.priority - b.priority);
        const overIdx = sprintTasks.findIndex((t) => t.id === overTaskId);
        const nextFree = sprintTasks.slice(overIdx + 1).find(
          (t) => t.status !== "in_progress" && t.status !== "completed"
        );
        insertBeforeTaskId = nextFree?.id; // undefined = ans Ende
      } else {
        insertBeforeTaskId = overTaskId;
      }
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

    if (debugMode && movedTask) {
      const fromSp = sprints.find((s) => s.id === movedTask.sprint.id);
      const toSp = targetSprintInfo;
      const fromCap = fromSp?.capacities.find((c) => c.location_id === movedTask.location.id);
      const toCap = toSp?.capacities.find((c) => c.location_id === movedTask.location.id);
      dbg(`MOVE START task#${taskId} (${movedTask.action_points}SP, loc#${movedTask.location.id})`);
      dbg(`  FROM sprint#${movedTask.sprint.id} "${fromSp?.label}" server-cap: ${fromCap?.used_action_points ?? "?"}/${fromCap?.max_action_points ?? "?"}`);
      dbg(`  TO   sprint#${targetSprintId} "${toSp?.label}" server-cap: ${toCap?.used_action_points ?? "?"}/${toCap?.max_action_points ?? "?"}`);
    }

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
        if (debugMode) dbg(`MOVE FAILED status=${res.status}`);
        showToast("Verschiebung fehlgeschlagen.", "error");
        return;
      }

      // Cascaded Tasks vom Server ermitteln — deren Prioritäten nicht überschreiben
      const moveResult = await res.json();
      if (debugMode) {
        dbg(`SERVER RESPONSE: moved task#${moveResult.moved_task?.id} → sprint#${moveResult.moved_task?.sprint_id}`);
        if (moveResult.cascaded_tasks?.length > 0) {
          moveResult.cascaded_tasks.forEach((ct: { id: number; from_sprint_id: number; to_sprint_id: number }) =>
            dbg(`  CASCADE task#${ct.id}: sprint#${ct.from_sprint_id} → sprint#${ct.to_sprint_id}`)
          );
        } else {
          dbg(`  no cascade`);
        }
      }
      const cascadedIds = new Set<number>(
        (moveResult.cascaded_tasks ?? []).map((t: { id: number }) => t.id)
      );

      // Vollständiger Reorder: alle betroffenen Tasks in richtiger Reihenfolge patchen
      // (robuster als Priority-Offset, funktioniert auch bei verdichteten Prioritäten)
      // Cascaded Tasks ausschließen — der Server hat ihre Position bereits korrekt gesetzt
      const filteredUpdates = priorityUpdates.filter(({ id }) => !cascadedIds.has(id));
      if (filteredUpdates.length > 0) {
        await Promise.all(
          filteredUpdates.map(({ id, priority }) =>
            fetch(`/api/tasks/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ priority }),
            }).catch(() => null)
          )
        );
      }

      // Stilles Refetch — kein Loading-Flackern, kein Scroll-Sprung
      if (debugMode) dbg(`silentRefetch START`);
      await silentRefetch();
      if (debugMode) dbg(`silentRefetch DONE`);

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

  // Listen for task selection from global search
  useEffect(() => {
    function handleOpenTask(e: Event) {
      const taskId = (e as CustomEvent<{ taskId: number }>).detail.taskId;
      const task = tasks.find((t) => t.id === taskId);
      if (task) setSelectedTask(task);
    }
    window.addEventListener("sprintboard:openTask", handleOpenTask);
    return () => window.removeEventListener("sprintboard:openTask", handleOpenTask);
  }, [tasks]);

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
      {/* Filter-Leiste + Aufgabe erstellen */}
      <div className="flex items-center gap-3 pr-6">
        <div className="flex-1">
          <FilterBar locations={locations} filters={filters} onChange={setFilters} />
        </div>
        {can(userRole, 'board.create_tasks', permissions) && (
          <button
            onClick={() => setShowCreateTask(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Aufgabe erstellen
          </button>
        )}
      </div>

      {/* Debug-Panel */}
      {debugMode && (
        <div className="mx-6 mb-2 space-y-2 text-xs font-mono">
          {/* Drag-Info */}
          <div className="p-2 bg-gray-900 text-white rounded-lg flex gap-4 flex-wrap items-center">
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
                <span className="opacity-50">drop.overId:</span>
                <span>{debugDrop.overId}</span>
                <span className="opacity-50">insertBefore:</span>
                <span>{debugDrop.insertBefore ?? "end"}</span>
              </>
            )}
            <button
              onClick={() => setDebugEvents([])}
              className="ml-auto px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            >
              clear log
            </button>
          </div>

          {/* Kapazitäts-Tabelle (live vs. server) */}
          <div className="p-2 bg-gray-800 text-white rounded-lg overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left pr-3">Sprint</th>
                  <th className="text-left pr-3">Loc</th>
                  <th className="text-right pr-3">live used</th>
                  <th className="text-right pr-3">srv used</th>
                  <th className="text-right pr-3">max</th>
                  <th className="text-right pr-3">tasks</th>
                </tr>
              </thead>
              <tbody>
                {sprintsWithLiveCapacity.map((sp) =>
                  sp.capacities.map((cap) => {
                    const serverCap = sprints.find((s) => s.id === sp.id)?.capacities.find((c) => c.location_id === cap.location_id);
                    const diff = cap.used_action_points !== (serverCap?.used_action_points ?? 0);
                    const taskCount = tasks.filter((t) => t.sprint.id === sp.id && t.location.id === cap.location_id).length;
                    return (
                      <tr key={`${sp.id}-${cap.location_id}`} className={diff ? "text-yellow-300" : "text-gray-300"}>
                        <td className="pr-3">{sp.label}</td>
                        <td className="pr-3">#{cap.location_id}</td>
                        <td className="text-right pr-3 font-bold">{cap.used_action_points}</td>
                        <td className="text-right pr-3 opacity-60">{serverCap?.used_action_points ?? "?"}</td>
                        <td className="text-right pr-3">{cap.max_action_points}</td>
                        <td className="text-right pr-3">{taskCount}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Event-Log */}
          {debugEvents.length > 0 && (
            <div className="p-2 bg-gray-950 text-green-400 rounded-lg max-h-48 overflow-y-auto">
              {debugEvents.map((e, i) => (
                <div key={i} className="leading-relaxed">{e}</div>
              ))}
            </div>
          )}
        </div>
      )}

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
            {sprintsWithLiveCapacity.map((sprint) => (
              <SprintColumn
                key={sprint.id}
                sprint={sprint}
                tasks={filteredTasksBySprint.get(sprint.id) ?? []}
                onTaskClick={handleTaskClick}
                canDrag={canDrag}
                activeTask={activeTask}
                overId={liveOverId}
                canLock={can(userRole, 'sprints.lock_unlock', permissions)}
                canArchive={can(userRole, 'sprints.archive', permissions)}
                onLockChange={handleLockChange}
                onArchive={(sprintId) => {
                  const sprint = sprints.find((s) => s.id === sprintId);
                  if (sprint) setArchiveConfirm({ sprintId, label: sprint.label });
                }}
              />
            ))}
          </div>
        </div>

        <DragOverlay modifiers={[restrictToWindowEdges]} dropAnimation={null}>
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
          permissions={permissions}
          locations={locations}
          currentUser={currentUser}
          onClose={() => setSelectedTask(null)}
          onStatusChange={handleStatusChange}
          onDelete={can(userRole, 'board.delete_tasks', permissions) ? handleDeleteTask : undefined}
          onTaskUpdated={() => silentRefetch()}
        />
      )}

      {/* Aufgabe erstellen Modal */}
      {showCreateTask && (
        <CreateTaskModal
          locations={locations}
          onClose={() => setShowCreateTask(false)}
          onCreated={() => silentRefetch()}
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
