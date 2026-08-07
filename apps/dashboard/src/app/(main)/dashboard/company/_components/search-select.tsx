"use client";

import { ChevronDownIcon } from "lucide-react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

export interface ComboItem {
  code: string;
  name: string;
}

const COMBO_TRIGGER_CLASS = cn(
  "flex h-10 w-full items-center justify-between whitespace-nowrap rounded border border-input bg-transparent px-2.5 text-sm outline-none transition-colors",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
  "dark:bg-input/30",
);

/** Combobox styled to match the form selects, used for Country and Timezone pickers. */
export function SearchSelect({
  items,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  container,
}: {
  items: ComboItem[];
  value: string;
  onChange: (code: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  container: HTMLElement | null;
}) {
  const selected = items.find((i) => i.code === value) ?? null;
  return (
    <Combobox
      value={selected}
      onValueChange={(item: ComboItem | null) => onChange(item?.code ?? "")}
      items={items}
      filter={(item: ComboItem, inputValue: string) =>
        item.name.toLowerCase().includes(inputValue.toLowerCase())
      }
    >
      <ComboboxTrigger
        render={
          <button
            type="button"
            className={cn(
              COMBO_TRIGGER_CLASS,
              !selected && "text-muted-foreground",
            )}
          >
            <span className="truncate">
              {selected ? selected.name : placeholder}
            </span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <ComboboxContent container={container}>
        <ComboboxInput showTrigger={false} placeholder={searchPlaceholder} />
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(item: ComboItem) => (
            <ComboboxItem key={item.code} value={item}>
              {item.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
