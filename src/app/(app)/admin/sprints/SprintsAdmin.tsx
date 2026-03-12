"use client";

import { useState, useEffect, useRef } from "react";

type SprintMode = "monthly" | "weekly" | "numbered";

const SPRINT_MODE_LABELS: Record<SprintMode, string> = {
  monthly: "Monatlich",
  weekly: "Wöchentlich",
  numbered: "Nummeriert",
};

function SprintModeSelector() {
  const [mode, setMode] = useState<SprintMode>("monthly");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => { if (data.sprint_mode) setMode(data.sprint_mode as SprintMode); })
      .catch(() => {});
  }, []);

  async function handleChange(newMode: SprintMode) {
    if (newMode === mode) return;
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "sprint_mode", value: newMode }),
      });
      setMode(newMode);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-gray-800">Sprint-Benennung</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Bestimmt, wie neue Sprints benannt werden. Bestehende Sprints bleiben unverändert.
        </p>
      </div>
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 shrink-0">
        {(["monthly", "weekly", "numbered"] as SprintMode[]).map((m) => (
          <button
            key={m}
            onClick={() => handleChange(m)}
            disabled={saving}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              mode === m
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            } disabled:opacity-60`}
          >
            {SPRINT_MODE_LABELS[m]}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SprintCapacity {
  location_id: number;
  location_name: string;
  location_color: string;
  max_action_points: number;
  used_action_points: number;
}

interface Sprint {
  id: number;
  label: string;
  year: number;
  month: number;
  lock_status: "open" | "soft_locked" | "hard_locked";
  task_count: number;
  capacities: SprintCapacity[];
}

function APBudgetRow({
  cap,
  sprintId,
  onUpdate,
}: {
  cap: SprintCapacity;
  sprintId: number;
  onUpdate: () => void;
}) {
  const [value, setValue] = useState(String(cap.max_action_points));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (parseInt(value) === cap.max_action_points) return;
    setSaving(true);
    try {
      await fetch(`/api/sprints/${sprintId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: cap.location_id, max_action_points: parseInt(value) }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUpdate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cap.location_color }} />
        <span className="text-sm text-gray-700">{cap.location_name}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          min={0}
          max={999}
          className="w-20 px-2 py-1 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-400">SP</span>
        <button
          onClick={handleSave}
          disabled={saving || parseInt(value) === cap.max_action_points}
          className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-40 transition"
        >
          {saved ? "✓" : saving ? "..." : "Setzen"}
        </button>
      </div>
    </div>
  );
}

function SprintLabelEditor({
  sprint,
  onSaved,
}: {
  sprint: Sprint;
  onSaved: (newLabel: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sprint.label);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === sprint.label) {
      setEditing(false);
      setDraft(sprint.label);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/sprints/${sprint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed }),
      });
      if (res.ok) onSaved(trimmed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") { setEditing(false); setDraft(sprint.label); }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className="text-sm font-semibold text-gray-900 bg-transparent border-b-2 border-blue-500 outline-none w-48"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Klicken zum Umbenennen"
      className="group flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-gray-600 transition text-left"
    >
      {sprint.label}
      <svg
        className="w-3 h-3 text-gray-300 group-hover:text-gray-400 transition shrink-0"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
  );
}

export function SprintsAdmin() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Sprint | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const data = await fetch("/api/sprints").then((r) => r.json());
    setSprints(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function updateLabel(sprintId: number, newLabel: string) {
    setSprints((prev) => prev.map((s) => s.id === sprintId ? { ...s, label: newLabel } : s));
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await fetch(`/api/sprints/${deleteConfirm.id}`, { method: "DELETE" });
      await load();
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  }

  async function handleAddSprint() {
    setAdding(true);
    try {
      const res = await fetch("/api/sprints", { method: "POST" });
      if (res.ok) await load();
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">Laden...</div>;
  }

  return (
    <div className="space-y-3">
      <SprintModeSelector />

      {/* Lösch-Bestätigungsdialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-100 p-6 max-w-sm w-full shadow-lg">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Sprint löschen</h3>
            <p className="text-sm text-gray-600 mb-2">
              Möchtest du <span className="font-medium">„{deleteConfirm.label}"</span> wirklich löschen?
            </p>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-5">
              Diese Aktion kann nicht rückgängig gemacht werden. Alle Tasks in diesem Sprint werden automatisch in den nächsten Sprint verschoben.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition"
              >
                {deleting ? "Wird gelöscht..." : "Löschen"}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {sprints.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">Keine Sprints gefunden.</div>
      )}

      {sprints.map((sprint) => (
        <div key={sprint.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <SprintLabelEditor sprint={sprint} onSaved={(label) => updateLabel(sprint.id, label)} />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                {sprint.task_count} {sprint.task_count === 1 ? "Aufgabe" : "Aufgaben"}
              </span>
              <button
                onClick={() => setExpandedId(expandedId === sprint.id ? null : sprint.id)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                SP-Budget {expandedId === sprint.id ? "▲" : "▼"}
              </button>
              <button
                onClick={() => setDeleteConfirm(sprint)}
                title="Sprint löschen"
                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
          {expandedId === sprint.id && sprint.capacities.length > 0 && (
            <div className="border-t border-gray-50 px-5 py-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">SP-Budgets</p>
              <div className="divide-y divide-gray-50">
                {sprint.capacities.map((cap) => (
                  <APBudgetRow key={cap.location_id} cap={cap} sprintId={sprint.id} onUpdate={load} />
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Sprint hinzufügen */}
      <button
        onClick={handleAddSprint}
        disabled={adding}
        className="w-full flex items-center justify-center h-14 rounded-xl border-2 border-dashed border-gray-200 text-gray-300 hover:border-gray-300 hover:text-gray-400 transition disabled:opacity-50"
      >
        {adding ? (
          <span className="text-sm">Wird angelegt...</span>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Archivierte Sprints werden hier ausgeblendet. Um sie zu bearbeiten, müssen sie zuerst unter{" "}
        <span className="font-medium">Archiv → Rückgängig</span> wiederhergestellt werden.
      </p>
    </div>
  );
}
