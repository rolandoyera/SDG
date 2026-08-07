"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { DollarSign, Loader2 } from "lucide-react";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Client } from "@/lib/types";
import { formatCurrencyInput, formatZip } from "@/lib/utils";

import {
  EMPTY_PROJECT_FORM,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type ProjectFormData,
  projectSchema,
} from "./project-constants";

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  submitting: boolean;
  /** Pre-fill values when editing, or seed defaults (e.g. a pre-selected client) when adding. */
  initialData?: ProjectFormData;
  /** Clients for the parent-client selector. Omit when the client is locked. */
  clients?: Client[];
  /** When set, the project is bound to this client and the selector is hidden. */
  lockedClientId?: string;
  /** Client display name, shown in the description when the client is locked. */
  clientName?: string;
  onSubmit: (data: ProjectFormData) => void | Promise<void>;
}

const LABEL_CLASS = "h-5 flex items-center";

/**
 * Shared Add / Edit dialog for a design project. Used both from the Projects page
 * (with a parent-client selector) and from a client detail page (client locked).
 */
export function ProjectFormDialog({
  open,
  onOpenChange,
  mode,
  submitting,
  initialData,
  clients,
  lockedClientId,
  clientName,
  onSubmit,
}: ProjectFormDialogProps) {
  const seed = (): ProjectFormData => ({
    ...EMPTY_PROJECT_FORM,
    ...initialData,
    clientId: lockedClientId ?? initialData?.clientId ?? "",
  });

  const { control, handleSubmit, reset, watch, setValue } =
    useForm<ProjectFormData>({
      resolver: zodResolver(projectSchema),
      defaultValues: seed(),
    });

  const sameAsMain = watch("sameAsMain");
  const clientId = watch("clientId");

  // Focus bridge for the budget field: show raw digits while editing, formatted on blur.
  const [budgetFocused, setBudgetFocused] = useState(false);
  const [budgetText, setBudgetText] = useState("");

  useEffect(() => {
    if (sameAsMain && clientId) {
      const client = clients?.find((c) => c.uid === clientId);
      if (client) {
        setValue("street", client.street ?? "");
        setValue("city", client.city ?? "");
        setValue("state", client.state ?? "");
        setValue("zip", client.zip ?? "");
        setValue("country", client.country ?? "US");
      }
    }
  }, [sameAsMain, clientId, clients, setValue]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reseed only when the dialog opens
  useEffect(() => {
    if (open) reset(seed());
  }, [open, reset]);

  const title = mode === "edit" ? "Edit Project" : "Initialize Project";
  const submitLabel = mode === "edit" ? "Save Project" : "Initialize Project";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md lg:max-w-2xl">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle className="text-xl">{title}</DialogTitle>
            <DialogDescription>
              {lockedClientId && clientName ? (
                <>
                  Set up a new remodeling space, budget pool, and address
                  pre-assigned to{" "}
                  <span className="font-medium text-foreground">
                    {clientName}
                  </span>
                  .
                </>
              ) : (
                "Assign the project to a client, define budgets, and specify project address."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Country is fixed to "US" for now; persisted via a hidden field so the
                schema/data stay forward-compatible if multi-country support lands later. */}
            <Controller
              control={control}
              name="country"
              render={({ field }) => <input type="hidden" {...field} />}
            />

            {/* Parent client — hidden when locked to a specific client */}
            {!lockedClientId && (
              <Controller
                control={control}
                name="clientId"
                render={({ field, fieldState }) => (
                  <Field
                    className="flex flex-col gap-1.5"
                    data-invalid={fieldState.invalid}
                  >
                    <Label className={LABEL_CLASS}>
                      Parent Client{" "}
                      <span className="ml-0.5 text-destructive">*</span>
                    </Label>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-invalid={fieldState.invalid}>
                        <SelectValue placeholder="Select a client..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>All Clients</SelectLabel>
                          {(clients ?? []).map((client) => (
                            <SelectItem key={client.uid} value={client.uid}>
                              {client.firstName} {client.lastName}
                              {client.company ? ` (${client.company})` : ""}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            )}

            <Controller
              control={control}
              name="name"
              render={({ field, fieldState }) => (
                <Field
                  className="flex flex-col gap-1.5"
                  data-invalid={fieldState.invalid}
                >
                  <Label className={LABEL_CLASS}>
                    Project Title{" "}
                    <span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Input
                    {...field}
                    placeholder="e.g. Golden Dreams"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <Controller
                control={control}
                name="budget"
                render={({ field, fieldState }) => (
                  <Field
                    className="flex flex-col gap-1.5"
                    data-invalid={fieldState.invalid}
                  >
                    <Label className={LABEL_CLASS}>Project Budget</Label>
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <DollarSign className="size-4" />
                      </InputGroupAddon>
                      <InputGroupInput
                        name={field.name}
                        ref={field.ref}
                        type="text"
                        inputMode="numeric"
                        aria-invalid={fieldState.invalid}
                        value={
                          budgetFocused
                            ? budgetText
                            : formatCurrencyInput(field.value, {
                                noDecimals: true,
                              })
                        }
                        onFocus={() => {
                          setBudgetFocused(true);
                          setBudgetText(
                            formatCurrencyInput(field.value, {
                              noDecimals: true,
                            }),
                          );
                        }}
                        onBlur={() => {
                          setBudgetFocused(false);
                          field.onBlur();
                        }}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, "");
                          field.onChange(raw === "" ? 0 : Number(raw));
                          setBudgetText(
                            raw === ""
                              ? ""
                              : Number(raw).toLocaleString("en-US"),
                          );
                        }}
                      />
                    </InputGroup>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="status"
                render={({ field, fieldState }) => (
                  <Field
                    className="flex flex-col gap-1.5"
                    data-invalid={fieldState.invalid}
                  >
                    <Label className={LABEL_CLASS}>Status</Label>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-invalid={fieldState.invalid}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {PROJECT_STATUS_LABELS[s]}
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
            </div>

            <div className="flex items-center gap-2 rounded border border-border bg-muted/30 px-3 py-2.5">
              <Controller
                control={control}
                name="sameAsMain"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="same-as-main-checkbox"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label
                      size="large"
                      htmlFor="same-as-main-checkbox"
                      className="cursor-pointer select-none leading-none"
                    >
                      Same as client's main address
                    </Label>
                  </div>
                )}
              />
            </div>

            <div
              className="grid transition-all duration-300 ease-in-out"
              style={{ gridTemplateRows: !sameAsMain ? "1fr" : "0fr" }}
            >
              <div className="-mx-1 overflow-hidden px-1">
                <div className="flex flex-col gap-4 pt-1 pb-4">
                  <Controller
                    control={control}
                    name="street"
                    render={({ field, fieldState }) => (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>Street Address</Label>
                        <Input
                          {...field}
                          aria-invalid={fieldState.invalid}
                          autoComplete="one-time-code"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <div className="grid grid-cols-4 gap-4">
                    <Controller
                      control={control}
                      name="city"
                      render={({ field, fieldState }) => (
                        <Field
                          className="col-span-2 flex flex-col gap-1.5"
                          data-invalid={fieldState.invalid}
                        >
                          <Label className={LABEL_CLASS}>City</Label>
                          <Input
                            {...field}
                            aria-invalid={fieldState.invalid}
                            autoComplete="one-time-code"
                          />
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
                            autoComplete="one-time-code"
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
                          <Label className={LABEL_CLASS}>ZIP</Label>
                          <Input
                            {...field}
                            inputMode="numeric"
                            maxLength={5}
                            aria-invalid={fieldState.invalid}
                            onChange={(e) =>
                              field.onChange(formatZip(e.target.value))
                            }
                            autoComplete="one-time-code"
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Controller
              control={control}
              name="brief"
              render={({ field, fieldState }) => (
                <Field
                  className="flex flex-col gap-1.5"
                  data-invalid={fieldState.invalid}
                >
                  <Label className={LABEL_CLASS}>Project Brief</Label>
                  <Textarea
                    {...field}
                    placeholder="Warm organic minimalism, marble accent walls, gold hardware finish accents..."
                    aria-invalid={fieldState.invalid}
                    className="min-h-[80px]"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
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
