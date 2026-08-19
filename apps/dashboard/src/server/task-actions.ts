"use server";

import type {
  ActivityActor,
  Subtask,
  Task,
  TaskAttachment,
  TaskPriority,
} from "@/lib/types";

import { getVerifiedCaller } from "./auth";
import { getAdminDb } from "./firebase-admin";
import { writeNotification } from "./notifications";

const TASKS_COLLECTION = "tasks";

/** The editable surface of a task — everything the create dialog and edit panel own. */
export interface TaskInput {
  title: string;
  notes?: string;
  priority: TaskPriority;
  dueAt?: number;
  dueHasTime?: boolean;
  attachment?: TaskAttachment;
  assigneeIds: string[];
  subtasks: Subtask[];
}

/**
 * Everyone who can see the task: the creator plus every task- and
 * subtask-assignee. This is the field firestore.rules gates reads on, so it is
 * always derived here and never accepted from the caller.
 */
function deriveParticipants(
  creatorUid: string,
  assigneeIds: string[],
  subtasks: Subtask[],
): string[] {
  return [
    ...new Set([
      creatorUid,
      ...assigneeIds,
      ...subtasks.map((s) => s.assigneeId),
    ]),
  ];
}

/** firebase-admin rejects undefined, and optional task fields are frequently unset. */
function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/**
 * Tell people they were just put on something. Assignment is also a permission
 * grant here (participants are the only non-admins who can see the task), so
 * this is the notice that new access appeared, not just a courtesy ping.
 *
 * Never notifies the caller about their own action. Someone who lands on both
 * the task and one of its subtasks gets the task-level notice only.
 */
async function notifyNewAssignees(
  task: Task,
  actor: ActivityActor,
  previousParticipants: string[],
): Promise<void> {
  const known = new Set([...previousParticipants, actor.id ?? ""]);
  const taskLevel = task.assigneeIds.filter((uid) => !known.has(uid));
  const notified = new Set([...known, ...taskLevel]);

  const recipients = [
    ...taskLevel.map((uid) => ({
      uid,
      type: "task_assigned" as const,
      title: "You were assigned a task",
      body: task.title,
    })),
    ...task.subtasks
      .filter((s) => !notified.has(s.assigneeId))
      .map((s) => ({
        uid: s.assigneeId,
        type: "subtask_assigned" as const,
        title: "You were assigned a subtask",
        body: `${s.title} · ${task.title}`,
      })),
  ];

  // A notification failure must never break the write that produced it.
  await Promise.all(
    recipients.map((r) =>
      writeNotification({
        organizationId: task.organizationId,
        type: r.type,
        audience: r.uid,
        title: r.title,
        body: r.body,
        href: `/dashboard/tasks?task=${task.taskId}`,
        actor,
        createdAt: Date.now(),
      }).catch(() => undefined),
    ),
  );
}

export async function createTask(input: TaskInput): Promise<Task> {
  const caller = await getVerifiedCaller();
  if (!caller) throw new Error("Not signed in.");

  const db = getAdminDb();
  const ref = db.collection(TASKS_COLLECTION).doc();
  const actor: ActivityActor = {
    type: "user",
    id: caller.uid,
    name: caller.fullName,
  };
  const now = Date.now();

  const task = stripUndefined<Task>({
    ...input,
    taskId: ref.id,
    organizationId: caller.organizationId,
    participantIds: deriveParticipants(
      caller.uid,
      input.assigneeIds,
      input.subtasks,
    ),
    completed: false,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
  } as Task);

  await ref.set(task);
  await notifyNewAssignees(task, actor, []);
  return task;
}

/**
 * Save the edit panel. Goes through the server (rather than the client SDK path
 * rules already allow) because changing assignees rewrites participantIds — the
 * read gate — and fires notifications, both of which need the admin SDK.
 * Ticking a checkbox does not come through here; that stays a client write.
 */
export async function updateTask(
  taskId: string,
  input: TaskInput,
): Promise<Task> {
  const caller = await getVerifiedCaller();
  if (!caller) throw new Error("Not signed in.");

  const db = getAdminDb();
  const ref = db.doc(`${TASKS_COLLECTION}/${taskId}`);
  const snap = await ref.get();
  const existing = snap.data() as Task | undefined;
  if (!existing) throw new Error("Task not found.");

  // Mirror firestore.rules: participants and admins, never across orgs.
  const isAdmin = caller.role === "Admin" || caller.role === "SuperAdmin";
  const sameOrg = existing.organizationId === caller.organizationId;
  if (!sameOrg || !(existing.participantIds.includes(caller.uid) || isAdmin)) {
    throw new Error("Not allowed to edit this task.");
  }

  const actor: ActivityActor = {
    type: "user",
    id: caller.uid,
    name: caller.fullName,
  };

  const task = stripUndefined<Task>({
    ...existing,
    ...input,
    // The creator stays a participant even if every assignment moves away.
    participantIds: deriveParticipants(
      existing.createdBy.id ?? caller.uid,
      input.assigneeIds,
      input.subtasks,
    ),
    updatedBy: actor,
    updatedAt: Date.now(),
  } as Task);

  // Optional fields cleared in the panel must be removed, not left stale.
  await ref.set(task);
  await notifyNewAssignees(task, actor, existing.participantIds);
  return task;
}
