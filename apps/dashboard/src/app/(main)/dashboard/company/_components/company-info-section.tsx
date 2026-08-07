"use client";

import { Controller } from "react-hook-form";

import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Organization } from "@/lib/types";
import { formatUsZip, formatVendorPhone } from "@/lib/utils";

import {
  COUNTRIES,
  countryName,
  regionLabelFor,
} from "../../vendors/_components/vendor-constants";
import { SearchSelect } from "@/components/search-select";
import {
  EditableCardHeader,
  LABEL_CLASS,
  type SectionDialogChildProps,
} from "./section-dialog";
import { DataField } from "@/components/ui/data-field";

export function CompanyInfoCard({
  org,
  onEdit,
}: {
  org: Organization;
  onEdit: () => void;
}) {
  const cp = org.companyProfile;

  return (
    <Card variant="panel" className="pt-0 lg:col-span-1">
      <EditableCardHeader title="Company Information" onEdit={onEdit} />
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-6">
          <DataField label="Company Name" empty="Not Set">
            {cp?.displayName ?? org.name}
          </DataField>
          <DataField label="Legal Name" empty="Not Set">
            {cp?.legalName}
          </DataField>
          <DataField label="Address" empty="Not Set">
            {org.companyProfile?.address?.line1 ? (
              <p>{org.companyProfile?.address?.line1}</p>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
            {org.companyProfile?.address?.line2 ? (
              <p>{org.companyProfile?.address?.line2}</p>
            ) : null}
            {org.companyProfile?.address?.city ? (
              <p className="flex gap-1">
                <span>{org.companyProfile?.address?.city},</span>
                <span>{org.companyProfile?.address?.state}</span>{" "}
                <span>{org.companyProfile?.address?.postalCode}</span>
              </p>
            ) : null}
            <p>
              {org.companyProfile?.address?.country
                ? countryName(org.companyProfile.address.country)
                : "—"}
            </p>
          </DataField>
        </div>

        <div className="space-y-6">
          <DataField label="Email" empty="Not Set">
            {cp?.email}
          </DataField>
          <DataField label="Phone" empty="Not Set">
            {cp?.phone}
          </DataField>
          <DataField label="Website" empty="Not Set">
            {cp?.website}
          </DataField>
        </div>
      </CardContent>
    </Card>
  );
}

export function CompanyInfoFields({
  control,
  watch,
  setValue,
  container,
}: SectionDialogChildProps) {
  const countryValue = watch("country");
  const phoneCountryValue = watch("phoneCountry");
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="displayName"
          render={({ field, fieldState }) => (
            <Field
              className="flex flex-col gap-1.5"
              data-invalid={fieldState.invalid}
            >
              <Label className={LABEL_CLASS}>
                Company Name <span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input
                {...field}
                placeholder="e.g. Sarvian Design Group"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={control}
          name="legalName"
          render={({ field, fieldState }) => (
            <Field
              className="flex flex-col gap-1.5"
              data-invalid={fieldState.invalid}
            >
              <Label className={LABEL_CLASS}>Legal Name</Label>
              <Input
                {...field}
                placeholder="e.g. Sarvian Design Group, LLC"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <Field
              className="flex flex-col gap-1.5 sm:col-span-2"
              data-invalid={fieldState.invalid}
            >
              <Label className={LABEL_CLASS}>Email</Label>
              <Input
                {...field}
                type="email"
                placeholder="hello@studio.com"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={control}
          name="phoneCountry"
          render={({ field }) => (
            <Field className="flex flex-col gap-1.5">
              <Label className={LABEL_CLASS}>Phone Country</Label>
              <SearchSelect
                items={COUNTRIES}
                value={field.value}
                onChange={(code) => {
                  field.onChange(code);
                  // Re-apply formatting to the existing number under the new country.
                  setValue("phone", formatVendorPhone(watch("phone"), code));
                }}
                placeholder="Select country..."
                searchPlaceholder="Search countries..."
                emptyText="No country found."
                container={container}
              />
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
              <Label className={LABEL_CLASS}>Phone</Label>
              <Input
                {...field}
                placeholder="(555) 123-4567"
                aria-invalid={fieldState.invalid}
                onChange={(e) =>
                  field.onChange(
                    formatVendorPhone(e.target.value, phoneCountryValue),
                  )
                }
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={control}
          name="website"
          render={({ field, fieldState }) => (
            <Field
              className="flex flex-col gap-1.5 sm:col-span-2"
              data-invalid={fieldState.invalid}
            >
              <Label className={LABEL_CLASS}>Website</Label>
              <Input
                {...field}
                placeholder="https://www.studio.com"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider sm:col-span-2">
          Address
        </p>
        <Controller
          control={control}
          name="line1"
          render={({ field, fieldState }) => (
            <Field
              className="flex flex-col gap-1.5 sm:col-span-2"
              data-invalid={fieldState.invalid}
            >
              <Label className={LABEL_CLASS}>Address Line 1</Label>
              <Input {...field} aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={control}
          name="line2"
          render={({ field, fieldState }) => (
            <Field
              className="flex flex-col gap-1.5 sm:col-span-2"
              data-invalid={fieldState.invalid}
            >
              <Label className={LABEL_CLASS}>Address Line 2</Label>
              <Input
                {...field}
                placeholder="Suite, unit, floor, etc."
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={control}
          name="country"
          render={({ field }) => (
            <Field className="flex flex-col gap-1.5">
              <Label className={LABEL_CLASS}>Country</Label>
              <SearchSelect
                items={COUNTRIES}
                value={field.value}
                onChange={field.onChange}
                placeholder="Select country..."
                searchPlaceholder="Search countries..."
                emptyText="No country found."
                container={container}
              />
            </Field>
          )}
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
              <Input {...field} aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
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
              <Label className={LABEL_CLASS}>
                {regionLabelFor(countryValue)}
              </Label>
              <Input {...field} aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
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
                      isUs ? formatUsZip(e.target.value) : e.target.value,
                    )
                  }
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            );
          }}
        />
      </div>
    </>
  );
}
