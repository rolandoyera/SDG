"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageSquarePlus, Trash2 } from "lucide-react";
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
import type { ActivityActor, ClientNote } from "@/lib/types";

const noteSchema = z.object({
  body: z.string().trim().min(1, "Write something first."),
});

type NoteFormData = z.infer<typeof noteSchema>;

interface ClientNotesLogCardProps {
  notes: ClientNote[];
  /** The signed-in user — only the creator of a note may delete it. */
  currentActor: ActivityActor;
  onAddNote: (body: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
}

/**
 * Append-only notes log for a client. Each entry is an individual, timestamped,
 * immutable record. Notes can't be edited; the author can soft-delete their own
 * after a confirmation. Backed by the `clients/{clientId}/notes` subcollection.
 */
export function ClientNotesLogCard({
  notes,
  currentActor,
  onAddNote,
  onDeleteNote,
}: ClientNotesLogCardProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const { control, handleSubmit, reset, formState } = useForm<NoteFormData>({
    resolver: zodResolver(noteSchema),
    defaultValues: { body: "" },
  });

  const submit = async (data: NoteFormData) => {
    await onAddNote(data.body.trim());
    reset({ body: "" });
    setComposerOpen(false);
  };

  const handleComposerOpenChange = (open: boolean) => {
    if (formState.isSubmitting) return;
    if (!open) reset({ body: "" });
    setComposerOpen(open);
  };

  return (
    <Card variant="panel">
      <CardHeader>
        <CardTitle>
          <MessageSquarePlus className="icons" />
          Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 h-62 overflow-y-auto">
        {notes.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground text-xs italic">
            No notes logged yet for this client.
          </p>
        ) : (
          <ul className="flex flex-col gap-5">
            {notes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                isOwn={note.createdBy.id === currentActor.id}
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
          onClick={() => setComposerOpen(true)}
          className="flex items-center gap-1.5">
          <MessageSquarePlus className="size-3.5" />
          Note
        </Button>
      </CardFooter>

      <Dialog open={composerOpen} onOpenChange={handleComposerOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a Note</DialogTitle>
            <DialogDescription className="sr-only">
              Notes can't be edited once saved.
            </DialogDescription>
          </DialogHeader>
          <form
            id="add-note-form"
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
                    placeholder="Write a note about this client…"
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
              onClick={() => handleComposerOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-note-form"
              disabled={formState.isSubmitting}
              className="flex items-center gap-1.5">
              {formState.isSubmitting && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface NoteItemProps {
  note: ClientNote;
  /** Whether the signed-in user authored this note (drives "You" + delete rights). */
  isOwn: boolean;
  onDelete: (noteId: string) => Promise<void>;
}

function NoteItem({ note, isOwn, onDelete }: NoteItemProps) {
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

  return (
    <li className="group/note relative rounded border border-border/40 bg-muted p-3 shadow-inner">
      <div className="mb-1.5 text-muted-foreground text-xs">
        Added by:{" "}
        <span className="font-medium text-foreground">
          {isOwn ? "You" : note.createdBy.name}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-card-foreground text-sm leading-relaxed font-light px-4">
        {note.body}
      </p>
      <div className="mt-2 text-right text-muted-foreground text-xs">
        {formatDistanceToNow(note.createdAt, { addSuffix: true })}
      </div>
      {isOwn && (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(true)}
                aria-label="Delete Note"
                className="absolute top-2 right-2 size-7 rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/note:opacity-100">
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete Note</TooltipContent>
          </Tooltip>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this note?</AlertDialogTitle>
              <AlertDialogDescription>
                This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-2">
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
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
      )}
    </li>
  );
}
