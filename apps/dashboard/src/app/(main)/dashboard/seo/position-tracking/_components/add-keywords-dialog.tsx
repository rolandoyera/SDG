"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, X } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addTrackedKeywords,
  type PositionTrackingData,
} from "@/server/position-tracking-actions";

const addKeywordsSchema = z.object({
  rows: z
    .array(
      z.object({
        keyword: z.string().trim().min(1, "Keyword is required."),
        city: z.string().trim(),
      }),
    )
    .min(1),
});

type AddKeywordsFormData = z.infer<typeof addKeywordsSchema>;

const EMPTY_ROW = { keyword: "", city: "" };

export function AddKeywordsDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (data: PositionTrackingData) => void;
}) {
  const { control, handleSubmit, reset } = useForm<AddKeywordsFormData>({
    resolver: zodResolver(addKeywordsSchema),
    defaultValues: { rows: [EMPTY_ROW] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "rows" });
  const [saving, setSaving] = useState(false);

  const onSubmit = async (data: AddKeywordsFormData) => {
    setSaving(true);
    try {
      const result = await addTrackedKeywords(data.rows);
      if (result.success && result.data) {
        onAdded(result.data);
        toast.success("Keywords added and checked.");
        reset({ rows: [EMPTY_ROW] });
        onOpenChange(false);
      } else {
        toast.error(result.error ?? "Could not add keywords.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add Keywords</DialogTitle>
          <DialogDescription>
            Each keyword is checked daily. For local keywords, just type the
            city. Leave blank to track country-wide.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate>
          {fields.map((row, index) => (
            <div
              key={row.id}
              className="grid items-start gap-3 sm:grid-cols-[1.5fr_1fr_auto]">
              <Controller
                control={control}
                name={`rows.${index}.keyword`}
                render={({ field, fieldState }) => (
                  <Field className="flex flex-col gap-1.5">
                    <Label>Keyword</Label>
                    <Input {...field} placeholder="Add keyword" />
                    {fieldState.error && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                control={control}
                name={`rows.${index}.city`}
                render={({ field }) => (
                  <Field className="flex flex-col gap-1.5">
                    <Label>City</Label>
                    <Input
                      {...field}
                      placeholder="Leave blank for country-wide"
                    />
                  </Field>
                )}
              />
              <div className="flex flex-col gap-1.5">
                <Label className="invisible hidden sm:block">Remove</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                  aria-label="Remove keyword row">
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          ))}

          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => append(EMPTY_ROW)}>
              <Plus className="size-4" />
              Add another
            </Button>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Adding & checking…" : "Add & Check"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
