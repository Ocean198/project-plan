"use client";

import { useState, useEffect } from "react";
import { PERMISSION_DEFS, DEFAULT_PERMISSIONS, type PermissionKey, type RolePermissions } from "@/lib/permissions";

const CONFIGURABLE_ROLES = [
  { key: "viewer", label: "Specialist" },
  { key: "sales", label: "Manager" },
];

const GROUPS = ["Board", "Sprints", "Settings"] as const;

export function PermissionsAdmin() {
  const [permissions, setPermissions] = useState<RolePermissions>({ ...DEFAULT_PERMISSIONS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/settings/permissions");
        if (res.ok) {
          const data = await res.json();
          setPermissions(data);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleToggle(permission: PermissionKey, role: string) {
    setPermissions((prev) => {
      const current = prev[permission] ?? [];
      const updated = current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role];
      return { ...prev, [permission]: updated };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(permissions),
      });
      if (res.ok) {
        showToast("Berechtigungen gespeichert.", "success");
      } else {
        showToast("Fehler beim Speichern.", "error");
      }
    } catch {
      showToast("Netzwerkfehler.", "error");
    } finally {
      setSaving(false);
    }
  }

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-400">Laden...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Berechtigungen für User und Sales konfigurieren. Admins haben immer alle Rechte.
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {saving ? "Speichern..." : "Speichern"}
        </button>
      </div>

      {GROUPS.map((group) => {
        const groupPermissions = (Object.entries(PERMISSION_DEFS) as [PermissionKey, { label: string; group: string }][])
          .filter(([, def]) => def.group === group);

        return (
          <div key={group} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">{group}</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Berechtigung
                  </th>
                  {CONFIGURABLE_ROLES.map((role) => (
                    <th key={role.key} className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-center w-24">
                      {role.label}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-center w-24">
                    Admin
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {groupPermissions.map(([key, def]) => (
                  <tr key={key} className="hover:bg-gray-50/50 transition">
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-gray-700">{def.label}</span>
                      <span className="ml-2 text-xs text-gray-400 font-mono">{key}</span>
                    </td>
                    {CONFIGURABLE_ROLES.map((role) => (
                      <td key={role.key} className="px-5 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={permissions[key]?.includes(role.key) ?? false}
                          onChange={() => handleToggle(key, role.key)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                    ))}
                    <td className="px-5 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={true}
                        disabled
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 opacity-50 cursor-not-allowed"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {toast && (
        <div className={`
          fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-medium
          animate-in slide-in-from-right-5 fade-in duration-300
          ${toast.type === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"}
        `}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
