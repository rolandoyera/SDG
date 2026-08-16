"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { format, isToday, isYesterday } from "date-fns";
import { Loader2, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

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
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ActivityActor, ProjectNote } from "@/lib/types";
import { cn } from "@/lib/utils";

const noteSchema = z.object({
  body: z.string().trim().min(1, "Write something first."),
});

type NoteFormData = z.infer<typeof noteSchema>;

/** Two-letter initials from a display name (single word → first two letters). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "9:51 AM · today" style timestamp. */
function timeLabel(ts: number): string {
  const time = format(ts, "h:mm a");
  const day = isToday(ts)
    ? "today"
    : isYesterday(ts)
      ? "yesterday"
      : format(ts, "MMM d, yyyy");
  return `${time} · ${day}`;
}

interface ProjectNotesCardProps {
  notes: ProjectNote[];
  /** The signed-in user — only the author may edit or delete their own note. */
  currentActor: ActivityActor;
  onAddNote: (body: string) => Promise<void>;
  onEditNote: (noteId: string, body: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
}

/**
 * Editable notes log for a project, rendered as a threaded conversation
 * (avatar + author/timestamp header + body). Entries are working content: the
 * author can edit or hard-delete their own. Backed by the
 * `projects/{projectId}/notes` subcollection.
 */
export function ProjectNotesCard({
  notes,
  currentActor,
  onAddNote,
  onEditNote,
  onDeleteNote,
}: ProjectNotesCardProps) {
  // null = closed; { note: null } = composing new; { note } = editing existing.
  const [composer, setComposer] = useState<{ note: ProjectNote | null } | null>(
    null,
  );
  const { control, handleSubmit, reset, formState } = useForm<NoteFormData>({
    resolver: zodResolver(noteSchema),
    defaultValues: { body: "" },
  });

  useEffect(() => {
    if (composer) reset({ body: composer.note?.body ?? "" });
  }, [composer, reset]);

  const submit = async (data: NoteFormData) => {
    const body = data.body.trim();
    if (composer?.note) {
      await onEditNote(composer.note.id, body);
    } else {
      await onAddNote(body);
    }
    setComposer(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (formState.isSubmitting) return;
    if (!open) setComposer(null);
  };

  const isEditing = !!composer?.note;

  return (
    <Card variant="panel">
      <CardHeader>
        <CardTitle>
          <MessageSquare className="icons" />
          Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-100 overflow-y-auto">
        {notes.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground text-xs italic">
            No notes logged yet for this project.
          </p>
        ) : (
          <ul className="flex flex-col">
            {notes.map((note, i) => (
              <NoteItem
                key={note.id}
                note={note}
                isOwn={note.createdBy.id === currentActor.id}
                isLast={i === notes.length - 1}
                onEdit={() => setComposer({ note })}
                onDelete={onDeleteNote}
              />
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter className="justify-end h-14">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setComposer({ note: null })}
          className="flex items-center gap-1.5">
          <Plus className="size-3.5" />
          Note
        </Button>
      </CardFooter>

      <Dialog open={!!composer} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Note" : "Add a Note"}</DialogTitle>
            <DialogDescription className="sr-only">
              Write a note about this project.
            </DialogDescription>
          </DialogHeader>
          <form
            id="project-note-form"
            onSubmit={handleSubmit(submit)}
            className="flex flex-col gap-2">
            <Controller
              control={control}
              name="body"
              render={({ field, fieldState }) => (
                <>
                  <Textarea
                    {...field}
                    autoFocus
                    placeholder="Write a note about this project…"
                    aria-invalid={fieldState.invalid}
                    className="min-h-30"
                  />
                  <span className="text-destructive text-xs">
                    {fieldState.error?.message}
                  </span>
                </>
              )}
            />
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={formState.isSubmitting}
              onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="project-note-form"
              disabled={formState.isSubmitting}
              className="flex items-center gap-1.5">
              {formState.isSubmitting && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {isEditing ? "Save Note" : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface NoteItemProps {
  note: ProjectNote;
  /** Whether the signed-in user authored this note (drives "You" + edit/delete rights). */
  isOwn: boolean;
  /** Last row hides its connector line. */
  isLast: boolean;
  onEdit: () => void;
  onDelete: (noteId: string) => Promise<void>;
}

function NoteItem({ note, isOwn, isLast, onEdit, onDelete }: NoteItemProps) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onDelete(note.id);
      setOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const displayName = isOwn ? "You" : note.createdBy.name;
  const stamp = note.updatedAt
    ? `${timeLabel(note.updatedAt)} · edited`
    : timeLabel(note.createdAt);

  return (
    <li className="group/note relative flex gap-3 pb-6 last:pb-0">
      {/* Threaded connector line down to the next avatar. */}
      {!isLast && (
        <span
          aria-hidden
          className="absolute top-11 bottom-1 left-5 w-px -translate-x-1/2 bg-border"
        />
      )}
      <div
        className={cn(
          "z-10 flex size-10 shrink-0 items-center justify-center rounded-full font-semibold text-xs",
          isOwn
            ? "bg-primary text-primary-foreground"
            : "bg-foreground text-background",
        )}>
        {isOwn ? "You" : initials(note.createdBy.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-semibold text-sm",
              isOwn ? "text-primary" : "text-card-foreground",
            )}>
            {displayName}
          </span>
          <span className="text-muted-foreground text-xs">{stamp}</span>
          {isOwn && (
            <div className="ml-auto flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/note:opacity-100">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={onEdit}
                    aria-label="Edit Note"
                    className="size-7 rounded-full text-muted-foreground hover:text-foreground">
                    <Pencil className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit Note</TooltipContent>
              </Tooltip>
              <AlertDialog open={open} onOpenChange={setOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setOpen(true)}
                      aria-label="Delete Note"
                      className="size-7 rounded-full text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete Note</TooltipContent>
                </Tooltip>
                <AlertDialogContent className="sm:max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes the note and can't be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="mt-2">
                    <AlertDialogCancel disabled={deleting}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        void handleConfirm();
                      }}
                      disabled={deleting}
                      className="flex items-center gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {deleting && <Loader2 className="size-4 animate-spin" />}
                      Delete Note
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-card-foreground text-sm leading-relaxed">
          {note.body}
        </p>
      </div>
    </li>
  );
}
