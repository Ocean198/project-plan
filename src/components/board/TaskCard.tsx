"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardTask } from "@/types/board";

const AP_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: "bg-green-100", text: "text-green-700", label: "1 AP" },
  2: { bg: "bg-yellow-100", text: "text-yellow-700", label: "2 AP" },
  3: { bg: "bg-red-100", text: "text-red-700", label: "3 AP" },
};

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  open: { label: "Offen", classes: "bg-gray-100 text-gray-500" },
  in_progress: { label: "In Bearbeitung", classes: "bg-blue-100 text-blue-700" },
  completed: { label: "Abgeschlossen", classes: "bg-green-100 text-green-700" },
};

interface TaskCardProps {
  task: BoardTask;
  onClick: (task: BoardTask) => void;
  isDraggingDisabled: boolean;
}

export function TaskCard({ task, onClick, isDraggingDisabled }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `task-${task.id}`,
    disabled: isDraggingDisabled || task.status === "completed" || task.status === "in_progress",
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const ap = AP_COLORS[task.action_points] ?? AP_COLORS[1];
  const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.open;
  const isCompleted = task.status === "completed";
  const isInProgress = task.status === "in_progress";
  const isLocked = isCompleted || isInProgress;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative bg-white rounded-xl shadow-sm
        transition-all duration-150
        ${isDragging
          ? "opacity-30 shadow-none border border-gray-100"
          : isCompleted
            ? "opacity-55 border border-gray-100"
            : isInProgress
              ? "border border-blue-100"
              : "border border-gray-100 hover:-translate-y-0.5 hover:shadow-md cursor-grab active:cursor-grabbing"
        }
      `}
      onClick={() => onClick(task)}
      {...attributes}
      {...(isDraggingDisabled || isLocked ? {} : listeners)}
    >
      {/* Standort-Farbstreifen links */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: task.location.color }}
      />
      <div className="pl-4 pr-3 py-3">
        {/* Titel */}
        <p className={`text-sm font-medium text-gray-900 line-clamp-2 leading-snug ${isCompleted ? "line-through text-gray-400" : ""}`}>
          {task.title}
        </p>

        {/* Badges */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {/* Standort-Chip */}
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium text-white"
            style={{ backgroundColor: task.location.color }}
          >
            {task.location.name}
          </span>

          {/* AP-Badge */}
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${ap.bg} ${ap.text}`}>
            {ap.label}
          </span>

          {/* Status-Badge */}
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${statusCfg.classes}`}>
            {statusCfg.label}
          </span>
        </div>

        {/* Externe Ticket-ID */}
        {task.external_ticket_id && (
          <div className="mt-2">
            <span className="text-xs text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
              {task.external_ticket_id}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Phantom-Karte während Drag & Drop */
export function TaskCardOverlay({ task }: { task: BoardTask }) {
  const ap = AP_COLORS[task.action_points] ?? AP_COLORS[1];

  return (
    <div className="relative bg-white rounded-xl border border-blue-300 shadow-xl rotate-2 w-64">
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: task.location.color }}
      />
      <div className="pl-4 pr-3 py-3">
        <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{task.title}</p>
        <div className="mt-2 flex items-center gap-1.5">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${ap.bg} ${ap.text}`}>
            {ap.label}
          </span>
        </div>
      </div>
    </div>
  );
}
