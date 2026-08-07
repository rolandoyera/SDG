"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, X } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchCompetitors, saveCompetitors } from "@/server/seo-actions";

const MAX_COMPETITORS = 5;

const competitorsSchema = z.object({
  competitors: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Name is required."),
        url: z.string().trim().min(1, "URL is required."),
      }),
    )
    .max(MAX_COMPETITORS),
});

type CompetitorsFormData = z.infer<typeof competitorsSchema>;

export function CompetitorsForm() {
  const { control, handleSubmit, reset } = useForm<CompetitorsFormData>({
    resolver: zodResolver(competitorsSchema),
    defaultValues: { competitors: [] },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "competitors",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCompetitors()
      .then((result) => {
        if (!cancelled && result.success && result.data) {
          reset({ competitors: result.data });
        }
      })
      .catch(() => {
        // Leave the empty form; saving still works.
      });
    return () => {
      cancelled = true;
    };
  }, [reset]);

  const onSubmit = async (data: CompetitorsFormData) => {
    setSaving(true);
    try {
      const result = await saveCompetitors(data.competitors);
      if (result.success && result.data) {
        reset({ competitors: result.data });
        toast.success("Competitors saved.");
      } else {
        toast.error(result.error ?? "Could not save competitors.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="gap-2 pt-0">
      <CardHeader className="bg-muted/50 py-3">
        <CardTitle>Competitors</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          {fields.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No competitors yet — add up to {MAX_COMPETITORS}.
            </p>
          )}

          {fields.map((row, index) => (
            <div
              key={row.id}
              className="grid items-start gap-4 sm:grid-cols-[16rem_1fr_auto]"
            >
              <Controller
                control={control}
                name={`competitors.${index}.name`}
                render={({ field, fieldState }) => (
                  <Field className="flex flex-col gap-1.5">
                    <Label>Name</Label>
                    <Input {...field} placeholder="Competitor name" />
                    {fieldState.error && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                control={control}
                name={`competitors.${index}.url`}
                render={({ field, fieldState }) => (
                  <Field className="flex flex-col gap-1.5">
                    <Label>Website</Label>
                    <Input
                      {...field}
                      placeholder="https://competitor.com"
                      inputMode="url"
                    />
                    {fieldState.error && (
                      <FieldError errors={[fieldState.error]} />
                    )}
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
                  aria-label="Remove competitor"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={fields.length >= MAX_COMPETITORS}
              onClick={() => append({ name: "", url: "" })}
            >
              <Plus className="size-4" />
              Add competitor
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
