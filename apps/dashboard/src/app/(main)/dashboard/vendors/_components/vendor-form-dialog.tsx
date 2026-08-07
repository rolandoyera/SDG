"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronDownIcon, Image, Loader2, Upload } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import LunaMoon from "@/components/LunaMoon";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth-context";
import { AI_ASSISTANT_NAME } from "@/lib/ai-assistant";
import { runAiActionWithRetry } from "@/lib/ai-retry";
import { uploadVendorImage } from "@/lib/db";
import { cn, formatUsZip, formatVendorPhone } from "@/lib/utils";
import { autofillVendorFromUrl } from "@/server/ai-actions";

import {
  COUNTRIES,
  type CountryOption,
  EMPTY_VENDOR_FORM,
  regionLabelFor,
  VENDOR_CATEGORIES,
  type VendorFormData,
  vendorSchema,
  vendorToForm,
} from "./vendor-constants";

export {
  EMPTY_VENDOR_FORM,
  VENDOR_CATEGORIES,
  type VendorFormData,
  vendorSchema,
  vendorToForm,
};

const LABEL_CLASS = "h-5 flex items-center";

// ─── Image Picker ─────────────────────────────────────────────────────────────

interface ImagePickerDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidates: string[];
  onApply: (hero: string | null) => void;
}

function ImagePickerDialog({
  open,
  onOpenChange,
  candidates,
  onApply,
}: ImagePickerDialogProps) {
  const [selectedHero, setSelectedHero] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedHero(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">Select Cover Image</DialogTitle>
          <DialogDescription>
            {AI_ASSISTANT_NAME} found more than one cover image candidate for
            this vendor. Pick the one to use as the hero banner.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-0.5 py-1">
          <div className="grid grid-cols-3 gap-2">
            {candidates.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() =>
                  setSelectedHero(url === selectedHero ? null : url)
                }
                className={`relative aspect-video overflow-hidden rounded border-2 bg-muted/30 transition-all ${
                  selectedHero === url
                    ? "border-primary shadow-md"
                    : "border-border hover:border-muted-foreground/40"
                }`}
              >
                {/* biome-ignore lint/performance/noImgElement: selectable preview uses dynamic scraped hero image URLs. */}
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (
                      e.currentTarget.parentElement as HTMLElement
                    ).style.display = "none";
                  }}
                />
                {selectedHero === url && (
                  <div className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary">
                    <Check className="size-3 text-primary-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Skip
          </Button>
          <Button
            type="button"
            disabled={!selectedHero}
            onClick={() => {
              onApply(selectedHero);
              onOpenChange(false);
            }}
          >
            Apply Selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Vendor Form Dialog ───────────────────────────────────────────────────────

interface VendorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  initialData?: VendorFormData;
  vendorId?: string;
  onSave: (data: VendorFormData, customVendorId?: string) => Promise<void>;
}

export function VendorFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  vendorId,
  onSave,
}: VendorFormDialogProps) {
  const { organizationId } = useAuth();
  const form = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: initialData ?? EMPTY_VENDOR_FORM,
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting },
    reset,
    setValue,
    watch,
    getValues,
  } = form;

  const [aiLoading, setAiLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [heroCandidates, setHeroCandidates] = useState<string[]>([]);

  const logoUrlValue = watch("logoUrl");
  const heroImageUrlValue = watch("heroImageUrl");
  const countryValue = watch("country");
  const phoneCountryValue = watch("repPhoneCountry");
  const [phoneCountryTouched, setPhoneCountryTouched] = useState(false);

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [tempVendorId, setTempVendorId] = useState("");
  const [comboboxContainer, setComboboxContainer] =
    useState<HTMLDivElement | null>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!organizationId) {
      toast.error("No active organization.", { duration: 8000 });
      e.target.value = "";
      return;
    }
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image size exceeds 5MB limit.", { duration: 8000 });
      e.target.value = "";
      return;
    }
    setUploadingLogo(true);
    try {
      const { url, path } = await uploadVendorImage(
        organizationId,
        file,
        "logo",
        tempVendorId,
      );
      setValue("logoUrl", url);
      setValue("logoPath", path);
      toast.success("Logo uploaded successfully!");
    } catch (error) {
      console.error("Logo upload error:", error);
      toast.error("Failed to upload logo.");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  };

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!organizationId) {
      toast.error("No active organization.", { duration: 8000 });
      e.target.value = "";
      return;
    }
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image size exceeds 5MB limit.", { duration: 8000 });
      e.target.value = "";
      return;
    }
    setUploadingHero(true);
    try {
      const { url, path } = await uploadVendorImage(
        organizationId,
        file,
        "hero",
        tempVendorId,
      );
      setValue("heroImageUrl", url);
      setValue("heroImagePath", path);
      toast.success("Showcase image uploaded successfully!");
    } catch (error) {
      console.error("Hero upload error:", error);
      toast.error("Failed to upload showcase image.");
    } finally {
      setUploadingHero(false);
      e.target.value = "";
    }
  };

  useEffect(() => {
    if (open) {
      reset(initialData ?? EMPTY_VENDOR_FORM);
      setTempVendorId(
        vendorId ?? `vendor-${Math.random().toString(36).substr(2, 9)}`,
      );
      setPhoneCountryTouched(false);
      setHeroCandidates([]);
    }
  }, [open, initialData, reset, vendorId]);

  // While adding, keep the phone country following the address country until the
  // user overrides it. (Edit mode respects the stored repPhoneCountry as-is.)
  useEffect(() => {
    if (mode === "add" && !phoneCountryTouched) {
      setValue("repPhoneCountry", countryValue);
    }
  }, [mode, phoneCountryTouched, countryValue, setValue]);

  const handleEnrich = async () => {
    const url = getValues("website");
    if (!url) return;
    setAiLoading(true);
    const toastId = toast.loading(
      `${AI_ASSISTANT_NAME} is analyzing the vendor site…`,
    );
    try {
      const result = await runAiActionWithRetry(
        () => autofillVendorFromUrl(url),
        { toastId },
      );
      if (result.success && result.data) {
        const d = result.data;
        if (d.name) setValue("name", d.name);
        if (d.category) setValue("category", d.category);
        if (d.description) setValue("description", d.description);
        if (d.addressLine1) setValue("addressLine1", d.addressLine1);
        if (d.addressLine2) setValue("addressLine2", d.addressLine2);
        if (d.city) setValue("city", d.city);
        if (d.region) setValue("region", d.region);
        if (d.country) setValue("country", d.country);
        if (d.postalCode) {
          setValue(
            "postalCode",
            d.country === "US" ? formatUsZip(d.postalCode) : d.postalCode,
          );
        }
        if (d.formattedAddress)
          setValue("formattedAddress", d.formattedAddress);
        if (d.repPhone) {
          setValue(
            "repPhone",
            formatVendorPhone(
              d.repPhone,
              d.country ?? getValues("repPhoneCountry"),
            ),
          );
        }
        if (d.repEmail) setValue("repEmail", d.repEmail);
        if (d.logoUrl) setValue("logoUrl", d.logoUrl);
        if (d.heroImageUrl) setValue("heroImageUrl", d.heroImageUrl);
        if (d.instagram) setValue("instagram", d.instagram);
        if (d.pinterest) setValue("pinterest", d.pinterest);
        if (d.facebook) setValue("facebook", d.facebook);
        if (d.youtube) setValue("youtube", d.youtube);
        if (d.xTwitter) setValue("xTwitter", d.xTwitter);

        if (d.imageCandidates?.length) {
          setHeroCandidates(d.imageCandidates);
          // Open the cover-image picker right away when the AI couldn't decide
          // (multiple candidates it can't see) — the user makes the final call.
          if (d.showImagePicker) {
            setPickerOpen(true);
          }
        }

        toast.success(
          `Vendor enriched with ${AI_ASSISTANT_NAME} — please review the fields.`,
          {
            id: toastId,
          },
        );
      } else {
        toast.error(result.error ?? "Failed to enrich vendor.", {
          id: toastId,
        });
      }
    } finally {
      setAiLoading(false);
    }
  };

  const onSubmit = async (data: VendorFormData) => {
    await onSave(data, tempVendorId);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!isSubmitting && !aiLoading) onOpenChange(v);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          {/* Portal target so the country combobox popup renders within the dialog. */}
          <div ref={setComboboxContainer} />
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
            autoComplete="off"
          >
            <DialogHeader>
              <DialogTitle className="text-xl">
                {mode === "edit" ? "Edit Vendor" : "Add Vendor"}
              </DialogTitle>
              <DialogDescription>
                Input sourcing details, vendor contacts, and designer
                procurement notes.
              </DialogDescription>
            </DialogHeader>

            <div className="-mr-4 flex max-h-[65vh] flex-col gap-4 overflow-y-auto py-2 pr-4 pl-0.5">
              {/* Name + Category */}
              <div className="grid grid-cols-2 gap-4">
                <Controller
                  control={control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <Field
                      className="col-span-2 flex flex-col gap-1.5 sm:col-span-1"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>
                        Name <span className="ml-0.5 text-destructive">*</span>
                      </Label>
                      <Input
                        {...field}
                        placeholder="e.g. Arteriors, RH"
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
                  name="category"
                  render={({ field, fieldState }) => (
                    <Field
                      className="col-span-2 flex flex-col gap-1.5 sm:col-span-1"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>Category</Label>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger aria-invalid={fieldState.invalid}>
                          <SelectValue placeholder="Select category..." />
                        </SelectTrigger>
                        <SelectContent>
                          {VENDOR_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
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

              {/* Website + Enrich button */}
              <Controller
                control={control}
                name="website"
                render={({ field, fieldState }) => (
                  <Field
                    className="flex flex-col gap-1.5"
                    data-invalid={fieldState.invalid}
                  >
                    <Label className={LABEL_CLASS}>Website</Label>
                    <div className="flex gap-2">
                      <Input
                        {...field}
                        placeholder="www.arteriorshome.com"
                        aria-invalid={fieldState.invalid}
                        className="flex-1"
                        autoComplete="one-time-code"
                      />
                      <Button
                        type="button"
                        onClick={handleEnrich}
                        disabled={
                          !field.value || aiLoading ? true : isSubmitting
                        }
                        className="group relative h-10 shrink-0 cursor-pointer overflow-hidden border-0 bg-linear-to-r from-violet-600 to-indigo-500 px-3 font-medium text-sm text-white shadow-violet-500/20 shadow-xs transition-all duration-200 hover:scale-[1.03] hover:from-violet-500 hover:to-indigo-400 hover:shadow-lg hover:shadow-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:hover:scale-100"
                      >
                        {aiLoading && (
                          <span className="absolute inset-0 -translate-x-full animate-shimmer bg-linear-to-r from-transparent via-white/20 to-transparent" />
                        )}
                        <span className="relative flex items-center gap-1.5">
                          <LunaMoon
                            variant="phase"
                            thinking={aiLoading}
                            size={22}
                            className="size-[22px]"
                          />
                          <span>
                            {aiLoading
                              ? "Analyzing..."
                              : `Enrich with ${AI_ASSISTANT_NAME}`}
                          </span>
                        </span>
                      </Button>
                    </div>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              {/* Branding & Media Section */}
              <div className="flex flex-col gap-3 border-t pt-4">
                <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Branding & Gallery Media
                </h4>

                {/* Hidden File Uploaders */}
                <input
                  type="file"
                  id="vendor-logo-uploader"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                  disabled={uploadingLogo}
                />
                <input
                  type="file"
                  id="vendor-hero-uploader"
                  accept="image/*"
                  onChange={handleHeroUpload}
                  className="hidden"
                  disabled={uploadingHero}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                  {/* BRAND LOGO CARD (Aspect ratio 1:1, takes 4 columns on desktop) */}
                  <div className="flex flex-col gap-2 sm:col-span-4">
                    <Label className={LABEL_CLASS}>Logo</Label>
                    <div className="group/logo relative flex aspect-square w-full items-center justify-center overflow-hidden rounded border border-border bg-background transition-all hover:border-primary/50">
                      {uploadingLogo ? (
                        <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-center text-primary">
                          <Loader2 className="size-6 animate-spin" />
                          <p className="text-[10px]">Uploading...</p>
                        </div>
                      ) : logoUrlValue ? (
                        <>
                          {/* biome-ignore lint/performance/noImgElement: form preview uses dynamic logo URLs. */}
                          <img
                            src={logoUrlValue}
                            alt="Brand Logo"
                            className="absolute inset-0 size-full object-contain p-3"
                          />
                          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover/logo:opacity-100">
                            <Label
                              htmlFor="vendor-logo-uploader"
                              className="cursor-pointer rounded bg-white px-2 py-1 font-medium text-[10px] text-black hover:bg-gray-100"
                            >
                              Change
                            </Label>
                            <button
                              type="button"
                              onClick={() => {
                                setValue("logoUrl", "");
                                setValue("logoPath", "");
                              }}
                              className="rounded bg-destructive px-2 py-1 font-medium text-[10px] text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </button>
                          </div>
                        </>
                      ) : (
                        <Label
                          htmlFor="vendor-logo-uploader"
                          className="flex size-full cursor-pointer flex-col items-center justify-center gap-1.5 p-4 text-center text-muted-foreground/60 transition-colors hover:bg-muted/10 hover:text-muted-foreground"
                        >
                          <Upload className="size-6 text-muted-foreground/40" />
                          <p className="font-medium text-[11px]">Upload Logo</p>
                          <p className="text-[9px] text-muted-foreground/50">
                            Max 5MB
                          </p>
                        </Label>
                      )}
                    </div>
                  </div>

                  {/* HERO BANNER CARD (Aspect ratio 16:9, takes 8 columns on desktop) */}
                  <div className="flex flex-col gap-2 sm:col-span-8">
                    <Label className={LABEL_CLASS}>Hero Banner</Label>
                    <div className="group/hero relative flex aspect-video w-full items-center justify-center overflow-hidden rounded border border-border bg-background transition-all hover:border-primary/50">
                      {uploadingHero ? (
                        <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-center text-primary">
                          <Loader2 className="size-6 animate-spin" />
                          <p className="text-[10px]">Uploading...</p>
                        </div>
                      ) : heroImageUrlValue ? (
                        <>
                          {/* biome-ignore lint/performance/noImgElement: form preview uses dynamic hero image URLs. */}
                          <img
                            src={heroImageUrlValue}
                            alt="Hero Showcase"
                            className="absolute inset-0 size-full object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover/hero:opacity-100">
                            <Label
                              htmlFor="vendor-hero-uploader"
                              className="cursor-pointer rounded bg-white px-2 py-1 font-medium text-[10px] text-black hover:bg-gray-100"
                            >
                              Change
                            </Label>
                            <button
                              type="button"
                              onClick={() => {
                                setValue("heroImageUrl", "");
                                setValue("heroImagePath", "");
                              }}
                              className="rounded bg-destructive px-2 py-1 font-medium text-[10px] text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </button>
                          </div>
                        </>
                      ) : (
                        <Label
                          htmlFor="vendor-hero-uploader"
                          className="flex size-full cursor-pointer flex-col items-center justify-center gap-1.5 p-4 text-center text-muted-foreground/60 transition-colors hover:bg-muted/10 hover:text-muted-foreground"
                        >
                          <Upload className="size-6 text-muted-foreground/40" />
                          <p className="font-medium text-[11px]">
                            Upload Hero Banner
                          </p>
                          <p className="text-[9px] text-muted-foreground/50">
                            Max 5MB
                          </p>
                        </Label>
                      )}
                    </div>
                    {/* Reopen the cover-image picker after skipping or to change the pick */}
                    {heroCandidates.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPickerOpen(true)}
                        className="mt-1 h-7 w-full gap-1 text-[10px]"
                      >
                        <Image className="size-3" /> Choose Cover Image
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Account Number */}
              <Controller
                control={control}
                name="accountNumber"
                render={({ field, fieldState }) => (
                  <Field
                    className="flex flex-col gap-1.5"
                    data-invalid={fieldState.invalid}
                  >
                    <Label className={LABEL_CLASS}>Account Number</Label>
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

              {/* Description */}
              <Controller
                control={control}
                name="description"
                render={({ field, fieldState }) => (
                  <Field
                    className="flex flex-col gap-1.5"
                    data-invalid={fieldState.invalid}
                  >
                    <Label className={LABEL_CLASS}>Company Description</Label>
                    <Textarea
                      {...field}
                      placeholder="Brief company description..."
                      aria-invalid={fieldState.invalid}
                      className="min-h-[64px]"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              {/* Address */}
              <Controller
                control={control}
                name="addressLine1"
                render={({ field, fieldState }) => (
                  <Field
                    className="flex flex-col gap-1.5"
                    data-invalid={fieldState.invalid}
                  >
                    <Label className={LABEL_CLASS}>Address Line 1</Label>
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
                name="addressLine2"
                render={({ field, fieldState }) => (
                  <Field
                    className="flex flex-col gap-1.5"
                    data-invalid={fieldState.invalid}
                  >
                    <Label className={LABEL_CLASS}>Address Line 2</Label>
                    <Input
                      {...field}
                      placeholder="Apt, suite, unit, building, floor, etc."
                      aria-invalid={fieldState.invalid}
                      autoComplete="one-time-code"
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
                  name="country"
                  render={({ field, fieldState }) => {
                    const selected =
                      COUNTRIES.find((c) => c.code === field.value) ?? null;
                    return (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>
                          Country{" "}
                          <span className="ml-0.5 text-destructive">*</span>
                        </Label>
                        <Combobox
                          value={selected}
                          onValueChange={(item: CountryOption | null) =>
                            field.onChange(item?.code ?? "")
                          }
                          items={COUNTRIES}
                          filter={(item: CountryOption, inputValue: string) =>
                            item.name
                              .toLowerCase()
                              .includes(inputValue.toLowerCase())
                          }
                        >
                          <ComboboxTrigger
                            render={
                              <button
                                type="button"
                                aria-invalid={fieldState.invalid}
                                className={cn(
                                  "flex h-10 w-full items-center justify-between whitespace-nowrap rounded border border-input bg-transparent px-2.5 text-sm outline-none transition-colors",
                                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                                  "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
                                  "dark:bg-input/30",
                                  !selected && "text-muted-foreground",
                                )}
                              >
                                <span className="truncate">
                                  {selected
                                    ? selected.name
                                    : "Select country..."}
                                </span>
                                <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                              </button>
                            }
                          />
                          <ComboboxContent container={comboboxContainer}>
                            <ComboboxInput
                              showTrigger={false}
                              placeholder="Search countries..."
                            />
                            <ComboboxEmpty>No country found.</ComboboxEmpty>
                            <ComboboxList>
                              {(item: CountryOption) => (
                                <ComboboxItem key={item.code} value={item}>
                                  {item.name}
                                </ComboboxItem>
                              )}
                            </ComboboxList>
                          </ComboboxContent>
                        </Combobox>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    );
                  }}
                />
                <Controller
                  control={control}
                  name="city"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
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
                  name="region"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>
                        {regionLabelFor(countryValue)}
                      </Label>
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
                  name="postalCode"
                  render={({ field, fieldState }) => {
                    const isUs = countryValue === "US";
                    return (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>
                          {isUs ? "ZIP Code" : "Postal Code"}
                        </Label>
                        <Input
                          {...field}
                          inputMode={isUs ? "numeric" : undefined}
                          maxLength={isUs ? 10 : 20}
                          aria-invalid={fieldState.invalid}
                          onChange={(e) =>
                            field.onChange(
                              isUs
                                ? formatUsZip(e.target.value)
                                : e.target.value,
                            )
                          }
                          autoComplete="one-time-code"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    );
                  }}
                />
              </div>

              {/* Rep Info */}
              <div className="grid grid-cols-2 gap-4">
                <Controller
                  control={control}
                  name="repName"
                  render={({ field, fieldState }) => (
                    <Field
                      className="col-span-2 flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>Contact Name</Label>
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
                  name="repEmail"
                  render={({ field, fieldState }) => (
                    <Field
                      className="col-span-2 flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>Contact Email</Label>
                      <Input
                        {...field}
                        type="email"
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
                  name="repPhoneCountry"
                  render={({ field, fieldState }) => {
                    const selected =
                      COUNTRIES.find((c) => c.code === field.value) ?? null;
                    return (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>Phone Country</Label>
                        <Combobox
                          value={selected}
                          onValueChange={(item: CountryOption | null) => {
                            setPhoneCountryTouched(true);
                            const code = item?.code ?? "";
                            field.onChange(code);
                            // Re-apply formatting to the existing number under the new country.
                            setValue(
                              "repPhone",
                              formatVendorPhone(getValues("repPhone"), code),
                            );
                          }}
                          items={COUNTRIES}
                          filter={(item: CountryOption, inputValue: string) =>
                            item.name
                              .toLowerCase()
                              .includes(inputValue.toLowerCase())
                          }
                        >
                          <ComboboxTrigger
                            render={
                              <button
                                type="button"
                                aria-invalid={fieldState.invalid}
                                className={cn(
                                  "flex h-10 w-full items-center justify-between whitespace-nowrap rounded border border-input bg-transparent px-2.5 text-sm outline-none transition-colors",
                                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                                  "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
                                  "dark:bg-input/30",
                                  !selected && "text-muted-foreground",
                                )}
                              >
                                <span className="truncate">
                                  {selected
                                    ? selected.name
                                    : "Select country..."}
                                </span>
                                <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                              </button>
                            }
                          />
                          <ComboboxContent container={comboboxContainer}>
                            <ComboboxInput
                              showTrigger={false}
                              placeholder="Search countries..."
                            />
                            <ComboboxEmpty>No country found.</ComboboxEmpty>
                            <ComboboxList>
                              {(item: CountryOption) => (
                                <ComboboxItem key={item.code} value={item}>
                                  {item.name}
                                </ComboboxItem>
                              )}
                            </ComboboxList>
                          </ComboboxContent>
                        </Combobox>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    );
                  }}
                />
                <Controller
                  control={control}
                  name="repPhone"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={LABEL_CLASS}>Contact Phone</Label>
                      <Input
                        {...field}
                        aria-invalid={fieldState.invalid}
                        onChange={(e) =>
                          field.onChange(
                            formatVendorPhone(
                              e.target.value,
                              phoneCountryValue,
                            ),
                          )
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

              {/* Social Media Links */}
              <div className="mt-2 border-muted/60 border-t pt-4">
                <h4 className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Social Media Links
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <Controller
                    control={control}
                    name="instagram"
                    render={({ field, fieldState }) => (
                      <Field
                        className="col-span-2 flex flex-col gap-1.5 sm:col-span-1"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>Instagram URL</Label>
                        <Input
                          {...field}
                          placeholder="https://instagram.com/handle"
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
                    name="pinterest"
                    render={({ field, fieldState }) => (
                      <Field
                        className="col-span-2 flex flex-col gap-1.5 sm:col-span-1"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>Pinterest URL</Label>
                        <Input
                          {...field}
                          placeholder="https://pinterest.com/handle"
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
                    name="facebook"
                    render={({ field, fieldState }) => (
                      <Field
                        className="col-span-2 flex flex-col gap-1.5 sm:col-span-1"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>Facebook URL</Label>
                        <Input
                          {...field}
                          placeholder="https://facebook.com/handle"
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
                    name="youtube"
                    render={({ field, fieldState }) => (
                      <Field
                        className="col-span-2 flex flex-col gap-1.5 sm:col-span-1"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>YouTube URL</Label>
                        <Input
                          {...field}
                          placeholder="https://youtube.com/c/handle"
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
                    name="xTwitter"
                    render={({ field, fieldState }) => (
                      <Field
                        className="col-span-2 flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>X / Twitter URL</Label>
                        <Input
                          {...field}
                          placeholder="https://x.com/handle"
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

              {/* Notes */}
              <Controller
                control={control}
                name="notes"
                render={({ field, fieldState }) => (
                  <Field
                    className="flex flex-col gap-1.5"
                    data-invalid={fieldState.invalid}
                  >
                    <Label className={LABEL_CLASS}>Internal Notes</Label>
                    <Textarea
                      {...field}
                      placeholder="Discount codes, account notes, etc..."
                      aria-invalid={fieldState.invalid}
                      className="min-h-[72px]"
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
                disabled={isSubmitting || aiLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || aiLoading}
                className="flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                {mode === "edit" ? "Save Changes" : "Create Vendor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ImagePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        candidates={heroCandidates}
        onApply={(hero) => {
          if (hero) setValue("heroImageUrl", hero);
        }}
      />
    </>
  );
}
