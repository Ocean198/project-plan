"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CapacityBar } from "./CapacityBar";
import { TaskCard } from "./TaskCard";
import type { BoardSprint, BoardTask } from "@/types/board";

function TaskPlaceholder({ task }: { task: BoardTask }) {
  return (
    <div className="relative rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/30 animate-in fade-in duration-100">
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl opacity-50"
        style={{ backgroundColor: task.location.color }}
      />
      <div className="pl-4 pr-3 py-3 opacity-40">
        <p className="text-sm font-medium text-gray-700 line-clamp-1 leading-snug">{task.title}</p>
      </div>
    </div>
  );
}

type LockStatus = "open" | "soft_locked" | "hard_locked";

const LOCK_NEXT: Record<LockStatus, LockStatus> = {
  open: "soft_locked",
  soft_locked: "hard_locked",
  hard_locked: "open",
};

const LOCK_TITLE: Record<LockStatus, string> = {
  open: "Offen – klicken für Soft-Lock",
  soft_locked: "Soft-gesperrt – klicken für Hard-Lock",
  hard_locked: "Hard-gesperrt – klicken zum Entsperren (→ Soft-Lock)",
};

function LockToggle({ status, onClick, isAdmin }: { status: LockStatus; onClick: () => void; isAdmin: boolean }) {
  const isOpen = status === "open";
  const isSoft = status === "soft_locked";
  const isHard = status === "hard_locked";

  return (
    <button
      onClick={isAdmin ? onClick : undefined}
      title={isAdmin ? LOCK_TITLE[status] : (isOpen ? "" : LOCK_TITLE[status])}
      className={`
        flex items-center justify-center w-7 h-7 rounded-lg border transition-all duration-150
        ${isAdmin ? "cursor-pointer hover:scale-110 active:scale-95" : "cursor-default"}
        ${isOpen
          ? "border-gray-200 bg-white text-gray-300 hover:border-gray-300 hover:text-gray-400"
          : isSoft
          ? "border-yellow-300 bg-yellow-50 text-yellow-500 hover:border-yellow-400"
          : "border-red-400 bg-red-500 text-white hover:bg-red-600"
        }
      `}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {isOpen ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        )}
      </svg>
    </button>
  );
}

interface SprintColumnProps {
  sprint: BoardSprint;
  tasks: BoardTask[];
  onTaskClick: (task: BoardTask) => void;
  canDrag: boolean;
  activeTask?: BoardTask | null;
  overId?: string | null;
  isAdmin?: boolean;
  onLockChange?: (sprintId: number, newStatus: LockStatus) => void;
  onArchive?: (sprintId: number) => void;
}

export function SprintColumn({ sprint, tasks, onTaskClick, canDrag, activeTask, overId, isAdmin, onLockChange, onArchive }: SprintColumnProps) {
  const isHardLocked = sprint.lock_status === "hard_locked";

  const { setNodeRef, isOver } = useDroppable({
    id: `sprint-${sprint.id}`,
    disabled: isHardLocked,
  });

  const sortableIds = tasks.map((t) => `task-${t.id}`);

  // Vorschau nur in der Spalte, über der der Cursor gerade ist
  const isOverThisColumn = overId === `sprint-${sprint.id}` || tasks.some((t) => overId === `task-${t.id}`);
  const isIncomingDrag = !!(activeTask && activeTask.sprint.id !== sprint.id && !isHardLocked && isOverThisColumn);

  return (
    <div
      className={`
        flex flex-col w-72 shrink-0 rounded-xl bg-white border transition-all duration-200
        ${isHardLocked ? "opacity-70 border-gray-200" : "border-gray-100"}
        ${isOver && !isHardLocked ? "ring-2 ring-blue-400 border-blue-200" : ""}
      `}
    >
      {/* Sprint-Header */}
      <div className={`px-4 pt-4 pb-3 border-b border-gray-100 ${isHardLocked ? "bg-gray-50 rounded-t-xl" : ""}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">{sprint.label}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {tasks.length} {tasks.length === 1 ? "Aufgabe" : "Aufgaben"}
            </span>
            <LockToggle
              status={sprint.lock_status as LockStatus}
              isAdmin={!!isAdmin}
              onClick={() => onLockChange?.(sprint.id, LOCK_NEXT[sprint.lock_status as LockStatus])}
            />
          </div>
        </div>

        {/* Kapazitätsbalken pro Standort */}
        <div className="space-y-2">
          {sprint.capacities.map((cap) => (
            <CapacityBar key={cap.location_id} capacity={cap} />
          ))}
        </div>
      </div>

      {/* Task-Liste */}
      <div
        ref={setNodeRef}
        className={`
          flex-1 p-3 space-y-2 min-h-24 transition-colors duration-150
          ${isOver && !isHardLocked ? "bg-blue-50/50" : ""}
        `}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <>
              {isIncomingDrag && activeTask
                ? <TaskPlaceholder task={activeTask} />
                : (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-300">
                    <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p className="text-xs">Keine Aufgaben</p>
                  </div>
                )
              }
            </>
          ) : (
            <>
              {tasks.map((task) => (
                <div key={task.id}>
                  {isIncomingDrag && activeTask && overId === `task-${task.id}` && (
                    <div className="mb-2"><TaskPlaceholder task={activeTask} /></div>
                  )}
                  <TaskCard
                    task={task}
                    onClick={onTaskClick}
                    isDraggingDisabled={!canDrag || isHardLocked}
                  />
                </div>
              ))}
              {isIncomingDrag && activeTask && overId === `sprint-${sprint.id}` && (
                <div className="mt-2"><TaskPlaceholder task={activeTask} /></div>
              )}
            </>
          )}
        </SortableContext>
      </div>

      {/* Archivieren-Button (nur für Admins) */}
      {isAdmin && (
        <div className="px-3 pb-3">
          <button
            onClick={() => onArchive?.(sprint.id)}
            className="w-full py-1.5 text-xs text-gray-300 hover:text-gray-500 hover:bg-gray-50 rounded-lg transition border border-dashed border-transparent hover:border-gray-200"
          >
            Archivieren
          </button>
        </div>
      )}
    </div>
  );
}
