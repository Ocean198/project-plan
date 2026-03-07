"use client";

import { useState, useRef, useEffect } from "react";

const STORAGE_KEY = "sb_board_name";
const DEFAULT_NAME = "Kanban-Board";

export function BoardTitle() {
  const [name, setName] = useState(DEFAULT_NAME);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setName(stored);
  }, []);

  function startEdit() {
    setDraft(name);
    setEditing(true);
  }

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const trimmed = draft.trim() || DEFAULT_NAME;
    setName(trimmed);
    localStorage.setItem(STORAGE_KEY, trimmed);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className="text-xl font-bold text-gray-900 bg-transparent border-b-2 border-blue-500 outline-none w-full max-w-xs leading-tight"
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      title="Klicken zum Umbenennen"
      className="group flex items-center gap-1.5 text-xl font-bold text-gray-900 hover:text-gray-700 transition text-left"
    >
      {name}
      <svg
        className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition shrink-0 mt-0.5"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
  );
}
