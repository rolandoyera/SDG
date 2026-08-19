"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Task, UserProfile } from "@/lib/types";

import {
  PRIORITY_LABELS,
  initialsOf,
  subtaskProgress,
  taskAvatarUids,
  userLabel,
} from "./task-utils";

/** Dots come from theme tokens; only priority is colour-coded, per the design. */
const PRIORITY_DOT: Record<Task["priority"], string> = {
  low: "bg-muted-foreground",
  medium: "bg-chart-1",
  high: "bg-destructive",
};

interface TaskCardProps {
  task: Task;
  users: UserProfile[];
  selected: boolean;
  onSelect: () => void;
  onToggleComplete: () => void;
  onToggleSubtask: (subtaskId: string) => void;
}

export function TaskCard({
  task,
  users,
  selected,
  onSelect,
  onToggleComplete,
  onToggleSubtask,
}: TaskCardProps) {
  const avatarUids = taskAvatarUids(task);

  return (
    // Selection lives on the inner button, not this wrapper: one focusable
    // control, and no click handler on a div the keyboard can't reach.
    <div
      className={cn(
        "rounded border bg-card transition-colors",
        selected ? "border-primary" : "hover:border-muted-foreground/30",
      )}>
      <div className="flex items-start gap-3 p-4">
        <Checkbox
          checked={task.completed}
          onCheckedChange={onToggleComplete}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Mark "${task.title}" complete`}
          className="mt-0.5"
        />
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left">
          <span className="font-medium text-sm">{task.title}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            {task.attachment && (
              <span className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-0.5">
                <span className="size-1.5 rounded-full bg-primary" />
                {task.attachment.label}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className="tabular-nums">
                {subtaskProgress(task.subtasks)}
              </span>
            )}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase">
            <span
              className={cn(
                "size-1.5 rounded-full",
                PRIORITY_DOT[task.priority],
              )}
            />
            {PRIORITY_LABELS[task.priority]}
          </span>
          <div className="-space-x-2 flex">
            {avatarUids.slice(0, 3).map((uid) => (
              <Avatar key={uid} className="size-6 border-2 border-card">
                <AvatarFallback className="text-[10px]">
                  {initialsOf(userLabel(users, uid))}
                </AvatarFallback>
              </Avatar>
            ))}
            {avatarUids.length > 3 && (
              <Avatar className="size-6 border-2 border-card">
                <AvatarFallback className="text-[10px]">
                  +{avatarUids.length - 3}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        </div>
      </div>

      {/* Subtasks expand only on the selected card — the design keeps the rest of
          the list scannable and shows a counter instead. */}
      {selected && task.subtasks.length > 0 && (
        <ul className="space-y-2 border-t px-4 py-3 pl-11">
          {task.subtasks.map((subtask) => (
            <li key={subtask.id} className="flex items-center gap-3">
              <Checkbox
                checked={subtask.done}
                onCheckedChange={() => onToggleSubtask(subtask.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={subtask.title}
              />
              <span
                className={cn(
                  "flex-1 text-sm",
                  subtask.done && "text-muted-foreground line-through",
                )}>
                {subtask.title}
              </span>
              <Avatar className="size-5">
                <AvatarFallback className="text-[9px]">
                  {initialsOf(userLabel(users, subtask.assigneeId))}
                </AvatarFallback>
              </Avatar>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
