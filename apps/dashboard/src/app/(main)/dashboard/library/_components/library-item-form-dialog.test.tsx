import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Regression guard for the Radix Select "bubble input" echo: Radix's hidden
// native <select> re-emits programmatic value changes through onValueChange.
// When AI autofill sets category + subcategory in one commit, that echo (a) hit
// the category handler, which clears subcategory on any change, and (b) arrived
// as "" for subcategory because its items weren't mounted yet in that commit —
// either way the AI-picked subcategory was silently wiped. The dialog's
// onValueChange handlers now ignore no-op/empty echoes; these tests pin that.

vi.mock("@/lib/db", () => ({
  getOrganization: vi.fn(async () => null),
  uploadLibraryImage: vi.fn(),
}));
// Server actions import firebase-admin; never load them in jsdom.
vi.mock("@/server/ai-actions", () => ({
  autofillProductFromUrl: vi.fn(),
  fetchImageBytes: vi.fn(),
}));
vi.mock("@/components/auth-context", () => ({
  useAuth: () => ({ organizationId: "org1", authLoading: false }),
}));

import { LibraryItemFormDialog } from "./library-item-form-dialog";
import { useLibraryItemForm } from "./use-library-item-form";

const noop = () => undefined;

function Host() {
  const form = useLibraryItemForm();
  return (
    <>
      {/* Same write path autofillWithAi uses: both fields in one setFormData. */}
      <button
        type="button"
        onClick={() =>
          form.setFormData((prev) => ({
            ...prev,
            category: "Bath",
            subcategory: "Vanities",
          }))
        }
      >
        simulate-autofill
      </button>
      <span data-testid="raw-sub">[{form.formData.subcategory}]</span>
      <LibraryItemFormDialog
        open
        onOpenChange={noop}
        title="Add Item"
        submitLabel="Save"
        submitting={false}
        onSubmit={noop}
        form={form}
        vendors={[]}
        onQuickAddVendor={noop}
      />
    </>
  );
}

afterEach(cleanup);

describe("AI autofill category/subcategory population", () => {
  it("keeps the subcategory value and displays both selects", async () => {
    render(<Host />);

    fireEvent.click(screen.getByText("simulate-autofill"));

    // The form value must survive the Radix native-select echo…
    await vi.waitFor(() => {
      expect(screen.getByTestId("raw-sub").textContent).toBe("[Vanities]");
    });

    // …and both select triggers must actually display the picked values.
    const triggerTexts = () =>
      Array.from(document.querySelectorAll("[data-slot='select-value']")).map(
        (el) => el.textContent,
      );
    await vi.waitFor(() => {
      expect(triggerTexts()).toContain("Bath");
      expect(triggerTexts()).toContain("Vanities");
    });
  });
});
