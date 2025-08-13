// sanity/lib/client.ts
import { createClient } from "next-sanity";
import { apiVersion, dataset, projectId } from "../env";

if (!projectId || !dataset || !apiVersion) {
  throw new Error("Missing SANITY env vars (projectId/dataset/apiVersion).");
}

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true, // fast, cached public reads
});
