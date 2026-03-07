"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { BoardTask } from "@/types/board";

const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  completed: "Abgeschlossen",
};

const STATUS_COLORS: Record<string, string> = {
  open: "text-gray-500",
  in_progress: "text-blue-600",
  completed: "text-green-600",
};

interface GlobalSearchProps {
  onTaskSelect?: (task: BoardTask) => void;
}

export function GlobalSearch({ onTaskSelect }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BoardTask[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cmd/Ctrl+K öffnet die Suche
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  // Klick außerhalb schließt Suche
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced Suche
  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setSelectedIdx(-1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
    setOpen(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && selectedIdx >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIdx]);
    }
  }

  function handleSelect(task: BoardTask) {
    onTaskSelect?.(task);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  const showDropdown = open && query.length >= 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      {/* Suchfeld */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Suchen… (⌘K)"
          className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white
            placeholder:text-gray-400 transition"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden max-h-80 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-3 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-gray-400">Keine Ergebnisse für <strong>&ldquo;{query}&rdquo;</strong></p>
            </div>
          ) : (
            <ul className="py-1.5">
              {results.map((task, idx) => (
                <li key={task.id}>
                  <button
                    onClick={() => handleSelect(task)}
                    className={`
                      w-full text-left px-4 py-2.5 flex items-start gap-3 transition
                      ${idx === selectedIdx ? "bg-blue-50" : "hover:bg-gray-50"}
                    `}
                  >
                    {/* Standort-Farbpunkt */}
                    <span
                      className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                      style={{ backgroundColor: task.location.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                        {task.external_ticket_id && (
                          <span className="text-xs font-mono text-gray-400 shrink-0">{task.external_ticket_id}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{task.location.name}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{task.sprint.label}</span>
                        <span className="text-gray-300">·</span>
                        <span className={`text-xs font-medium ${STATUS_COLORS[task.status]}`}>
                          {STATUS_LABELS[task.status]}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
