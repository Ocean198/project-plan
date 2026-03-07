"use client";

import { useState, useEffect } from "react";

interface Webhook {
  id: number;
  name: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  last_status: "success" | "failed" | "pending" | null;
  last_triggered_at: string | null;
}

const ALL_EVENTS = [
  { value: "task_created", label: "Aufgabe erstellt" },
  { value: "task_completed", label: "Aufgabe abgeschlossen" },
  { value: "task_moved", label: "Aufgabe verschoben" },
  { value: "cascade_triggered", label: "Cascade ausgelöst" },
];

const STATUS_CONFIG = {
  success: { label: "Erfolgreich", cls: "text-green-600 bg-green-50" },
  failed: { label: "Fehlgeschlagen", cls: "text-red-600 bg-red-50" },
  pending: { label: "Ausstehend", cls: "text-yellow-600 bg-yellow-50" },
};

function WebhookForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Webhook>;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [secret, setSecret] = useState(initial?.secret ?? "");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(initial?.events ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleEvent(e: string) {
    setSelectedEvents((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]
    );
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (selectedEvents.length === 0) { setError("Mindestens ein Event auswählen."); return; }
    setError("");
    setSaving(true);
    try {
      await onSave({ name, url, secret, events: selectedEvents });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  function generateSecret() {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    setSecret(Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join(""));
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
            placeholder="z. B. Jira Callback"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://example.com/webhook"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Shared Secret</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            placeholder="Geheimschlüssel für HMAC-SHA256-Signatur"
          />
          <button
            type="button"
            onClick={generateSecret}
            className="px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition whitespace-nowrap"
          >
            Generieren
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">Wird im Header <code className="bg-gray-100 px-1 rounded">X-Ressourcify-Signature</code> als HMAC-SHA256 gesendet.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Abonnierte Events</label>
        <div className="flex flex-wrap gap-2">
          {ALL_EVENTS.map((ev) => {
            const active = selectedEvents.includes(ev.value);
            return (
              <button
                key={ev.value}
                type="button"
                onClick={() => toggleEvent(ev.value)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                  active
                    ? "bg-blue-600 text-white border-blue-600"
                    : "text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
              >
                {ev.label}
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

export function WebhooksAdmin() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message: string } | null>(null);

  async function load() {
    setLoading(true);
    const data = await fetch("/api/webhooks").then((r) => r.json());
    setWebhooks(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(data: Record<string, unknown>) {
    const res = await fetch("/api/webhooks", {
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
    const res = await fetch(`/api/webhooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Fehler");
    setEditId(null);
    await load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Webhook wirklich löschen?")) return;
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleToggleActive(webhook: Webhook) {
    await fetch(`/api/webhooks/${webhook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !webhook.is_active }),
    });
    await load();
  }

  async function handleTest(webhook: Webhook) {
    setTestingId(webhook.id);
    setTestResult(null);
    const res = await fetch(`/api/webhooks/${webhook.id}/test`, { method: "POST" });
    const json = await res.json();
    setTestResult({ id: webhook.id, success: json.success, message: json.message });
    setTestingId(null);
    await load();
  }

  function formatDate(iso: string | null) {
    if (!iso) return "–";
    return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{webhooks.length} Webhook{webhooks.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => { setShowNew(true); setEditId(null); }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Webhook anlegen
        </button>
      </div>

      {showNew && (
        <div className="bg-white rounded-xl border border-blue-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Neuer Webhook</h3>
          <WebhookForm onSave={handleCreate} onCancel={() => setShowNew(false)} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Laden...</div>
        ) : webhooks.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            Noch keine Webhooks konfiguriert.
            <p className="mt-1 text-xs">Webhooks ermöglichen die automatische Benachrichtigung externer Systeme bei Ereignissen.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {webhooks.map((wh) => (
              <div key={wh.id}>
                {editId === wh.id ? (
                  <div className="p-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">{wh.name} bearbeiten</h3>
                    <WebhookForm
                      initial={wh}
                      onSave={(data) => handleUpdate(wh.id, data)}
                      onCancel={() => setEditId(null)}
                    />
                  </div>
                ) : (
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-900">{wh.name}</span>
                          {!wh.is_active && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Inaktiv</span>
                          )}
                          {wh.last_status && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_CONFIG[wh.last_status].cls}`}>
                              {STATUS_CONFIG[wh.last_status].label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 font-mono truncate max-w-sm">{wh.url}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {wh.events.map((ev) => (
                            <span key={ev} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {ALL_EVENTS.find((e) => e.value === ev)?.label ?? ev}
                            </span>
                          ))}
                        </div>
                        {wh.last_triggered_at && (
                          <p className="text-xs text-gray-400 mt-1">Letzter Versand: {formatDate(wh.last_triggered_at)}</p>
                        )}
                        {testResult?.id === wh.id && (
                          <p className={`text-xs mt-1 ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                            {testResult.message}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 ml-4 shrink-0">
                        <button
                          onClick={() => handleTest(wh)}
                          disabled={testingId === wh.id}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
                        >
                          {testingId === wh.id ? "Sende..." : "Test"}
                        </button>
                        <button
                          onClick={() => { setEditId(wh.id); setShowNew(false); }}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => handleToggleActive(wh)}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                        >
                          {wh.is_active ? "Deaktivieren" : "Aktivieren"}
                        </button>
                        <button
                          onClick={() => handleDelete(wh.id)}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-100 rounded-lg hover:bg-red-50 transition"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-semibold mb-1">Webhook-Signatur verifizieren</p>
        <p>Jeder Webhook wird mit HMAC-SHA256 signiert. Überprüfe den Header <code className="bg-blue-100 px-1 rounded">X-Ressourcify-Signature</code> im Format <code className="bg-blue-100 px-1 rounded">sha256=&lt;hash&gt;</code>.</p>
        <p className="mt-1">Retry-Logik: 3 Versuche mit Backoff (1s, 5s, 30s).</p>
      </div>
    </div>
  );
}
