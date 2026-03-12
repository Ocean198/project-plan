"use client";

import { useState, useEffect } from "react";

interface Location {
  id: number;
  name: string;
  color: string;
  default_action_points: number | null;
  is_active: boolean;
}

const PRESET_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
  "#F97316", "#6366F1",
];

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${value === c ? "border-gray-800 scale-110" : "border-transparent"}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded cursor-pointer border border-gray-200"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 px-2 py-1.5 text-sm border border-gray-200 rounded-lg font-mono"
          placeholder="#3B82F6"
        />
      </div>
    </div>
  );
}

function LocationForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Location>;
  onSave: (data: Partial<Location>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#3B82F6");
  const [ap, setAp] = useState(String(initial?.default_action_points ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSave({
        name,
        color,
        default_action_points: ap ? parseInt(ap) : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="z. B. Berlin"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Farbe</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Standard-SP-Budget (optional)</label>
        <input
          type="number"
          value={ap}
          onChange={(e) => setAp(e.target.value)}
          min={1}
          max={500}
          className="w-32 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="50"
        />
        <p className="text-xs text-gray-400 mt-1">Leer lassen = Wert aus DEFAULT_SP_BUDGET (.env)</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {saving ? "Speichern..." : "Speichern"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}

export function LocationsAdmin() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const all = await fetch("/api/locations?all=true").then((r) => r.json());
    // If API doesn't support ?all, fetch normally
    const res = await fetch("/api/locations");
    const data = await res.json();
    setLocations(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(data: Partial<Location>) {
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Fehler");
    setShowNew(false);
    await load();
  }

  async function handleUpdate(id: number, data: Partial<Location>) {
    const res = await fetch("/api/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Fehler");
    setEditId(null);
    await load();
  }

  async function handleToggleActive(loc: Location) {
    await fetch("/api/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: loc.id, is_active: !loc.is_active }),
    });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{locations.length} Standort{locations.length !== 1 ? "e" : ""}</p>
        <button
          onClick={() => { setShowNew(true); setEditId(null); }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Standort anlegen
        </button>
      </div>

      {showNew && (
        <div className="bg-white rounded-xl border border-blue-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Neuer Standort</h3>
          <LocationForm onSave={handleCreate} onCancel={() => setShowNew(false)} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Laden...</div>
        ) : locations.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">Noch keine Standorte angelegt.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {locations.map((loc) => (
              <div key={loc.id}>
                {editId === loc.id ? (
                  <div className="p-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">{loc.name} bearbeiten</h3>
                    <LocationForm
                      initial={loc}
                      onSave={(data) => handleUpdate(loc.id, data)}
                      onCancel={() => setEditId(null)}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: loc.color }} />
                      <div>
                        <span className={`text-sm font-medium ${loc.is_active ? "text-gray-900" : "text-gray-400"}`}>
                          {loc.name}
                        </span>
                        {!loc.is_active && (
                          <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Inaktiv</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {loc.default_action_points ? `${loc.default_action_points} SP Standard` : "SP aus .env"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEditId(loc.id); setShowNew(false); }}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleToggleActive(loc)}
                        className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition ${
                          loc.is_active
                            ? "text-orange-600 border-orange-200 hover:bg-orange-50"
                            : "text-green-600 border-green-200 hover:bg-green-50"
                        }`}
                      >
                        {loc.is_active ? "Deaktivieren" : "Aktivieren"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
