"use client";

import { useEffect, useState } from "react";

import { Check, Loader2, Trash2 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Client, Project, Task, UserProfile } from "@/lib/types";

import {
  NO_ATTACHMENT,
  type TaskFormData,
  clientLabel,
  taskToForm,
} from "./task-constants";
import { AssigneePicker, DuePicker } from "./task-pickers";
import {
  PRIORITY_LABELS,
  formatDue,
  initialsOf,
  subtaskProgress,
  taskAvatarUids,
  userLabel,
} from "./task-utils";

interface TaskDetailPanelProps {
  task: Task;
  users: UserProfile[];
  projects: Project[];
  clients: Client[];
  saving: boolean;
  onSave: (data: TaskFormData) => void;
  onToggleComplete: () => void;
  onToggleSubtask: (subtaskId: string) => void;
  onDelete: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-muted-foreground text-xs uppercase tracking-wide">
      {children}
    </p>
  );
}

/**
 * The task's read AND edit surface — there is deliberately no edit modal. The
 * panel exists to give notes and subtasks room to breathe, and making it
 * read-only would mean the same task rendered in three places (card, panel,
 * modal) with two of them needing to stay in sync.
 *
 * Chips commit on change; the title and notes commit on blur, so typing doesn't
 * fire a write per keystroke.
 */
export function TaskDetailPanel({
  task,
  users,
  projects,
  clients,
  saving,
  onSave,
  onToggleComplete,
  onToggleSubtask,
  onDelete,
}: TaskDetailPanelProps) {
  const [draft, setDraft] = useState<TaskFormData>(() => taskToForm(task));

  // Re-seed when a different task is selected, or when a realtime update lands
  // from someone else editing the same task.
  useEffect(() => {
    setDraft(taskToForm(task));
  }, [task]);

  const commit = (patch: Partial<TaskFormData>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (next.title.trim()) onSave(next);
  };

  const avatarUids = taskAvatarUids(task);

  return (
    <aside className="flex w-full flex-col gap-6 border-l p-6 lg:w-96">
      <div>
        {task.attachment && (
          <p className="mb-2 text-muted-foreground text-xs uppercase tracking-wide">
            {task.attachment.label}
          </p>
        )}
        <Input
          value={draft.title}
          onChange={(event) =>
            setDraft({ ...draft, title: event.target.value })
          }
          onBlur={() => commit({})}
          aria-label="Task name"
          className="text-xl! h-auto border-0 px-0 font-semibold shadow-none focus-visible:ring-0"
        />
      </div>

      <div>
        <SectionLabel>Project</SectionLabel>
        <Select
          value={draft.attachment}
          onValueChange={(value) => commit({ attachment: value })}
        >
          <SelectTrigger className="w-full" aria-label="Attach to">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_ATTACHMENT}>No project</SelectItem>
            {projects.map((project) => (
              <SelectItem
                key={project.projectId}
                value={`project:${project.projectId}`}
              >
                {project.name}
              </SelectItem>
            ))}
            {clients.map((client) => (
              <SelectItem key={client.uid} value={`client:${client.uid}`}>
                {clientLabel(client)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <SectionLabel>Assignees</SectionLabel>
        <AssigneePicker
          users={users}
          value={draft.assigneeIds}
          onChange={(next) => commit({ assigneeIds: next })}
          trigger={
            <button
              type="button"
              className="-space-x-2 flex rounded p-1 hover:bg-accent"
              aria-label="Edit assignees"
            >
              {avatarUids.length === 0 ? (
                <span className="px-1 text-muted-foreground text-sm">
                  Unassigned
                </span>
              ) : (
                avatarUids.map((uid) => (
                  <Avatar
                    key={uid}
                    className="size-7 border-2 border-background"
                  >
                    <AvatarFallback className="text-[10px]">
                      {initialsOf(userLabel(users, uid))}
                    </AvatarFallback>
                  </Avatar>
                ))
              )}
            </button>
          }
        />
      </div>

      <div>
        <SectionLabel>Due</SectionLabel>
        <DuePicker
          date={draft.dueDate}
          time={draft.dueTime}
          onChange={(dueDate, dueTime) => commit({ dueDate, dueTime })}
          trigger={
            <button
              type="button"
              className="rounded px-1 py-0.5 text-sm hover:bg-accent"
            >
              {formatDue(task)}
            </button>
          }
        />
      </div>

      <div>
        <SectionLabel>Priority</SectionLabel>
        <Select
          value={draft.priority}
          onValueChange={(value) =>
            commit({ priority: value as TaskFormData["priority"] })
          }
        >
          <SelectTrigger className="w-full" aria-label="Priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <SectionLabel>Notes</SectionLabel>
        <Textarea
          value={draft.notes}
          onChange={(event) =>
            setDraft({ ...draft, notes: event.target.value })
          }
          onBlur={() => commit({})}
          placeholder="Add a note..."
          rows={4}
          aria-label="Notes"
        />
      </div>

      {task.subtasks.length > 0 && (
        <div>
          <SectionLabel>
            Subtasks · {subtaskProgress(task.subtasks)}
          </SectionLabel>
          <ul className="space-y-2">
            {task.subtasks.map((subtask) => (
              <li key={subtask.id} className="flex items-center gap-3">
                <Checkbox
                  checked={subtask.done}
                  onCheckedChange={() => onToggleSubtask(subtask.id)}
                  aria-label={subtask.title}
                />
                <span
                  className={cn(
                    "flex-1 text-sm",
                    subtask.done && "text-muted-foreground line-through",
                  )}
                >
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
        </div>
      )}

      <div className="mt-auto space-y-2">
        <Button variant="outline" className="w-full" onClick={onToggleComplete}>
          {saving ? <Loader2 className="animate-spin" /> : <Check />}
          Mark complete
        </Button>
        {/* Permanent, and open to any participant — see firestore.rules. */}
        <Button
          variant="outline"
          className="w-full text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 />
          Delete
        </Button>
      </div>
    </aside>
  );
}
