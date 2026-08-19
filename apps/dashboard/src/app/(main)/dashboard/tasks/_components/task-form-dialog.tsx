"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, X } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Client, Project, UserProfile } from "@/lib/types";

import {
  NO_ATTACHMENT,
  type TaskFormData,
  clientLabel,
  taskSchema,
} from "./task-constants";
import { AssigneePicker, DuePicker } from "./task-pickers";
import { PRIORITY_LABELS } from "./task-utils";

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  submitting: boolean;
  defaultValues: TaskFormData;
  users: UserProfile[];
  projects: Project[];
  clients: Client[];
  /** Who a newly added subtask is assigned to until someone changes it. */
  creatorUid: string;
  onSubmit: (data: TaskFormData) => void;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  submitting,
  defaultValues,
  users,
  projects,
  clients,
  creatorUid,
  onSubmit,
}: TaskFormDialogProps) {
  const {
    control,
    handleSubmit,
    register,
    reset,
    formState: { errors },
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues,
  });
  const subtasks = useFieldArray({ control, name: "subtasks" });
  const [draftSubtask, setDraftSubtask] = useState("");

  // Re-seed whenever the dialog reopens — one instance serves both create and
  // edit, so stale values would otherwise leak between tasks.
  useEffect(() => {
    if (open) {
      reset(defaultValues);
      setDraftSubtask("");
    }
  }, [open, defaultValues, reset]);

  const addSubtask = () => {
    const value = draftSubtask.trim();
    if (!value) return;
    subtasks.append({
      id: `sub-${Math.random().toString(36).slice(2, 11)}`,
      title: value,
      done: false,
      assigneeId: creatorUid,
    });
    setDraftSubtask("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Field>
            <Input
              {...register("title")}
              placeholder="Task name..."
              aria-label="Task name"
            />
            {errors.title && <FieldError>{errors.title.message}</FieldError>}
          </Field>

          <div className="flex flex-wrap gap-2">
            {/* One picker for both: a task hangs off a project OR a client OR
                nothing, never a project and a client at once. */}
            <Controller
              control={control}
              name="attachment"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-auto" aria-label="Attach to">
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
                      <SelectItem
                        key={client.uid}
                        value={`client:${client.uid}`}
                      >
                        {clientLabel(client)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />

            <Controller
              control={control}
              name="assigneeIds"
              render={({ field }) => (
                <AssigneePicker
                  users={users}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />

            <Controller
              control={control}
              name="dueDate"
              render={({ field: dateField }) => (
                <Controller
                  control={control}
                  name="dueTime"
                  render={({ field: timeField }) => (
                    <DuePicker
                      date={dateField.value}
                      time={timeField.value}
                      onChange={(nextDate, nextTime) => {
                        dateField.onChange(nextDate);
                        timeField.onChange(nextTime);
                      }}
                    />
                  )}
                />
              )}
            />

            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-auto" aria-label="Priority">
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
              )}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase">
              Subtasks
            </Label>
            {subtasks.fields.map((subtask, index) => (
              <div key={subtask.id} className="flex items-center gap-2">
                <Input
                  {...register(`subtasks.${index}.title`)}
                  aria-label={`Subtask ${index + 1}`}
                />
                <Controller
                  control={control}
                  name={`subtasks.${index}.assigneeId`}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        className="w-auto"
                        aria-label={`Subtask ${index + 1} assignee`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.uid} value={user.uid}>
                            {user.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => subtasks.remove(index)}
                  aria-label={`Remove subtask ${index + 1}`}
                >
                  <X />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                value={draftSubtask}
                onChange={(event) => setDraftSubtask(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSubtask();
                  }
                }}
                placeholder="Add a subtask..."
                aria-label="Add a subtask"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={addSubtask}
                aria-label="Add subtask"
              >
                <Plus />
              </Button>
            </div>
          </div>

          <Field>
            <Label
              htmlFor="task-notes"
              className="text-muted-foreground text-xs uppercase"
            >
              Notes
            </Label>
            <Textarea
              id="task-notes"
              {...register("notes")}
              placeholder="Add a note..."
              rows={3}
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
