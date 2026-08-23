"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { useAuth } from "@/components/auth-context";
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
import { addVendor } from "@/lib/db";
import type { Vendor } from "@/lib/types";

const quickVendorSchema = z.object({
  name: z.string().min(1, "Vendor name is required."),
  website: z.string(),
});

type QuickVendorFormData = z.infer<typeof quickVendorSchema>;

const EMPTY_QUICK_VENDOR: QuickVendorFormData = { name: "", website: "" };

interface QuickVendorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the newly created vendor so the host can add + select it. */
  onCreated: (vendor: Vendor) => void;
}

/** Lightweight inline vendor creation, used from the item form's vendor selector. */
export function QuickVendorDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickVendorDialogProps) {
  // The ACTIVE org, not profile.organizationId (the HOME org) — a SuperAdmin
  // working inside a tenant must create the vendor in that tenant.
  const { organizationId } = useAuth();
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<QuickVendorFormData>({
    resolver: zodResolver(quickVendorSchema),
    defaultValues: EMPTY_QUICK_VENDOR,
  });

  // Clear fields each time the dialog is opened.
  useEffect(() => {
    if (open) reset(EMPTY_QUICK_VENDOR);
  }, [open, reset]);

  const onSubmit = async (data: QuickVendorFormData) => {
    if (!organizationId) return;
    try {
      const created = await addVendor({
        name: data.name.trim(),
        website: data.website.trim(),
        repName: "",
        repEmail: "",
        repPhone: "",
        notes: "Quick-created during Catalog Item entry.",
        organizationId,
      });
      onCreated(created);
      onOpenChange(false);
      toast.success(`Vendor "${created.name}" created and selected!`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create vendor.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Quick Create Vendor</DialogTitle>
            <DialogDescription className="text-xs mb-4">
              Add a new vendor for this catalog item instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2 text-xs">
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState }) => (
                <Field
                  className="flex flex-col gap-1"
                  data-invalid={fieldState.invalid}
                >
                  <Label className="text-muted-foreground">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...field}
                    placeholder="Insert vendor name"
                    className="h-8 text-xs"
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
              name="website"
              render={({ field, fieldState }) => (
                <Field
                  className="flex flex-col gap-1"
                  data-invalid={fieldState.invalid}
                >
                  <Label className="text-muted-foreground">Website</Label>
                  <Input
                    {...field}
                    placeholder="Insert website URL"
                    className="h-8 text-xs"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>
          <DialogFooter className="mt-3">
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="flex items-center gap-1.5"
            >
              {isSubmitting && <Loader2 className="size-3 animate-spin" />}
              Create Vendor
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
