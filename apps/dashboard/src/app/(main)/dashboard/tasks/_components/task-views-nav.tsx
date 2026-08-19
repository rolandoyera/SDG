"use client";

import { Flag, Inbox, User } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";

import { type TaskView, filterTasksForView } from "./task-utils";

const VIEW_ICONS: Record<TaskView, typeof User> = {
  mine: User,
  high: Flag,
  all: Inbox,
};

interface TaskViewsNavProps {
  tasks: Task[];
  uid: string;
  /** All Tasks is hidden for members: it would render the same list as My Tasks. */
  isAdmin: boolean;
  view: TaskView;
  onViewChange: (view: TaskView) => void;
  projectFilter: string | null;
  onProjectFilterChange: (projectId: string | null) => void;
}

export function TaskViewsNav({
  tasks,
  uid,
  isAdmin,
  view,
  onViewChange,
  projectFilter,
  onProjectFilterChange,
}: TaskViewsNavProps) {
  const views: TaskView[] = isAdmin
    ? ["mine", "high", "all"]
    : ["mine", "high"];

  // Counts come off the tasks already in memory — the sidebar costs no reads.
  const visible = filterTasksForView(tasks, view, uid);
  const projectCounts = new Map<string, { label: string; count: number }>();
  for (const task of visible) {
    if (task.attachment?.type !== "project") continue;
    const entry = projectCounts.get(task.attachment.id);
    projectCounts.set(task.attachment.id, {
      label: task.attachment.label,
      count: (entry?.count ?? 0) + 1,
    });
  }

  return (
    <nav className="w-full shrink-0 space-y-6 p-4 lg:w-56">
      <div>
        <p className="mb-2 px-2 text-muted-foreground text-xs uppercase tracking-wide">
          Views
        </p>
        <ul className="space-y-1">
          {views.map((id) => {
            const Icon = VIEW_ICONS[id];
            const count = filterTasksForView(tasks, id, uid).length;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onViewChange(id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm",
                    view === id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  <Icon className="size-4" />
                  <span className="flex-1 text-left">
                    {id === "mine"
                      ? "My Tasks"
                      : id === "high"
                        ? "High Priority"
                        : "All Tasks"}
                  </span>
                  <span className="tabular-nums">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {projectCounts.size > 0 && (
        <div>
          <p className="mb-2 px-2 text-muted-foreground text-xs uppercase tracking-wide">
            Projects
          </p>
          <ul className="space-y-1">
            {[...projectCounts.entries()].map(
              ([projectId, { label, count }]) => (
                <li key={projectId}>
                  <button
                    type="button"
                    onClick={() =>
                      onProjectFilterChange(
                        projectFilter === projectId ? null : projectId,
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm",
                      projectFilter === projectId
                        ? "bg-accent"
                        : "hover:bg-accent",
                    )}
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="flex-1 truncate text-left">{label}</span>
                    <span className="tabular-nums">{count}</span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </nav>
  );
}
