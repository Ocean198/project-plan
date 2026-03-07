"use client";

import { useState, useEffect } from "react";

interface Location {
  id: number;
  name: string;
  color: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  role: "viewer" | "sales" | "admin";
  locale: "de" | "en";
  created_at: string;
  user_locations: { location: Location }[];
}

const ROLE_LABELS: Record<string, string> = { viewer: "Viewer", sales: "Sales", admin: "Admin" };
const ROLE_COLORS: Record<string, string> = {
  viewer: "bg-gray-100 text-gray-700",
  sales: "bg-blue-100 text-blue-700",
  admin: "bg-purple-100 text-purple-700",
};

function UserForm({
  initial,
  locations,
  onSave,
  onCancel,
}: {
  initial?: Partial<User>;
  locations: Location[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>(initial?.role ?? "viewer");
  const [locale, setLocale] = useState<string>(initial?.locale ?? "de");
  const [selectedLocs, setSelectedLocs] = useState<number[]>(
    initial?.user_locations?.map((ul) => ul.location.id) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleLocation(id: number) {
    setSelectedLocs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const data: Record<string, unknown> = { name, email, role, locale, location_ids: selectedLocs };
      if (password) data.password = password;
      await onSave(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Passwort {initial && <span className="font-normal text-gray-400">(leer = unverändert)</span>}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!initial}
            minLength={8}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Mind. 8 Zeichen"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rolle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="viewer">Viewer</option>
            <option value="sales">Sales</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sprache</label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Standort-Zuordnung
          <span className="ml-1 font-normal text-gray-400 text-xs">(Admins sehen alle automatisch)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {locations.map((loc) => {
            const selected = selectedLocs.includes(loc.id);
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => toggleLocation(loc.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition ${
                  selected ? "border-transparent text-white" : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
                style={selected ? { backgroundColor: loc.color, borderColor: loc.color } : {}}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: selected ? "rgba(255,255,255,0.6)" : loc.color }}
                />
                {loc.name}
              </button>
            );
          })}
        </div>
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

export function UsersAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const [usersData, locsData] = await Promise.all([
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/locations").then((r) => r.json()),
    ]);
    setUsers(Array.isArray(usersData) ? usersData : []);
    setLocations(Array.isArray(locsData) ? locsData : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(data: Record<string, unknown>) {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Fehler");
    setShowNew(false);
    await load();
  }

  async function handleUpdate(id: number, data: Record<string, unknown>) {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Fehler");
    setEditId(null);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{users.length} User</p>
        <button
          onClick={() => { setShowNew(true); setEditId(null); }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          User anlegen
        </button>
      </div>

      {showNew && (
        <div className="bg-white rounded-xl border border-blue-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Neuer User</h3>
          <UserForm locations={locations} onSave={handleCreate} onCancel={() => setShowNew(false)} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Laden...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">Noch keine User angelegt.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {users.map((user) => (
              <div key={user.id}>
                {editId === user.id ? (
                  <div className="p-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">{user.name} bearbeiten</h3>
                    <UserForm
                      initial={user}
                      locations={locations}
                      onSave={(data) => handleUpdate(user.id, data)}
                      onCancel={() => setEditId(null)}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{user.name}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role]}`}>
                            {ROLE_LABELS[user.role]}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {user.user_locations.slice(0, 4).map((ul) => (
                          <span
                            key={ul.location.id}
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: ul.location.color }}
                            title={ul.location.name}
                          />
                        ))}
                        {user.user_locations.length > 4 && (
                          <span className="text-xs text-gray-400">+{user.user_locations.length - 4}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => { setEditId(user.id); setShowNew(false); }}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                    >
                      Bearbeiten
                    </button>
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
