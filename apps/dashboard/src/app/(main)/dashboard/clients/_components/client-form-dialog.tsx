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
  formatPhone,
  formatTaxId,
  formatZip,
  normalizeTaxId,
} from "@/lib/utils";

import {
  type ClientFormData,
  clientSchema,
  EMPTY_CLIENT_FORM,
} from "./client-constants";

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  submitting: boolean;
  /** Pre-fill field values when editing an existing client. */
  defaultValues?: Partial<ClientFormData>;
  /** Called with the validated field values when the form is submitted. */
  onSubmit: (data: ClientFormData) => void;
}

const LABEL_CLASS = "h-5 flex items-center";

/**
 * Shared Add / Edit dialog for a client profile. Wired through React Hook Form +
 * Zod, reseeded from `defaultValues` each time the dialog opens.
 */
export function ClientFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  submitting,
  defaultValues,
  onSubmit,
}: ClientFormDialogProps) {
  const { control, handleSubmit, reset, watch } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      ...EMPTY_CLIENT_FORM,
      ...defaultValues,
      isCompany:
        defaultValues?.isCompany ??
        (!!defaultValues?.company || !!defaultValues?.taxId),
      phone: formatPhone(defaultValues?.phone ?? ""),
      taxId: formatTaxId(defaultValues?.taxId ?? ""),
    },
  });

  const isCompany = watch("isCompany");

  // biome-ignore lint/correctness/useExhaustiveDependencies: reseed only when the dialog opens, not on every defaultValues change
  useEffect(() => {
    if (open) {
      reset({
        ...EMPTY_CLIENT_FORM,
        ...defaultValues,
        isCompany:
          defaultValues?.isCompany ??
          (!!defaultValues?.company || !!defaultValues?.taxId),
        phone: formatPhone(defaultValues?.phone ?? ""),
        taxId: formatTaxId(defaultValues?.taxId ?? ""),
      });
    }
  }, [open, reset]);

  const handleFormSubmit = (data: ClientFormData) => {
    onSubmit({
      ...data,
      company: data.isCompany ? data.company : "",
      taxId: data.isCompany ? normalizeTaxId(data.taxId) : "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex flex-col gap-4"
          noValidate>
          <DialogHeader className="mb-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          {/* Country is fixed to "US" for now; persisted via a hidden field so the
              schema/data stay forward-compatible if multi-country support lands later. */}
          <Controller
            control={control}
            name="country"
            render={({ field }) => <input type="hidden" {...field} />}
          />

          <div className="grid grid-cols-2 gap-4 rounded border border-border bg-muted/30 px-3 py-2.5">
            <Controller
              control={control}
              name="isCompany"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is-company-checkbox"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    size="large"
                    htmlFor="is-company-checkbox"
                    className="cursor-pointer select-none leading-none">
                    This is a company or commercial entity
                  </Label>
                </div>
              )}
            />

            <Controller
              control={control}
              name="taxable"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="taxable-checkbox"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    size="large"
                    htmlFor="taxable-checkbox"
                    className="cursor-pointer select-none">
                    This client is taxable
                  </Label>
                </div>
              )}
            />
          </div>

          <div className="flex flex-col gap-4 py-2">
            <div
              className="grid transition-all duration-300 ease-in-out"
              style={{ gridTemplateRows: isCompany ? "1fr" : "0fr" }}>
              <div className="-mx-1 overflow-hidden px-1">
                <div className="grid grid-cols-2 gap-4 pt-1 pb-4">
                  <Controller
                    control={control}
                    name="company"
                    render={({ field, fieldState }) => (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}>
                        <Label className={LABEL_CLASS}>
                          Company Name{" "}
                          {isCompany && (
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
                    name="taxId"
                    render={({ field, fieldState }) => (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}>
                        <Label className={LABEL_CLASS}>Tax ID</Label>
                        <Input
                          {...field}
                          placeholder="xx-xxxxxxx"
                          aria-invalid={fieldState.invalid}
                          onChange={(e) =>
                            field.onChange(formatTaxId(e.target.value))
                          }
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
            <div className="grid grid-cols-2 gap-4">
              <Controller
                control={control}
                name="firstName"
                render={({ field, fieldState }) => (
                  <Field
                    className="flex flex-col gap-1.5"
                    data-invalid={fieldState.invalid}>
                    <Label className={LABEL_CLASS}>
                      First Name{" "}
                      <span className="ml-0.5 text-destructive">*</span>
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
                    data-invalid={fieldState.invalid}>
                    <Label className={LABEL_CLASS}>
                      Last Name{" "}
                      <span className="ml-0.5 text-destructive">*</span>
                    </Label>
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
                    data-invalid={fieldState.invalid}>
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
                    data-invalid={fieldState.invalid}>
                    <Label className={LABEL_CLASS}>Phone Number</Label>
                    <Input
                      {...field}
                      placeholder="(555) 000-0000"
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
                  data-invalid={fieldState.invalid}>
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
                    data-invalid={fieldState.invalid}>
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
                    data-invalid={fieldState.invalid}>
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
                    data-invalid={fieldState.invalid}>
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
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2">
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
