// Daily form-error alert: emails when a site's GA4 property recorded
// contact_form_error / turnstile_error events yesterday.
//
// This lives here (not in GA4) because GA4 custom insights can't target a
// specific event name — the insight segment builder has no Event name
// dimension and its metrics are property-wide aggregates. Runs daily rather
// than hourly because GA4 standard reporting data lags up to a day. No email
// means no errors.

import { sendContractEmail } from "./brevo";
import { getAdminDb } from "./firebase-admin";
import { getGA4Client, hasGA4Credentials } from "./ga4";

const ALERT_EVENTS = ["contact_form_error", "turnstile_error"] as const;

// Brevo only delivers from verified senders (see the account's sender list).
const ALERT_SENDER = { email: "hello@lenisvisuals.com", name: "Lenis Studio" };
const ALERT_RECIPIENT = "rolysemail@gmail.com";

type ErrorCounts = Record<(typeof ALERT_EVENTS)[number], number>;

async function fetchYesterdayErrorCounts(
  propertyId: string,
): Promise<ErrorCounts> {
  const client = getGA4Client();
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: [...ALERT_EVENTS] },
      },
    },
  });

  const counts: ErrorCounts = { contact_form_error: 0, turnstile_error: 0 };
  for (const row of response.rows || []) {
    const name = row.dimensionValues?.[0]?.value as
      | keyof ErrorCounts
      | undefined;
    if (name && name in counts) {
      counts[name] = parseInt(row.metricValues?.[0]?.value || "0", 10);
    }
  }
  return counts;
}

function buildAlertHtml(orgName: string, counts: ErrorCounts): string {
  return `
    <p>GA4 recorded form errors on <strong>${orgName}</strong> yesterday:</p>
    <ul>
      <li>Failed form submissions (<code>contact_form_error</code>): <strong>${counts.contact_form_error}</strong></li>
      <li>Turnstile widget failures (<code>turnstile_error</code>): <strong>${counts.turnstile_error}</strong></li>
    </ul>
    <p>Open the GA4 Events report and add <code>reason</code> / <code>status</code>
    as dimensions to see why (turnstile_pending / server / network), or check the
    Failed bars on the dashboard's Analytics &rarr; Conversions tab.</p>
  `;
}

/**
 * Check yesterday's error events for every org with a configured GA4
 * property and email an alert for each org with a nonzero count.
 */
export async function runFormErrorAlertsForAllOrgs(): Promise<{
  orgs: number;
  alerts: number;
}> {
  if (!hasGA4Credentials()) return { orgs: 0, alerts: 0 };

  const orgs = await getAdminDb().collection("organizations").get();
  let checked = 0;
  let alerts = 0;

  for (const doc of orgs.docs) {
    const data = doc.data();
    const propertyId = (
      data.config as { gaPropertyId?: string } | undefined
    )?.gaPropertyId?.trim();
    if (!propertyId) continue;
    checked += 1;

    try {
      const counts = await fetchYesterdayErrorCounts(propertyId);
      const total = counts.contact_form_error + counts.turnstile_error;
      if (total === 0) continue;

      const orgName = (data.name as string | undefined) || doc.id;
      const result = await sendContractEmail({
        to: { email: ALERT_RECIPIENT },
        sender: ALERT_SENDER,
        subject: `Form errors on ${orgName}: ${total} yesterday`,
        htmlContent: buildAlertHtml(orgName, counts),
      });
      if (result.ok) alerts += 1;
      else console.error(`Form-error alert email failed for ${orgName}.`);
    } catch (error) {
      console.error(`Form-error alert failed for org ${doc.id}:`, error);
    }
  }

  return { orgs: checked, alerts };
}
