"use client";

import { useEffect, useMemo, useState } from "react";

import { Plus } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  deleteTask,
  getClients,
  getOrganizationUsers,
  getProjects,
  setTaskCompleted,
  setTaskSubtasks,
} from "@/lib/db";
import { createTask, updateTask } from "@/server/task-actions";
import type {
  ActivityActor,
  Client,
  Project,
  Task,
  UserProfile,
} from "@/lib/types";

import { TaskCard } from "./_components/task-card";
import {
  type TaskFormData,
  emptyTaskForm,
  formToTaskInput,
} from "./_components/task-constants";
import { TaskDetailPanel } from "./_components/task-detail-panel";
import { TaskFormDialog } from "./_components/task-form-dialog";
import { type TaskView, groupTasks } from "./_components/task-utils";
import { TaskViewsNav } from "./_components/task-views-nav";
import { useTasks } from "./_components/use-tasks";

export default function TasksPage() {
  const { organizationId, uid, profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === "Admin" || profile?.role === "SuperAdmin";

  const { tasks, loading } = useTasks(
    organizationId,
    uid,
    isAdmin,
    authLoading,
  );

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [view, setView] = useState<TaskView>("mine");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  // Reference data for the pickers and avatar initials. Keyed on the stable
  // primitives from useAuth — the profile object's identity churns on every
  // heartbeat and would refetch all three lists each time.
  useEffect(() => {
    if (authLoading || !organizationId) return;
    let active = true;
    void Promise.all([
      getOrganizationUsers(organizationId),
      getProjects(organizationId),
      getClients(organizationId),
    ]).then(([nextUsers, nextProjects, nextClients]) => {
      if (!active) return;
      setUsers(nextUsers);
      setProjects(nextProjects);
      setClients(nextClients);
    });
    return () => {
      active = false;
    };
  }, [organizationId, authLoading]);

  // Deep links: ?add=true from the sidebar's Quick Create, ?task=<id> from a
  // notification. Cleaned immediately so a reload doesn't re-trigger them.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("add") === "true") setCreateOpen(true);
    const taskParam = params.get("task");
    if (taskParam) setSelectedId(taskParam);
    if (params.has("add") || params.has("task"))
      window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const actor: ActivityActor = useMemo(
    () => ({ type: "user", id: uid ?? "", name: profile?.fullName ?? "" }),
    [uid, profile?.fullName],
  );

  const visible = useMemo(() => {
    if (!uid) return [];
    const forView =
      view === "all"
        ? tasks
        : tasks.filter((t) => t.participantIds.includes(uid));
    const byPriority =
      view === "high" ? forView.filter((t) => t.priority === "high") : forView;
    return projectFilter
      ? byPriority.filter((t) => t.attachment?.id === projectFilter)
      : byPriority;
  }, [tasks, view, uid, projectFilter]);

  const selected = tasks.find((t) => t.taskId === selectedId) ?? null;
  const groups = groupTasks(visible);

  const handleToggleComplete = async (task: Task) => {
    // Completing removes the task from every view, so the toast is the only
    // way back — there is no Completed section by design.
    await setTaskCompleted(task.taskId, !task.completed, actor);
    if (task.taskId === selectedId) setSelectedId(null);
    if (!task.completed)
      toast(`Completed "${task.title}"`, {
        action: {
          label: "Undo",
          onClick: () => void setTaskCompleted(task.taskId, false, actor),
        },
      });
  };

  const handleToggleSubtask = async (task: Task, subtaskId: string) => {
    await setTaskSubtasks(
      task.taskId,
      task.subtasks.map((s) =>
        s.id === subtaskId ? { ...s, done: !s.done } : s,
      ),
      actor,
    );
  };

  const handleCreate = async (data: TaskFormData) => {
    setSubmitting(true);
    try {
      const created = await createTask(
        formToTaskInput(data, projects, clients),
      );
      setCreateOpen(false);
      setSelectedId(created.taskId);
      toast.success("Task created.");
    } catch (error) {
      console.error("Failed to create task:", error);
      toast.error("Could not create the task.");
    } finally {
      setSubmitting(false);
    }
  };

  // The panel saves through the server action rather than a client write: an
  // assignee change rewrites participantIds (the read gate) and fires
  // notifications, both of which need the admin SDK.
  const handleSave = async (task: Task, data: TaskFormData) => {
    setSubmitting(true);
    try {
      await updateTask(task.taskId, formToTaskInput(data, projects, clients));
    } catch (error) {
      console.error("Failed to save task:", error);
      toast.error("Could not save your changes.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const { taskId, title } = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteTask(taskId);
      if (taskId === selectedId) setSelectedId(null);
      toast.success(`Deleted "${title}".`);
    } catch (error) {
      console.error("Failed to delete task:", error);
      toast.error("Could not delete the task.");
    }
  };

  const renderGroup = (label: string, groupTasksList: Task[]) =>
    groupTasksList.length > 0 && (
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
          {label}
          <span className="tabular-nums">{groupTasksList.length}</span>
        </h2>
        {groupTasksList.map((task) => (
          <TaskCard
            key={task.taskId}
            task={task}
            users={users}
            selected={task.taskId === selectedId}
            onSelect={() => setSelectedId(task.taskId)}
            onToggleComplete={() => void handleToggleComplete(task)}
            onToggleSubtask={(subtaskId) =>
              void handleToggleSubtask(task, subtaskId)
            }
          />
        ))}
      </section>
    );

  return (
    <>
      <PageTitle title="Tasks" />
      <div className="flex flex-col lg:flex-row">
        {uid && (
          <TaskViewsNav
            tasks={tasks}
            uid={uid}
            isAdmin={isAdmin}
            view={view}
            onViewChange={setView}
            projectFilter={projectFilter}
            onProjectFilterChange={setProjectFilter}
          />
        )}

        <main className="min-w-0 mx-auto max-w-4xl flex-1 space-y-6 p-6">
          <PageHeader
            title={
              view === "mine"
                ? "My Tasks"
                : view === "high"
                  ? "High Priority"
                  : "All Tasks"
            }
            description={`${visible.length} open ${visible.length === 1 ? "task" : "tasks"}.`}
          />
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New task
          </Button>

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground text-sm">
              Nothing here. Create a task to get started.
            </p>
          ) : (
            <div className="space-y-6">
              {renderGroup("Past due", groups.pastDue)}
              {renderGroup("Upcoming", groups.upcoming)}
            </div>
          )}
        </main>

        {selected && (
          <TaskDetailPanel
            task={selected}
            users={users}
            projects={projects}
            clients={clients}
            saving={submitting}
            onSave={(data) => void handleSave(selected, data)}
            onToggleComplete={() => void handleToggleComplete(selected)}
            onToggleSubtask={(subtaskId) =>
              void handleToggleSubtask(selected, subtaskId)
            }
            onDelete={() => setPendingDelete(selected)}
          />
        )}
      </div>

      <TaskFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New task"
        submitLabel="Create task"
        submitting={submitting}
        defaultValues={emptyTaskForm(uid ?? "")}
        users={users}
        projects={projects}
        clients={clients}
        creatorUid={uid ?? ""}
        onSubmit={(data) => void handleCreate(data)}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.title}&rdquo; will be permanently deleted
              for everyone on it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
