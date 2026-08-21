import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/analytics-actions", () => ({
  fetchRealtimeData: vi.fn(),
}));
vi.mock("./realtime-chart", () => ({
  RealtimeChart: () => <div data-testid="realtime-chart" />,
}));

import { fetchRealtimeData } from "@/server/analytics-actions";

import { RealtimeCard } from "./realtime-card";

const initialData = { total: 3, perMinute: [], countries: [] };
const refreshedData = { total: 7, perMinute: [], countries: [] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetchRealtimeData).mockReset();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RealtimeCard polling", () => {
  it("moves from Live to Stale after failure and back to Live after recovery", async () => {
    vi.mocked(fetchRealtimeData)
      .mockResolvedValueOnce({ success: false, error: "quota" })
      .mockResolvedValueOnce({ success: true, data: refreshedData });
    render(<RealtimeCard initialData={initialData} />);

    expect(screen.getByText("Live")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("does not start another poll while one is still in flight", async () => {
    let resolvePoll: ((value: { success: boolean }) => void) | undefined;
    vi.mocked(fetchRealtimeData).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePoll = resolve;
        }),
    );
    render(<RealtimeCard initialData={initialData} />);

    await act(() => vi.advanceTimersByTimeAsync(90_000));
    expect(fetchRealtimeData).toHaveBeenCalledTimes(1);

    await act(async () => resolvePoll?.({ success: false }));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchRealtimeData).toHaveBeenCalledTimes(2);
  });
});
