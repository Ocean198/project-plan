"use client";

import { useState } from "react";
import type { LocationInfo } from "@/types/board";

interface CreateTaskModalProps {
  locations: LocationInfo[];
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTaskModal({ locations, onClose, onCreated }: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationId, setLocationId] = useState<number>(locations[0]?.id ?? 0);
  const [actionPoints, setActionPoints] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !locationId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          location_id: locationId,
          action_points: actionPoints,
        }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error ?? "Fehler beim Erstellen der Aufgabe.");
      }
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedLocation = locations.find((l) => l.id === locationId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div
          className="h-1.5 rounded-t-2xl transition-colors duration-200"
          style={{ backgroundColor: selectedLocation?.color ?? "#6B7280" }}
        />

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Neue Aufgabe erstellen</h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Titel */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">Titel *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel der Aufgabe"
              required
              autoFocus
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-gray-300"
            />
          </div>

          {/* Standort + SP in einer Reihe */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">Standort *</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(parseInt(e.target.value))}
                required
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white cursor-pointer"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">Story Points</label>
              <select
                value={actionPoints}
                onChange={(e) => setActionPoints(parseInt(e.target.value))}
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white cursor-pointer"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((sp) => (
                  <option key={sp} value={sp}>{sp} SP</option>
                ))}
              </select>
            </div>
          </div>

          {/* Beschreibung */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">Beschreibung</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optionale Beschreibung..."
              rows={3}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-gray-300"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <p className="text-xs text-gray-400">
            Die Aufgabe wird automatisch in den frühestmöglichen Sprint eingereiht.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={!title.trim() || !locationId || submitting}
              className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Erstellen..." : "Aufgabe erstellen"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition"
            >
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
