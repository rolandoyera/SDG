import type { Subtask, Task, UserProfile } from "@/lib/types";

export type TaskView = "mine" | "high" | "all";

export const TASK_VIEWS: Array<{ id: TaskView; label: string }> = [
  { id: "mine", label: "My Tasks" },
  { id: "high", label: "High Priority" },
  // Admins only — for a member this would render the same list as My Tasks.
  { id: "all", label: "All Tasks" },
];

export const PRIORITY_LABELS: Record<Task["priority"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/**
 * Past due means due before today, not merely overdue by clock time — a task
 * due at 2:00pm shouldn't jump groups at 2:01 while you're still working on it.
 */
export function isPastDue(task: Task, now = new Date()): boolean {
  if (task.dueAt == null) return false;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return task.dueAt < startOfToday.getTime();
}

/** The two groups every view renders: past due first, then everything ahead. */
export function groupTasks(tasks: Task[], now = new Date()) {
  return {
    pastDue: tasks.filter((t) => isPastDue(t, now)),
    upcoming: tasks.filter((t) => !isPastDue(t, now)),
  };
}

export function filterTasksForView(
  tasks: Task[],
  view: TaskView,
  uid: string,
): Task[] {
  if (view === "all") return tasks;
  const mine = tasks.filter((t) => t.participantIds.includes(uid));
  return view === "high" ? mine.filter((t) => t.priority === "high") : mine;
}

/**
 * Everyone visibly on the task: its assignees unioned with its subtask
 * assignees. The creator is deliberately absent unless they're actually on
 * something — they're a participant (they can see it) but not shown as doing
 * the work. Subtasks default to the creator, so in practice they usually are.
 */
export function taskAvatarUids(task: Task): string[] {
  return [
    ...new Set([
      ...task.assigneeIds,
      ...task.subtasks.map((s) => s.assigneeId),
    ]),
  ];
}

export function subtaskProgress(subtasks: Subtask[]): string {
  return `${subtasks.filter((s) => s.done).length}/${subtasks.length}`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function userLabel(users: UserProfile[], uid: string): string {
  return users.find((u) => u.uid === uid)?.fullName ?? "Unknown";
}

/** "Today · 2:00pm" when a time was set, otherwise "Wed" / "Mar 4". */
export function formatDue(task: Task, now = new Date()): string {
  if (task.dueAt == null) return "No due date";
  const due = new Date(task.dueAt);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.round(
    (new Date(due).setHours(0, 0, 0, 0) - startOfToday.getTime()) / 86_400_000,
  );

  let day: string;
  if (days === 0) day = "Today";
  else if (days === 1) day = "Tomorrow";
  else if (days > 1 && days < 7)
    day = due.toLocaleDateString(undefined, { weekday: "short" });
  else
    day = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  if (!task.dueHasTime) return day;
  const time = due
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .toLowerCase()
    .replace(" ", "");
  return `${day} · ${time}`;
}
