"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPhone, formatZip } from "@/lib/utils";

import {
  CONTRACTOR_SUBCATEGORIES,
  EMPTY_TRADE_FORM,
  ENGINEER_SUBCATEGORIES,
  FABRICATOR_SUBCATEGORIES,
  INSTALLER_SUBCATEGORIES,
  TRADE_TYPES,
  type TradeFormData,
  tradeSchema,
} from "./trade-constants";

interface TradeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  initialData?: TradeFormData;
  tradeId?: string;
  onSave: (data: TradeFormData, customTradeId?: string) => Promise<void>;
}

const LABEL_CLASS = "h-5 flex items-center";

export function TradeFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  tradeId,
  onSave,
}: TradeFormDialogProps) {
  const form = useForm<TradeFormData>({
    resolver: zodResolver(tradeSchema),
    defaultValues: initialData ?? EMPTY_TRADE_FORM,
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting },
    reset,
    watch,
    setValue,
  } = form;

  const tradeTypeValue = watch("tradeType");
  const isGroupedType = [
    "Contractors",
    "Installers",
    "Fabricators",
    "Engineer",
  ].includes(tradeTypeValue);

  useEffect(() => {
    if (open) {
      reset(initialData ?? EMPTY_TRADE_FORM);
    }
  }, [open, initialData, reset]);

  const onSubmit = async (data: TradeFormData) => {
    await onSave(data, tradeId);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isSubmitting) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
          autoComplete="off"
        >
          <DialogHeader>
            <DialogTitle className="text-xl">
              {mode === "edit" ? "Edit Trade Profile" : "Add Trade Profile"}
            </DialogTitle>
            <DialogDescription>
              Input trade type details, primary contact specifications, and
              credentials.
            </DialogDescription>
          </DialogHeader>

          <div className="-mr-4 flex max-h-[65vh] flex-col gap-5 overflow-y-auto py-2 pr-4 pl-0.5">
            {/* Primary Details Section */}
            <div>
              <Label size="large" className="mb-3">
                Primary Specifications
              </Label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="companyName"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5 sm:col-span-2"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>
                        Company Name{" "}
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
                  name="tradeType"
                  render={({ field, fieldState }) => (
                    <Field
                      className={
                        isGroupedType
                          ? "flex flex-col gap-1.5"
                          : "flex flex-col gap-1.5 sm:col-span-2"
                      }
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>
                        Trade Type{" "}
                        <span className="ml-0.5 text-destructive">*</span>
                      </Label>
                      <Select
                        value={field.value}
                        onValueChange={(val) => {
                          field.onChange(val);
                          setValue("tradeSubcategory", "");
                        }}
                      >
                        <SelectTrigger aria-invalid={fieldState.invalid}>
                          <SelectValue placeholder="Select trade type..." />
                        </SelectTrigger>
                        <SelectContent>
                          {TRADE_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
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
                {isGroupedType && (
                  <Controller
                    control={control}
                    name="tradeSubcategory"
                    render={({ field, fieldState }) => (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>
                          {tradeTypeValue === "Contractors"
                            ? "Contractor Subcategory"
                            : tradeTypeValue === "Installers"
                              ? "Installer Subcategory"
                              : tradeTypeValue === "Fabricators"
                                ? "Fabricator Subcategory"
                                : "Engineer Subcategory"}{" "}
                          <span className="ml-0.5 text-destructive">*</span>
                        </Label>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger aria-invalid={fieldState.invalid}>
                            <SelectValue placeholder="Select subcategory..." />
                          </SelectTrigger>
                          <SelectContent>
                            {(tradeTypeValue === "Contractors"
                              ? CONTRACTOR_SUBCATEGORIES
                              : tradeTypeValue === "Installers"
                                ? INSTALLER_SUBCATEGORIES
                                : tradeTypeValue === "Fabricators"
                                  ? FABRICATOR_SUBCATEGORIES
                                  : ENGINEER_SUBCATEGORIES
                            ).map((sub) => (
                              <SelectItem key={sub} value={sub}>
                                {sub}
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
                )}
                <Controller
                  control={control}
                  name="contactFirstName"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>Contact First Name</Label>
                      <Input {...field} aria-invalid={fieldState.invalid} />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="contactLastName"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>Contact Last Name</Label>
                      <Input {...field} aria-invalid={fieldState.invalid} />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>
            </div>

            {/* Contact Details Section */}
            <div className="border-t pt-4">
              <Label size="large" className="mb-3">
                Contact Info
              </Label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                <Controller
                  control={control}
                  name="website"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>Website URL</Label>
                      <Input
                        {...field}
                        placeholder="https://company.com"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>
            </div>

            {/* Address Details Section */}
            <div className="border-t pt-4">
              <Label size="large" className="mb-3">
                Address Details
              </Label>
              <div className="flex flex-col gap-4">
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
                          onChange={(e) =>
                            field.onChange(e.target.value.toUpperCase())
                          }
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
            </div>

            {/* Compliance Credentials Section */}
            <div className="border-t pt-4">
              <Label size="large" className="mb-3">
                Compliance & Credentials
              </Label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* License details */}
                <div className="flex flex-col gap-4 rounded border bg-muted/20 p-4">
                  <Label className="text-foreground">License Info</Label>
                  <Controller
                    control={control}
                    name="licenseNumber"
                    render={({ field, fieldState }) => (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>License #</Label>
                        <Input
                          {...field}
                          placeholder="e.g. LIC-123456"
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
                    name="licenseExpirationDate"
                    render={({ field, fieldState }) => (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>
                          License Expiration Date
                        </Label>
                        <Input
                          {...field}
                          type="date"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </div>

                {/* Insurance details */}
                <div className="flex flex-col gap-4 rounded border bg-muted/20 p-4">
                  <Label className="text-foreground">Insurance Info</Label>
                  <Controller
                    control={control}
                    name="insurancePolicyNumber"
                    render={({ field, fieldState }) => (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>
                          Insurance Policy #
                        </Label>
                        <Input
                          {...field}
                          placeholder="e.g. POL-98765"
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
                    name="insuranceProvider"
                    render={({ field, fieldState }) => (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>
                          Insurance Provider
                        </Label>
                        <Input
                          {...field}
                          placeholder="e.g. Geico, Progressive"
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
                    name="insuranceExpirationDate"
                    render={({ field, fieldState }) => (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>
                          Insurance Expiration Date
                        </Label>
                        <Input
                          {...field}
                          type="date"
                          aria-invalid={fieldState.invalid}
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

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {mode === "edit" ? "Save Changes" : "Create Trade Profile"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
