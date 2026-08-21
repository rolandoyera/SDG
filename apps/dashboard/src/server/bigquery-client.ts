// Minimal BigQuery reader: one synchronous jobs.query call, rows mapped onto
// their schema field names. No @google-cloud/bigquery dependency — the REST
// endpoint plus the service account we already have is the whole requirement.

import { getGoogleAuth } from "./google-credentials";

const BIGQUERY_SCOPE = "https://www.googleapis.com/auth/bigquery";

interface QueryResponse {
  schema?: { fields?: { name: string }[] };
  rows?: { f: { v: string | null }[] }[];
}

/** Runs `sql` and returns rows keyed by column name; values stay strings. */
export async function queryRows(
  sql: string,
): Promise<Record<string, string | null>[]> {
  const { auth, projectId } = getGoogleAuth(BIGQUERY_SCOPE);
  const client = await auth.getClient();
  const response = await client.request<QueryResponse>({
    url: `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    method: "POST",
    data: { query: sql, useLegacySql: false, timeoutMs: 30_000 },
  });

  const fields = response.data.schema?.fields ?? [];
  return (response.data.rows ?? []).map((row) =>
    Object.fromEntries(
      fields.map((field, i) => [field.name, row.f[i]?.v ?? null]),
    ),
  );
}
