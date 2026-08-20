import { uploadLibraryDoc, uploadLibraryImageBlob } from "@/lib/db";
import { isFirebaseHosted, mirrorExternalImageUrl } from "@/lib/image-mirror";
import { fetchPdfBytes } from "@/server/ai-actions";

export interface MirrorResult {
  imageUrls: string[];
  coverImageUrl: string;
  coverImagePath?: string;
  images: Array<{ url: string; path: string }>;
  /** Mirrored (or passed-through) spec sheet; undefined when the item has none. */
  specSheet?: { url: string; path: string };
  /** How many external images were successfully copied into Firebase Storage. */
  mirroredCount: number;
  /** How many external images could not be fetched and kept their original URL. */
  failedCount: number;
}

/**
 * Mirrors an external spec sheet PDF into Firebase Storage (server-side fetch to
 * bypass CORS, client-side upload — same split as images). A sheet that's already
 * Firebase-hosted passes through; one that fails to fetch keeps its vendor URL.
 */
async function mirrorSpecSheet(
  organizationId: string,
  specSheet: { url: string; path: string } | undefined,
  itemId: string,
): Promise<{ url: string; path: string } | undefined> {
  const url = specSheet?.url?.trim();
  if (!url) return undefined;
  if (isFirebaseHosted(url)) return { url, path: specSheet?.path ?? "" };

  try {
    const res = await fetchPdfBytes(url);
    if (res.success && res.base64) {
      const binary = atob(res.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return await uploadLibraryDoc(
        organizationId,
        new Blob([bytes], { type: "application/pdf" }),
        itemId,
      );
    }
    console.warn(`[Spec Sheet Mirror] Fetch failed for ${url}: ${res.error}`);
  } catch (error) {
    console.error(`[Spec Sheet Mirror] Failed to mirror ${url}:`, error);
  }
  return { url, path: "" };
}

/**
 * Mirrors any external (non-Firebase) image URLs on a library item into Firebase
 * Storage so saved items never hotlink to vendor CDNs (which can rot, 403, or change).
 * Each external URL is fetched server-side (to bypass CORS) and re-uploaded via the
 * client SDK. Images that fail to fetch keep their original URL — we never drop one.
 * Firebase-hosted URLs (e.g. manual uploads) are passed through unchanged.
 */
export async function mirrorExternalImagesToFirebase(
  organizationId: string,
  input: {
    imageUrls?: string[];
    coverImageUrl?: string;
    images?: Array<{ url: string; path: string }>;
    coverImagePath?: string;
    specSheet?: { url: string; path: string };
  },
  itemId: string,
): Promise<MirrorResult> {
  const specSheetPromise = mirrorSpecSheet(
    organizationId,
    input.specSheet,
    itemId,
  );
  const originalImages = (input.imageUrls ?? []).filter(Boolean);
  const cover = input.coverImageUrl?.trim() || "";
  const existingImages = input.images ?? [];

  // Create a mapping from url to path for existing Firebase-hosted images
  const urlToPathMap = new Map<string, string>();
  for (const img of existingImages) {
    if (img.url && img.path) {
      urlToPathMap.set(img.url, img.path);
    }
  }
  if (input.coverImageUrl && input.coverImagePath) {
    urlToPathMap.set(input.coverImageUrl, input.coverImagePath);
  }

  // Unique set of external URLs that actually need mirroring (images + cover).
  const candidates = new Set<string>(originalImages);
  if (cover) candidates.add(cover);
  const externals = [...candidates].filter((url) => !isFirebaseHosted(url));

  // external URL -> resolved { url, path }
  const mapping = new Map<string, { url: string; path: string }>();
  let mirroredCount = 0;
  let failedCount = 0;

  await Promise.all(
    externals.map(async (url) => {
      const result = await mirrorExternalImageUrl({
        url,
        upload: (blob, extension) =>
          uploadLibraryImageBlob(
            organizationId,
            blob,
            itemId,
            undefined,
            extension,
          ),
        logPrefix: "Image Mirror",
      });

      mapping.set(url, result.image);
      if (result.mirrored) {
        mirroredCount++;
        return;
      }
      failedCount++;
    }),
  );

  const resolve = (urlStr: string): { url: string; path: string } => {
    const mirrored = mapping.get(urlStr);
    if (mirrored) {
      return mirrored;
    }
    const path = urlToPathMap.get(urlStr) || "";
    return { url: urlStr, path };
  };

  const resolvedImages = originalImages.map(resolve);
  const imageUrls = resolvedImages.map((ri) => ri.url);
  const images = resolvedImages.filter((ri) => ri.path);

  const resolvedCover = cover
    ? resolve(cover)
    : (resolvedImages[0] ?? { url: "", path: "" });
  const coverImageUrl = resolvedCover.url;
  const coverImagePath = resolvedCover.path;

  return {
    imageUrls,
    coverImageUrl,
    coverImagePath,
    images,
    specSheet: await specSheetPromise,
    mirroredCount,
    failedCount,
  };
}
