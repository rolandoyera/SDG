"use client";

import { useState } from "react";

import { Loader2, Upload } from "lucide-react";
import { Controller } from "react-hook-form";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { uploadOrgBrandingImage } from "@/lib/db";
import type { Organization } from "@/lib/types";
import { cn } from "@/lib/utils";

import {
  EditableCardHeader,
  LABEL_CLASS,
  type SectionDialogChildProps,
} from "./section-dialog";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function LogoImageUpload({
  id,
  label,
  hint,
  type,
  organizationId,
  url,
  dark,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  type: "logo-light" | "logo-dark" | "icon-light" | "icon-dark";
  organizationId: string;
  url: string;
  /** Dark backdrop, for previewing light/transparent logos. */
  dark?: boolean;
  onChange: (url: string, path: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image size exceeds 5MB limit.", { duration: 8000 });
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const result = await uploadOrgBrandingImage(file, type, organizationId);
      onChange(result.url, result.path);
      toast.success(`${label} uploaded successfully!`);
    } catch (error) {
      console.error(`${label} upload error:`, error);
      toast.error(`Failed to upload ${label.toLowerCase()}.`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className={LABEL_CLASS}>{label}</Label>
      <input
        type="file"
        id={id}
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
        disabled={uploading}
      />
      <div
        className={cn(
          "group/img relative flex aspect-square w-full items-center justify-center overflow-hidden rounded border border-border transition-all hover:border-primary/50",
          dark ? "bg-neutral-900" : "bg-background",
        )}>
        {uploading ? (
          <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-center text-primary">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-[10px]">Uploading...</p>
          </div>
        ) : url ? (
          <>
            {/* biome-ignore lint/performance/noImgElement: form preview uses dynamic logo URLs. */}
            <img
              src={url}
              alt={label}
              className="absolute inset-0 size-full object-contain p-3"
            />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover/img:opacity-100">
              <Label
                htmlFor={id}
                className="cursor-pointer rounded bg-white px-2 py-1 font-medium text-[10px] text-black hover:bg-gray-100">
                Change
              </Label>
              <button
                type="button"
                onClick={() => onChange("", "")}
                className="rounded bg-destructive px-2 py-1 font-medium text-[10px] text-destructive-foreground hover:bg-destructive/90">
                Remove
              </button>
            </div>
          </>
        ) : (
          <Label
            htmlFor={id}
            className="flex size-full cursor-pointer flex-col items-center justify-center gap-1.5 p-4 text-center text-muted-foreground/60 transition-colors hover:bg-muted/10 hover:text-muted-foreground">
            <Upload className="size-6 text-muted-foreground/40" />
            <p className="font-medium text-[11px]">Upload {label}</p>
            <p className="text-[9px] text-muted-foreground/50">
              {hint ?? "Max 5MB"}
            </p>
          </Label>
        )}
      </div>
    </div>
  );
}

function LogoThumb({
  label,
  url,
  dark,
}: {
  label: string;
  url?: string;
  dark?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className={LABEL_CLASS}>{label}</Label>
      <div
        className={cn(
          "relative flex aspect-square w-full items-center justify-center overflow-hidden rounded border border-border",
          dark ? "bg-neutral-900" : "bg-white",
        )}>
        {url ? (
          // biome-ignore lint/performance/noImgElement: display uses dynamic logo URLs.
          <img
            src={url}
            alt={label}
            className="absolute inset-0 size-full object-contain p-3"
          />
        ) : (
          <span className="text-muted-foreground text-xs">Upload logo</span>
        )}
      </div>
    </div>
  );
}

export function LogoCard({
  org,
  onEdit,
}: {
  org: Organization;
  onEdit: () => void;
}) {
  const b = org.branding;
  return (
    <Card variant="panel" className="lg:col-span-1">
      <EditableCardHeader title="Logo" onEdit={onEdit} />
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <LogoThumb label="Light Logo" url={b?.logoLightUrl} dark />
          <LogoThumb
            label="Dark Logo - (For light backgrounds)"
            url={b?.logoDarkUrl}
          />
          <LogoThumb label="Light Icon" url={b?.iconLightUrl} dark />
          <LogoThumb label="Dark Icon" url={b?.iconDarkUrl} />
        </div>
      </CardContent>
    </Card>
  );
}

export function LogoFields({
  control,
  setValue,
  organizationId,
}: SectionDialogChildProps & { organizationId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Controller
          control={control}
          name="logoLightUrl"
          render={({ field }) => (
            <LogoImageUpload
              id="org-logo-light-uploader"
              label="Light Logo"
              hint="For dark backgrounds"
              type="logo-light"
              organizationId={organizationId}
              url={field.value}
              dark
              onChange={(url, path) => {
                field.onChange(url);
                setValue("logoLightPath", path, { shouldDirty: true });
              }}
            />
          )}
        />
        <Controller
          control={control}
          name="logoDarkUrl"
          render={({ field }) => (
            <LogoImageUpload
              id="org-logo-dark-uploader"
              label="Dark Logo"
              hint="For light backgrounds"
              type="logo-dark"
              organizationId={organizationId}
              url={field.value}
              onChange={(url, path) => {
                field.onChange(url);
                setValue("logoDarkPath", path, { shouldDirty: true });
              }}
            />
          )}
        />
        <Controller
          control={control}
          name="iconLightUrl"
          render={({ field }) => (
            <LogoImageUpload
              id="org-icon-light-uploader"
              label="Light Icon"
              hint="For dark backgrounds"
              type="icon-light"
              organizationId={organizationId}
              url={field.value}
              dark
              onChange={(url, path) => {
                field.onChange(url);
                setValue("iconLightPath", path, { shouldDirty: true });
              }}
            />
          )}
        />
        <Controller
          control={control}
          name="iconDarkUrl"
          render={({ field }) => (
            <LogoImageUpload
              id="org-icon-dark-uploader"
              label="Dark Icon"
              hint="For light backgrounds"
              type="icon-dark"
              organizationId={organizationId}
              url={field.value}
              onChange={(url, path) => {
                field.onChange(url);
                setValue("iconDarkPath", path, { shouldDirty: true });
              }}
            />
          )}
        />
      </div>
    </div>
  );
}
