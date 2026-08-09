"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { UserProfile } from "@/lib/types";
import { formatPhone, formatZip } from "@/lib/utils";

import {
  BUDGET_RANGE_LABELS,
  BUDGET_RANGES,
  DESIRED_TIMELINE_LABELS,
  DESIRED_TIMELINES,
  EMPTY_LEAD_FORM,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  LEAD_STAGE_LABELS,
  LEAD_STAGES,
  type LeadFormData,
  leadSchema,
  NONE,
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPES,
} from "./lead-constants";

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  submitting: boolean;
  /** Organization users available for the "Assigned To" selector. */
  users: UserProfile[];
  /** Pre-fill field values when editing an existing lead. */
  defaultValues?: Partial<LeadFormData>;
  /** Called with the validated field values when the form is submitted. */
  onSubmit: (data: LeadFormData) => void;
}

const LABEL_CLASS = "h-5 flex items-center";

/** Shared Add / Edit dialog for a lead, wired through React Hook Form + Zod. */
export function LeadFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  submitting,
  users,
  defaultValues,
  onSubmit,
}: LeadFormDialogProps) {
  const seed = (): LeadFormData => ({
    ...EMPTY_LEAD_FORM,
    ...defaultValues,
    phone: formatPhone(defaultValues?.phone ?? ""),
  });

  const { control, handleSubmit, reset, watch } = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: seed(),
  });

  const isCompany = watch("isCompany");

  // biome-ignore lint/correctness/useExhaustiveDependencies: reseed only when the dialog opens
  useEffect(() => {
    if (open) reset(seed());
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex max-h-[85vh] flex-col gap-4"
          noValidate
        >
          <DialogHeader className="mb-2">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-1">
              <Controller
                control={control}
                name="stage"
                render={({ field }) => (
                  <Field className="flex flex-col gap-1.5">
                    <Label className={LABEL_CLASS}>Stage</Label>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_STAGES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {LEAD_STAGE_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="assignedTo"
                render={({ field }) => (
                  <Field className="flex flex-col gap-1.5">
                    <Label className={LABEL_CLASS}>Assigned To</Label>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.uid} value={u.uid}>
                            {u.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            </div>
            <div className="grid grid-cols-2 items-end gap-4">
              <div className="rounded border border-border bg-muted/30 h-10 flex items-center pl-2">
                <Controller
                  control={control}
                  name="isCompany"
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="lead-is-company"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <Label
                        size="large"
                        htmlFor="lead-is-company"
                        className="cursor-pointer select-none leading-none"
                      >
                        This is a company or commercial entity
                      </Label>
                    </div>
                  )}
                />
              </div>
              <Controller
                control={control}
                name="company"
                render={({ field, fieldState }) => (
                  <Field
                    className="flex flex-col gap-1.5"
                    data-invalid={fieldState.invalid}
                  >
                    <Label className={LABEL_CLASS}>
                      Company Name{" "}
                      {isCompany && (
                        <span className="ml-0.5 text-destructive">*</span>
                      )}
                    </Label>
                    <Input
                      {...field}
                      disabled={!isCompany}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </div>

            <div className="flex flex-col gap-4 py-1">
              <div className="grid grid-cols-2 gap-4">
                <Controller
                  control={control}
                  name="firstName"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>
                        First Name{" "}
                        {!isCompany && (
                          <span className="ml-0.5 text-destructive">*</span>
                        )}
                      </Label>
                      <Input {...field} aria-invalid={fieldState.invalid} />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="lastName"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>Last Name</Label>
                      <Input {...field} aria-invalid={fieldState.invalid} />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Controller
                  control={control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>Email Address</Label>
                      <Input
                        {...field}
                        type="email"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="phone"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>Phone Number</Label>
                      <Input
                        {...field}
                        aria-invalid={fieldState.invalid}
                        onChange={(e) =>
                          field.onChange(formatPhone(e.target.value))
                        }
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>

              <Controller
                control={control}
                name="street"
                render={({ field, fieldState }) => (
                  <Field
                    className="flex flex-col gap-1.5"
                    data-invalid={fieldState.invalid}
                  >
                    <Label className={LABEL_CLASS}>Street Address</Label>
                    <Input {...field} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <div className="grid grid-cols-4 gap-3">
                <Controller
                  control={control}
                  name="city"
                  render={({ field, fieldState }) => (
                    <Field
                      className="col-span-2 flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>City</Label>
                      <Input {...field} aria-invalid={fieldState.invalid} />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="state"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>State</Label>
                      <Input
                        {...field}
                        maxLength={2}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="zip"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>ZIP Code</Label>
                      <Input
                        {...field}
                        inputMode="numeric"
                        maxLength={5}
                        aria-invalid={fieldState.invalid}
                        onChange={(e) =>
                          field.onChange(formatZip(e.target.value))
                        }
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Controller
                  control={control}
                  name="source"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>
                        Source{" "}
                        <span className="ml-0.5 text-destructive">*</span>
                      </Label>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger aria-invalid={fieldState.invalid}>
                          <SelectValue placeholder="Select a source" />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_SOURCES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {LEAD_SOURCE_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="sourceDetail"
                  render={({ field }) => (
                    <Field className="flex flex-col gap-1.5">
                      <Label className={LABEL_CLASS}>Source Detail</Label>
                      <Input
                        {...field}
                        placeholder="e.g. referred by Jane Doe"
                      />
                    </Field>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Controller
                  control={control}
                  name="propertyType"
                  render={({ field }) => (
                    <Field className="flex flex-col gap-1.5">
                      <Label className={LABEL_CLASS}>Property Type</Label>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Not specified" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Not specified</SelectItem>
                          {PROPERTY_TYPES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {PROPERTY_TYPE_LABELS[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="budgetRange"
                  render={({ field }) => (
                    <Field className="flex flex-col gap-1.5">
                      <Label className={LABEL_CLASS}>Budget Range</Label>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Not specified" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Not specified</SelectItem>
                          {BUDGET_RANGES.map((b) => (
                            <SelectItem key={b} value={b}>
                              {BUDGET_RANGE_LABELS[b]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="desiredTimeline"
                  render={({ field }) => (
                    <Field className="flex flex-col gap-1.5">
                      <Label className={LABEL_CLASS}>Desired Timeline</Label>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Not specified" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Not specified</SelectItem>
                          {DESIRED_TIMELINES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {DESIRED_TIMELINE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />
              </div>

              <Controller
                control={control}
                name="notes"
                render={({ field }) => (
                  <Field className="flex flex-col gap-1.5">
                    <Label className={LABEL_CLASS}>Notes</Label>
                    <Textarea
                      {...field}
                      placeholder="Add notes about the lead..."
                      className="min-h-20"
                    />
                  </Field>
                )}
              />
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
