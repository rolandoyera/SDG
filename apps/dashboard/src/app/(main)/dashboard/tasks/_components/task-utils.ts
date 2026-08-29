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

/** Least to most urgent — the order every priority picker renders in. */
export const PRIORITY_ORDER: Task["priority"][] = ["low", "medium", "high"];

/**
 * Gray, blue, red by urgency. The flag and the card's dot read from one map so
 * the three surfaces that show priority can't drift apart. Gray is the theme's
 * muted token so it tracks dark mode; blue and red are mid-tone and stay legible
 * against both backgrounds.
 */
export const PRIORITY_STYLES: Record<
  Task["priority"],
  { flag: string; dot: string }
> = {
  low: {
    flag: "fill-muted-foreground stroke-muted-foreground",
    dot: "bg-muted-foreground",
  },
  medium: { flag: "fill-blue-500 stroke-blue-500", dot: "bg-blue-500" },
  high: { flag: "fill-red-500 stroke-red-500", dot: "bg-red-500" },
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
  return users.find((u) => u.uid === uid)?.fullName ?? "Unknown user";
}

/**
 * Initials for an avatar. A uid we can't resolve renders "?" rather than being
 * run through initialsOf — "Unknown" would come out as a confident-looking "U"
 * that reads like a real person's initial.
 */
export function userInitials(users: UserProfile[], uid: string): string {
  const user = users.find((u) => u.uid === uid);
  return user ? initialsOf(user.fullName) : "?";
}

/**
 * The one due-date format: short month then day ("Aug 27"), with the time
 * appended when one was set ("Aug 27 · 2:30pm"). Deliberately absolute rather
 * than relative — "Wed" is ambiguous once a list spans more than a week, and
 * Past due / Upcoming already carries the relative meaning.
 */
export function formatDueParts(date: Date, hasTime: boolean): string {
  const day = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  if (!hasTime) return day;
  const time = date
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .toLowerCase()
    .replace(" ", "");
  return `${day} · ${time}`;
}

/** For a stored task. */
export function formatDue(task: Task): string {
  if (task.dueAt == null) return "No due date";
  return formatDueParts(new Date(task.dueAt), Boolean(task.dueHasTime));
}

/** For live form values (yyyy-mm-dd + HH:mm) rather than a saved task. */
export function formatDueInput(date: string, time: string): string {
  if (!date) return "No due date";
  return formatDueParts(new Date(`${date}T${time || "00:00"}`), time !== "");
}
