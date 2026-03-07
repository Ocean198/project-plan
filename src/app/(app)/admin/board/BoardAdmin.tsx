"use client";

import { useState, useEffect } from "react";

const DEBUG_MODE_KEY = "sb_debug_mode";

export function BoardAdmin() {
  const [debugMode, setDebugMode] = useState(false);

  useEffect(() => {
    setDebugMode(localStorage.getItem(DEBUG_MODE_KEY) === "true");
  }, []);

  function toggle() {
    const next = !debugMode;
    setDebugMode(next);
    localStorage.setItem(DEBUG_MODE_KEY, String(next));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Board-Einstellungen</h2>
        <p className="text-sm text-gray-400 mt-0.5">Entwickler-Optionen für das Kanban-Board</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-100">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-medium text-gray-800">Debug-Mode</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Zeigt eine Debug-Leiste mit DnD-Informationen im Board an
            </p>
          </div>
          <input
            type="checkbox"
            checked={debugMode}
            onChange={toggle}
            className="h-4 w-4 cursor-pointer accent-gray-800"
          />
        </div>
      </div>
    </div>
  );
}
