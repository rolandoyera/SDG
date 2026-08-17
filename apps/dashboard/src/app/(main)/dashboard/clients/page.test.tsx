import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Effect-churn guardrail: the page's data effect must key on stable primitives
// from useAuth (organizationId, authLoading), NOT the profile object — profile
// identity changes on every onSnapshot heartbeat, and an effect keyed on it
// refetches the whole list each time. Biome's useExhaustiveDependencies can't
// catch that class of bug (such deps are "correct", just unstable), so we
// assert the behavior: a new-but-equal profile object must NOT refetch, while
// a genuine organizationId change must.

vi.mock("@/lib/db", () => ({ getClients: vi.fn(async () => []) }));
// Server actions import firebase-admin; never load them in jsdom.
vi.mock("@/server/client-actions", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/clients",
  // QuickCreateTrigger reads ?add= via useSearchParams; no params in tests.
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/auth-context", () => ({
  useAuth: () => authState,
}));

import { getClients } from "@/lib/db";
import type { UserProfile } from "@/lib/types";
import { PageTitleProvider } from "@/components/page-title-updater";

import ClientsPage from "./page";

function makeProfile(): UserProfile {
  return {
    uid: "user-1",
    fullName: "Test User",
    email: "test@example.com",
    role: "Contributor",
    organizationId: "org1",
    status: "Active",
    joinedDate: "2026-01-01",
    lastActive: Date.now(),
  } as UserProfile;
}

let authState: {
  user: unknown;
  profile: UserProfile | null;
  organizationId: string | null;
  uid: string | null;
  role: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

function renderPage() {
  return render(
    <PageTitleProvider baseTitle="Test">
      <ClientsPage />
    </PageTitleProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState = {
    user: {},
    profile: makeProfile(),
    organizationId: "org1",
    uid: "user-1",
    role: "Contributor",
    loading: false,
    signOut: () => Promise.resolve(),
  };
});

afterEach(cleanup);

describe("clients page data effect", () => {
  it("fetches once, keyed on organizationId — a profile heartbeat must not refetch", async () => {
    const { rerender } = renderPage();
    await screen.findByText("No clients");
    expect(getClients).toHaveBeenCalledTimes(1);
    expect(getClients).toHaveBeenCalledWith("org1");

    // Simulate the auth onSnapshot heartbeat: same values, new object identity.
    authState = { ...authState, profile: makeProfile() };
    rerender(
      <PageTitleProvider baseTitle="Test">
        <ClientsPage />
      </PageTitleProvider>,
    );

    expect(getClients).toHaveBeenCalledTimes(1);
  });

  it("refetches when the organization actually changes", async () => {
    const { rerender } = renderPage();
    await screen.findByText("No clients");

    authState = { ...authState, organizationId: "org2" };
    rerender(
      <PageTitleProvider baseTitle="Test">
        <ClientsPage />
      </PageTitleProvider>,
    );

    await screen.findByText("No clients");
    expect(getClients).toHaveBeenCalledTimes(2);
    expect(getClients).toHaveBeenLastCalledWith("org2");
  });

  it("does not fetch while auth is still loading", async () => {
    authState = { ...authState, loading: true, organizationId: null };
    renderPage();

    expect(getClients).not.toHaveBeenCalled();
  });
});
