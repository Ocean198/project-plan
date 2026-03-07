export interface LocationInfo {
  id: number;
  name: string;
  color: string;
}

export interface SprintInfo {
  id: number;
  label: string;
  year: number;
  month: number;
  lock_status: "open" | "soft_locked" | "hard_locked";
}

export interface BoardTask {
  id: number;
  title: string;
  description: string | null;
  action_points: 1 | 2 | 3;
  status: "open" | "in_progress" | "completed";
  priority: number;
  external_ticket_id: string | null;
  completed_at: string | null;
  created_at: string;
  location: LocationInfo;
  sprint: SprintInfo;
  creator: { id: number; name: string };
}

export interface SprintCapacityInfo {
  location_id: number;
  location_name: string;
  location_color: string;
  max_action_points: number;
  used_action_points: number;
}

export interface BoardSprint {
  id: number;
  year: number;
  month: number;
  label: string;
  lock_status: "open" | "soft_locked" | "hard_locked";
  capacities: SprintCapacityInfo[];
}

export interface ActiveFilters {
  locationIds: number[];
  statuses: Array<"open" | "in_progress" | "completed">;
}

export interface CascadeAffectedTask {
  id: number;
  title: string;
  external_ticket_id: string | null;
  action_points: number;
  current_sprint_label: string;
  target_sprint_label: string;
}

export interface CascadePreview {
  fits_without_cascade: boolean;
  affected_tasks: CascadeAffectedTask[];
  sprints_affected: number;
  new_sprints_created: number;
}
