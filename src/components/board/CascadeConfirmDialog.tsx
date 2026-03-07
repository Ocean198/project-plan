"use client";

import { useState } from "react";
import type { CascadePreview } from "@/types/board";

interface CascadeConfirmDialogProps {
  preview: CascadePreview;
  taskTitle: string;
  targetSprintLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function CascadeConfirmDialog({
  preview,
  taskTitle,
  targetSprintLabel,
  onConfirm,
  onCancel,
  loading,
}: CascadeConfirmDialogProps) {
  const [expanded, setExpanded] = useState(false);
  const count = preview.affected_tasks.length;

  // Betroffene Tasks nach Ziel-Sprint gruppieren
  const grouped = preview.affected_tasks.reduce<Record<string, typeof preview.affected_tasks>>(
    (acc, t) => {
      const key = t.target_sprint_label;
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    },
    {}
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Verschiebung bestätigen</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="font-medium text-gray-700">&ldquo;{taskTitle}&rdquo;</span>{" "}
                wird in <span className="font-medium text-gray-700">{targetSprintLabel}</span> verschoben.
              </p>
            </div>
          </div>
        </div>

        {/* Cascade-Hinweis */}
        <div className="mx-6 mb-4 px-4 py-3 bg-orange-50 rounded-xl border border-orange-100">
          <p className="text-sm text-orange-800">
            Diese Aktion verschiebt{" "}
            <strong>{count} weitere {count === 1 ? "Aufgabe" : "Aufgaben"}</strong>{" "}
            in {preview.sprints_affected === 1 ? "den nächsten Monat" : `${preview.sprints_affected} Monate`}.
            {preview.new_sprints_created > 0 && (
              <> Es {preview.new_sprints_created === 1 ? "wird" : "werden"} automatisch{" "}
              {preview.new_sprints_created} neuer Sprint angelegt.</>
            )}
          </p>

          {/* Aufklappbare Aufgabenliste */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-2 text-xs font-medium text-orange-700 hover:text-orange-900 transition"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Betroffene Aufgaben {expanded ? "ausblenden" : "anzeigen"}
          </button>

          {expanded && (
            <div className="mt-2 space-y-3">
              {Object.entries(grouped).map(([sprintLabel, tasks]) => (
                <div key={sprintLabel}>
                  <p className="text-xs font-semibold text-orange-700 mb-1">→ {sprintLabel}</p>
                  <div className="space-y-1">
                    {tasks.map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-xs text-orange-800 bg-white/60 rounded-lg px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {t.external_ticket_id && (
                            <span className="font-mono text-orange-500 shrink-0">{t.external_ticket_id}</span>
                          )}
                          <span className="truncate">{t.title}</span>
                        </div>
                        <span className="shrink-0 ml-2 font-semibold">{t.action_points} AP</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium text-white transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            Verschieben bestätigen
          </button>
        </div>
      </div>
    </div>
  );
}
