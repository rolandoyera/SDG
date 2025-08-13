import { createClient } from "next-sanity";
import { apiVersion, dataset, projectId, readToken } from "../env";

/** Client for previewing drafts (no CDN, includes drafts) */
export const previewClient = createClient({
  projectId,
  dataset,
  apiVersion,
  token: readToken, // set SANITY_API_READ_TOKEN in .env.local
  useCdn: false,
  perspective: "previewDrafts",
  stega: { enabled: true }, // helpful overlays in preview
});
