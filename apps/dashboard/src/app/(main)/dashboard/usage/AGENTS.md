# Usage Dashboard

SuperAdmin-only. Two tabs: **AI** (Gemini) and **Data** (Firestore). Everything here is
**platform-wide across all tenants** — say so in copy rather than implying per-tenant numbers.

## Three data sources, three different lags

Do not mix them in one card or imply they agree.

| Source                             | Feeds                                               | Freshness         |
| ---------------------------------- | --------------------------------------------------- | ----------------- |
| `aiUsage/{YYYY-MM-DD}` (Firestore) | per-model token + request charts, AI metrics footer | realtime          |
| Cloud Monitoring                   | API errors card                                     | ~minutes          |
| BigQuery billing export            | Gemini spend card                                   | **~1 day behind** |

The spend lag is inherent, not a bug: AI Studio's own cost page carries the same warning. Read
`billedThrough` from the action and show it — never imply the current day is complete.

## Days are ET everywhere

`aiUsage` docs are keyed by America/New_York days, so every other source is converted to match:

- **Monitoring** is fetched as HOURLY points and bucketed into ET days in `getGeminiErrors`. Do not
  ask Monitoring for daily buckets — its alignment periods anchor to the request window, not to a
  calendar, so the boundaries drift off the charts beside them. Aligned points are stamped with the
  bucket END; step back one alignment period before deriving the day.
- **BigQuery** groups on `DATE(usage_start_time, 'America/New_York')`. The raw column is UTC.

## Dotted keys break things twice

Model ids contain dots (`gemini-3.1-flash-lite`), and dots are a path separator in two places:

- **Firestore** — write `byModel` as a NESTED MAP with `set({ merge: true })`, never a dotted field
  path, or the id splits into `byModel.gemini-3.1-flash-lite`.
- **Recharts** — `dataKey="gemini-3.1-flash-lite"` resolves as `row["gemini-3"]["1-flash-lite"]`,
  AND `ChartContainer` emits `--color-<key>`, which is not a valid CSS custom property with dots in
  it. So the line loses its data and its stroke. `modelSeriesKey()` in `page.tsx` slugs the id for
  chart use and keeps the real id as the label.

This failure is SILENT: `tsc`, Biome and the legend totals all stay correct (`totalOf` uses plain
property access) while the plot area renders empty. If a chart is blank but its total is right,
check the series key first.

## The errors card filters by API key on purpose

Scoped to `resource.labels.credential_id` for the server-side Gemini key. The project's PUBLIC
Firebase browser key gets probed against `generativelanguage` by outsiders — 91 attempts in six
weeks, all 403, all blocked by that key's API restrictions. Unfiltered, that noise outnumbers real
failures. Re-read the id from `gcloud services api-keys list` if the key is rotated.

## Conventions

- Series (models, response codes) are DISCOVERED from the data, not declared, so a model that stops
  being called still charts its history and a new one needs no code change.
- `UsageChartCard` already provides per-series toggles that double as the total readout. The
  section-level model menu is the filter across all charts; it deliberately does NOT touch the
  errors card, which is keyed by response code.
- No cost ESTIMATE lives here. Flat per-token rates ignore cached-input and fallback SKUs; billed
  truth comes from the BigQuery card instead.
- The spend query needs `roles/bigquery.jobUser` + data read on the `billing_export` dataset for the
  admin SA. Monitoring needs no extra grant — the Firebase SDK service agent already covers it.
