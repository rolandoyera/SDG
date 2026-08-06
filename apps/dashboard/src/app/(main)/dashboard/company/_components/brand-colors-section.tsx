"use client";

import { Controller } from "react-hook-form";

import { Card, CardContent } from "@/components/ui/card";
import { DataField } from "@/components/ui/data-field";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Organization } from "@/lib/types";

import {
  EditableCardHeader,
  LABEL_CLASS,
  type SectionDialogChildProps,
} from "./section-dialog";

function ColorField({
  label,
  value,
  invalid,
  onChange,
}: {
  label: string;
  value: string;
  invalid?: boolean;
  onChange: (hex: string) => void;
}) {
  return (
    <Field className="flex flex-col gap-1.5" data-invalid={invalid}>
      <Label className={LABEL_CLASS}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-10 shrink-0 cursor-pointer rounded border border-input bg-transparent p-1"
        />
        <Input
          value={value}
          placeholder="#000000"
          maxLength={7}
          aria-invalid={invalid}
          onChange={(e) => {
            let v = e.target.value.toUpperCase();
            if (v && !v.startsWith("#")) v = `#${v}`;
            onChange(v.replace(/[^#0-9A-F]/g, ""));
          }}
        />
      </div>
    </Field>
  );
}

function ColorSwatch({ label, value }: { label: string; value?: string }) {
  return (
    <DataField label={label} empty="Not Set">
      {value ? (
        <span className="flex flex-col gap-3 text-sm mt-2">
          <span
            className="size-52 rounded border border-border"
            style={{ backgroundColor: value }}
          />
          {value}
        </span>
      ) : null}
    </DataField>
  );
}

export function BrandColorsCard({
  org,
  onEdit,
}: {
  org: Organization;
  onEdit: () => void;
}) {
  const b = org.branding;
  return (
    <Card variant="panel" className="lg:col-span-1">
      <EditableCardHeader title="Brand Colors" onEdit={onEdit} />
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ColorSwatch label="Primary Brand Color" value={b?.primaryColor} />
        <ColorSwatch label="Accent Color" value={b?.accentColor} />
        <ColorSwatch label="Tertiary Color" value={b?.tertiaryColor} />
      </CardContent>
    </Card>
  );
}

export function BrandColorsFields({ control }: SectionDialogChildProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Controller
        control={control}
        name="primaryColor"
        render={({ field, fieldState }) => (
          <ColorField
            label="Primary Brand Color"
            value={field.value}
            invalid={fieldState.invalid}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="accentColor"
        render={({ field, fieldState }) => (
          <ColorField
            label="Accent Color"
            value={field.value}
            invalid={fieldState.invalid}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="tertiaryColor"
        render={({ field, fieldState }) => (
          <ColorField
            label="Tertiary Color"
            value={field.value}
            invalid={fieldState.invalid}
            onChange={field.onChange}
          />
        )}
      />
    </div>
  );
}
