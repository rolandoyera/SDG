import { describe, expect, it } from "vitest";

import type { ItemColumnLayout } from "@/lib/types";

import {
  DEFAULT_ITEM_COLUMN_VISIBILITY,
  itemColumnLayoutKey,
  normalizeItemColumnLayout,
} from "./items-fields";

/**
 * Firestore stores map fields sorted by key, so a layout always comes back with
 * its keys in a different order than it was written in. This mimics that
 * round-trip (the emulator does NOT, which is why the loop only showed up in
 * production).
 */
function throughFirestore<T extends object>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [
        key,
        typeof (value as Record<string, unknown>)[key] === "object"
          ? throughFirestore((value as Record<string, object>)[key])
          : (value as Record<string, unknown>)[key],
      ]),
  ) as T;
}

describe("itemColumnLayoutKey", () => {
  it("survives a Firestore round-trip (the write→snapshot→write loop guard)", () => {
    const saved = normalizeItemColumnLayout({
      visibility: { sku: true },
      sizing: { item: 240 },
    });

    // What the snapshot listener sees after the write commits.
    const readBack = throughFirestore(saved) as ItemColumnLayout;

    expect(Object.keys(readBack.visibility)).not.toEqual(
      Object.keys(saved.visibility),
    );
    expect(itemColumnLayoutKey(readBack)).toBe(itemColumnLayoutKey(saved));
  });

  it("treats a stored layout and its defaults-merged form as the same layout", () => {
    // A doc written before a column was added to ITEM_FIELDS.
    const partial = { visibility: { item: true }, sizing: {} };
    expect(itemColumnLayoutKey(partial)).toBe(
      itemColumnLayoutKey(normalizeItemColumnLayout(partial)),
    );
  });

  it("still distinguishes a real change", () => {
    const base = normalizeItemColumnLayout(null);
    const toggled = normalizeItemColumnLayout({ visibility: { sku: true } });
    expect(itemColumnLayoutKey(toggled)).not.toBe(itemColumnLayoutKey(base));

    const resized = normalizeItemColumnLayout({ sizing: { item: 240 } });
    expect(itemColumnLayoutKey(resized)).not.toBe(itemColumnLayoutKey(base));
  });
});

describe("normalizeItemColumnLayout", () => {
  it("fills every field id from the defaults and keeps stored overrides", () => {
    const layout = normalizeItemColumnLayout({ visibility: { sku: true } });
    expect(Object.keys(layout.visibility).sort()).toEqual(
      Object.keys(DEFAULT_ITEM_COLUMN_VISIBILITY).sort(),
    );
    expect(layout.visibility.sku).toBe(true);
    expect(layout.sizing).toEqual({});
  });
});
