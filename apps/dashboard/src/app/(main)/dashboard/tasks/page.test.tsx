import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Effect-churn guardrail: the page's data effect must key on stable primitives
// from useAuth (organizationId, authLoading), NOT the profile object — profile
// identity changes on every onSnapshot heartbeat, and an effect keyed on it
// refetches the reference lists each time. Biome's useExhaustiveDependencies
// can't catch that class of bug (such deps are "correct", just unstable), so we
// assert the behavior. The tasks page also subscribes with onSnapshot, so the
// same churn would tear down and rebuild the listener on every heartbeat.

vi.mock("@/lib/db", () => ({
  getOrganizationUsers: vi.fn(async () => []),
  getProjects: vi.fn(async () => []),
  getClients: vi.fn(async () => []),
  setTaskCompleted: vi.fn(),
  setTaskSubtasks: vi.fn(),
  deleteTask: vi.fn(),
  sortTasksByDue: (tasks: unknown[]) => tasks,
}));
// Server actions import firebase-admin; never load them in jsdom.
vi.mock("@/server/task-actions", () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ db: {}, storage: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn((_query: unknown, next: (snap: unknown) => void) => {
    next({ docs: [] });
    return unsubscribe;
  }),
}));
vi.mock("@/components/auth-context", () => ({
  useAuth: () => authState,
}));

import { onSnapshot } from "firebase/firestore";

import { PageTitleProvider } from "@/components/page-title-updater";
import { getOrganizationUsers } from "@/lib/db";
import type { UserProfile } from "@/lib/types";

import TasksPage from "./page";

const unsubscribe = vi.fn();

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
      <TasksPage />
    </PageTitleProvider>,
  );
}

function rerenderPage(rerender: (ui: React.ReactElement) => void) {
  rerender(
    <PageTitleProvider baseTitle="Test">
      <TasksPage />
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

describe("tasks page data effects", () => {
  it("fetches and subscribes once — a profile heartbeat must not refetch", async () => {
    const { rerender } = renderPage();
    await screen.findByText(/Nothing here/);
    expect(getOrganizationUsers).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledTimes(1);

    // Simulate the auth onSnapshot heartbeat: same values, new object identity.
    authState = { ...authState, profile: makeProfile() };
    rerenderPage(rerender);

    expect(getOrganizationUsers).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("refetches and resubscribes when the organization actually changes", async () => {
    const { rerender } = renderPage();
    await screen.findByText(/Nothing here/);

    authState = { ...authState, organizationId: "org2" };
    rerenderPage(rerender);

    await screen.findByText(/Nothing here/);
    expect(getOrganizationUsers).toHaveBeenCalledTimes(2);
    expect(getOrganizationUsers).toHaveBeenLastCalledWith("org2");
    expect(onSnapshot).toHaveBeenCalledTimes(2);
  });

  it("does not fetch or subscribe while auth is still loading", () => {
    authState = { ...authState, loading: true, organizationId: null };
    renderPage();

    expect(getOrganizationUsers).not.toHaveBeenCalled();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("hides All Tasks from members and shows it to admins", async () => {
    renderPage();
    await screen.findByText(/Nothing here/);
    expect(screen.queryByText("All Tasks")).toBeNull();
    cleanup();

    authState = {
      ...authState,
      profile: { ...makeProfile(), role: "Admin" },
      role: "Admin",
    };
    renderPage();
    await screen.findByText(/Nothing here/);
    expect(screen.getByText("All Tasks")).toBeTruthy();
  });
});
