// Cloud Monitoring transport, shared by every metrics reader on the server.
// Lives outside the "use server" action files because those may export only
// async functions — a sync helper there is a build error.

import { getGoogleAuth } from "./google-credentials";

const MONITORING_BASE = "https://monitoring.googleapis.com/v3";

export interface TimeSeries {
  metric: { type: string; labels?: Record<string, string> };
  points?: {
    interval: { endTime: string };
    value: { int64Value?: string; doubleValue?: number };
  }[];
}

export async function listTimeSeries(params: {
  filter: string;
  startMs: number;
  endMs: number;
  alignmentSeconds: number;
  perSeriesAligner: "ALIGN_SUM" | "ALIGN_MAX";
  crossSeriesReducer: "REDUCE_SUM" | "REDUCE_MAX";
  groupByFields: string[];
}): Promise<TimeSeries[]> {
  const { auth, projectId } = getGoogleAuth(
    "https://www.googleapis.com/auth/monitoring.read",
  );

  const search = new URLSearchParams({
    filter: params.filter,
    "interval.startTime": new Date(params.startMs).toISOString(),
    "interval.endTime": new Date(params.endMs).toISOString(),
    "aggregation.alignmentPeriod": `${params.alignmentSeconds}s`,
    "aggregation.perSeriesAligner": params.perSeriesAligner,
    "aggregation.crossSeriesReducer": params.crossSeriesReducer,
  });
  for (const field of params.groupByFields) {
    search.append("aggregation.groupByFields", field);
  }

  const client = await auth.getClient();
  const response = await client.request<{ timeSeries?: TimeSeries[] }>({
    url: `${MONITORING_BASE}/projects/${projectId}/timeSeries?${search}`,
  });
  return response.data.timeSeries ?? [];
}
