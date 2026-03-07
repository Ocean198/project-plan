"use client";

import { useState, useEffect, useCallback } from "react";
import type { BoardTask, BoardSprint } from "@/types/board";

export function useBoardData() {
  const [sprints, setSprints] = useState<BoardSprint[]>([]);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sprintsRes, tasksRes] = await Promise.all([
        fetch("/api/sprints"),
        fetch("/api/tasks?limit=500"),
      ]);

      if (!sprintsRes.ok || !tasksRes.ok) throw new Error("Fehler beim Laden der Daten.");

      const sprintsData = await sprintsRes.json();
      const tasksData = await tasksRes.json();

      setSprints(sprintsData);
      setTasks(tasksData.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  // Stilles Refetch ohne Loading-State — kein Flackern/Skeleton
  const silentFetch = useCallback(async () => {
    try {
      const [sprintsRes, tasksRes] = await Promise.all([
        fetch("/api/sprints"),
        fetch("/api/tasks?limit=500"),
      ]);
      if (!sprintsRes.ok || !tasksRes.ok) return;
      const sprintsData = await sprintsRes.json();
      const tasksData = await tasksRes.json();
      setSprints(sprintsData);
      setTasks(tasksData.tasks);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { sprints, tasks, setTasks, loading, error, refetch: fetchData, silentRefetch: silentFetch };
}
