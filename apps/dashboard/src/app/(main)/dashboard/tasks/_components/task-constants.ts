import { z } from "zod";

import type { Client, Project, Task, TaskAttachment } from "@/lib/types";

import type { TaskInput } from "@/server/task-actions";

import { getClientName } from "../../clients/_components/client-name";

/** Sentinel for "attached to nothing" — a task may hang off no record at all. */
export const NO_ATTACHMENT = "none";

export const subtaskSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1, "Give the subtask a name."),
  done: z.boolean(),
  assigneeId: z.string().min(1),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Task name is required."),
  notes: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  /** ISO yyyy-mm-dd, or "" for no due date — due dates are optional. */
  dueDate: z.string(),
  /** HH:mm, or "" to render the date without a time ("Wed" vs "Wed · 2:00pm"). */
  dueTime: z.string(),
  /** NO_ATTACHMENT, or "project:<id>" / "client:<id>" — one or neither, never both. */
  attachment: z.string(),
  assigneeIds: z.array(z.string()),
  subtasks: z.array(subtaskSchema),
});

export type TaskFormData = z.infer<typeof taskSchema>;

export function emptyTaskForm(creatorUid: string): TaskFormData {
  return {
    title: "",
    notes: "",
    priority: "medium",
    dueDate: "",
    dueTime: "",
    attachment: NO_ATTACHMENT,
    assigneeIds: creatorUid ? [creatorUid] : [],
    subtasks: [],
  };
}

export function taskToForm(task: Task): TaskFormData {
  const due = task.dueAt == null ? null : new Date(task.dueAt);
  return {
    title: task.title,
    notes: task.notes ?? "",
    priority: task.priority,
    dueDate: due ? toDateInput(due) : "",
    dueTime: due && task.dueHasTime ? toTimeInput(due) : "",
    attachment: task.attachment
      ? `${task.attachment.type}:${task.attachment.id}`
      : NO_ATTACHMENT,
    assigneeIds: task.assigneeIds,
    subtasks: task.subtasks,
  };
}

/** Local-time yyyy-mm-dd — toISOString() would shift the day across timezones. */
export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function resolveAttachment(
  value: string,
  projects: Project[],
  clients: Client[],
): TaskAttachment | undefined {
  if (value === NO_ATTACHMENT) return undefined;
  const [type, id] = value.split(":");
  if (type === "project") {
    const project = projects.find((p) => p.projectId === id);
    return project ? { type: "project", id, label: project.name } : undefined;
  }
  const client = clients.find((c) => c.uid === id);
  return client
    ? { type: "client", id, label: clientLabel(client) }
    : undefined;
}

/** Reuses the shared name helper so task chips read the same as the Clients page. */
export function clientLabel(client: Client): string {
  const { firstName, lastName } = getClientName(client);
  return [firstName, lastName].filter(Boolean).join(" ") || "Client";
}

/** Form values → the server action's payload. */
export function formToTaskInput(
  data: TaskFormData,
  projects: Project[],
  clients: Client[],
): TaskInput {
  const dueAt = data.dueDate
    ? new Date(`${data.dueDate}T${data.dueTime || "00:00"}`).getTime()
    : undefined;

  return {
    title: data.title.trim(),
    notes: data.notes.trim() || undefined,
    priority: data.priority,
    dueAt,
    dueHasTime: dueAt != null && data.dueTime !== "" ? true : undefined,
    attachment: resolveAttachment(data.attachment, projects, clients),
    assigneeIds: data.assigneeIds,
    subtasks: data.subtasks.map((s) => ({ ...s, title: s.title.trim() })),
  };
}
