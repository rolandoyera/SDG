"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, X } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
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
  searchKeywordLocations,
  type SerpLocationSuggestion,
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

const SEARCH_DEBOUNCE_MS = 300;

/** "Aventura,Florida,United States" → "Aventura, Florida" for the dropdown. */
function suggestionLabel(name: string): string {
  const parts = name.split(",");
  return parts.length > 1 ? parts.slice(0, -1).join(", ") : name;
}

/**
 * City input with DataForSEO location suggestions. Picking one stores the
 * full canonical location_name (commas and all), which composeLocation
 * passes through verbatim — so the check can never downgrade to
 * country-wide. Free text still works as before.
 */
function CityCombobox({
  value,
  onChange,
  container,
}: {
  value: string;
  onChange: (value: string) => void;
  container: HTMLDivElement | null;
}) {
  const [items, setItems] = useState<SerpLocationSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const query = value.trim();
    // A comma means a suggestion was already picked (or a full
    // location_name was pasted) — nothing left to suggest.
    if (query.length < 2 || query.includes(",")) {
      setItems([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let stale = false;
    const timer = setTimeout(() => {
      void searchKeywordLocations(query)
        .then((results) => {
          if (!stale) setItems(results);
        })
        .catch(() => {
          if (!stale) setItems([]);
        })
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [value]);

  return (
    <Combobox
      items={items}
      filter={() => true}
      inputValue={value}
      onInputValueChange={(next: string) => onChange(next)}
      itemToStringLabel={(item: SerpLocationSuggestion) => item.name}
      onValueChange={(item: SerpLocationSuggestion | null) => {
        if (item) onChange(item.name);
      }}
    >
      <ComboboxInput
        showTrigger={false}
        placeholder="Leave blank for country-wide"
      />
      <ComboboxContent container={container}>
        <ComboboxEmpty>
          {searching ? "Searching…" : "No matching place found."}
        </ComboboxEmpty>
        <ComboboxList>
          {(item: SerpLocationSuggestion) => (
            <ComboboxItem key={item.name} value={item}>
              <span className="truncate">{suggestionLabel(item.name)}</span>
              <span className="ml-auto text-muted-foreground text-xs">
                {item.type}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

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
  const [comboboxContainer, setComboboxContainer] =
    useState<HTMLDivElement | null>(null);

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
            Each keyword is checked daily. For local keywords, start typing the
            city and pick a suggestion. Leave blank to track country-wide.
          </DialogDescription>
        </DialogHeader>

        {/* Portal target so the city combobox popup renders within the dialog. */}
        <div ref={setComboboxContainer} />
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          {fields.map((row, index) => (
            <div
              key={row.id}
              className="grid items-start gap-3 sm:grid-cols-[1.5fr_1fr_auto]"
            >
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
                    <CityCombobox
                      value={field.value}
                      onChange={field.onChange}
                      container={comboboxContainer}
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
                  aria-label="Remove keyword row"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          ))}

          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => append(EMPTY_ROW)}
            >
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
