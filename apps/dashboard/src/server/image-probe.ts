// Image measurement helpers for the AI scrape flows.
//
// No "use server" directive: these are plain server-side functions imported by
// the actions in ai-actions.ts, not Server Actions themselves.
//
/**
 * Measures scraped image candidates instead of guessing at them.
 *
 * Two problems this solves, both of which used to surface only after the user
 * had already picked a hero and seen it render blurry:
 *
 *  1. **Thumbnails masquerading as heroes.** Every CDN hides the rendition size
 *     somewhere different — Shopify in a filename suffix (`_180x.jpg`), Magento
 *     in a *hash directory* (`/image_resizer/cache/<hash>/…`) that no filename
 *     regex can see. We rewrite each candidate to its likely original, then read
 *     the real pixel dimensions off the wire and keep whichever variant actually
 *     won. Measuring is what makes the rewriting safe: a guess that 404s or
 *     turns out smaller is discarded rather than becoming a broken hero.
 *  2. **Duplicates.** The same photo served under several rendition paths is one
 *     image, and identical (bytes, width, height) is a far more reliable signal
 *     of that than comparing filenames.
 *
 * Cost is one ranged GET per variant, in parallel — the header is all we read,
 * so it's ~64KB and ~300ms regardless of how large the file actually is.
 */

export interface ImageCandidate {
  url: string;
  width: number;
  height: number;
  bytes?: number;
  /** True when the caller's `demote` predicate matched — see `measureImageCandidates`. */
  demoted?: boolean;
}

/** Enough to clear a JPEG's EXIF block and reach the SOF marker. */
const HEADER_BYTES = 65536;
const PROBE_TIMEOUT_MS = 8000;

/** A Cloudinary transform segment is comma-separated `key_value` tokens. */
const CLOUDINARY_TRANSFORM_TOKEN = /(?:^|,)[a-z]{1,3}_[^,/]+/;
/** Asked for with `c_limit`, so this is a ceiling, never an upscale target. */
const CLOUDINARY_PROBE_WIDTH = 3000;

/** Query params that request a rendition rather than identify the asset. */
const SIZE_PARAMS = ["width", "height", "w", "h"];

/**
 * Rewrites a rendition URL to the original asset it was derived from, best guess
 * first. Always includes the input as the final fallback. Each returned URL is
 * probed, so a wrong guess costs one request and is then dropped.
 */
export function originalVariants(url: string): string[] {
  const variants: string[] = [];
  const add = (candidate: string) => {
    if (candidate !== url && !variants.includes(candidate))
      variants.push(candidate);
  };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [url];
  }
  const path = parsed.pathname;

  // Magento: the resize preset lives in a hash directory, not the filename.
  //   /media/image_resizer/cache/<hash>/<tail>      → /media/<tail>
  //   /media/catalog/product/cache/<hash>/<tail>    → /media/catalog/product/<tail>
  const magento = path.replace(
    /\/(?:image_resizer\/)?cache\/[0-9a-f]{16,}\//i,
    "/",
  );
  if (magento !== path) {
    const rewritten = new URL(parsed.href);
    rewritten.pathname = magento;
    add(rewritten.href);
  }

  // Shopify / WordPress: the size is a filename suffix (`_1920x`, `_180x180`,
  // `-1024x768`). Dropping it reaches the master upload.
  const suffixed = path.replace(
    /[_-](?:\d+x\d*|x\d+|large|medium|small|grande|master)(?=\.[a-z]+$)/i,
    "",
  );
  if (suffixed !== path) {
    const rewritten = new URL(parsed.href);
    rewritten.pathname = suffixed;
    add(rewritten.href);
  }

  // Newer Shopify (and imgix/Cloudinary) size via QUERY PARAMS instead —
  // `?v=…&width=600`. Dropping the sizing params returns the original; the
  // version param has to stay or the CDN 404s. If the URL turns out to be signed,
  // stripping params just invalidates it and the probe discards the variant.
  if (SIZE_PARAMS.some((p) => parsed.searchParams.has(p))) {
    const rewritten = new URL(parsed.href);
    for (const param of SIZE_PARAMS) rewritten.searchParams.delete(param);
    add(rewritten.href);
  }

  // Cloudinary: the size lives in a comma-separated transform SEGMENT
  // (`/image/private/t_base,c_lpad,f_auto,dpr_auto,w_1200,h_630/product/…`), which
  // no filename or query rule can see. Two traps here, both measured on
  // fergusonhome.com's `s3.img-b.com` delivery:
  //   - Removing the segment 404s. `/image/private/` requires a transform.
  //   - Simply raising `w_` UPSCALES. `c_lpad,w_2000` returns a 2000x2000 canvas
  //     built from a 600x600 master — bigger bytes, no more detail, and we'd have
  //     badged a padded thumbnail as full resolution.
  // `c_limit` never enlarges, so whatever comes back is the genuine master.
  const cloudinary =
    /\/image\/(upload|private|authenticated|fetch)\/([^/]+)\//.exec(path);
  if (cloudinary && CLOUDINARY_TRANSFORM_TOKEN.test(cloudinary[2])) {
    // Keep named transforms (`t_base`) and format negotiation; drop the crop,
    // explicit height and DPR that force a fixed canvas.
    const preserved = cloudinary[2]
      .split(",")
      .filter((token) => token.startsWith("t_") || token === "f_auto");
    const rewritten = new URL(parsed.href);
    rewritten.pathname = path.replace(
      cloudinary[0],
      `/image/${cloudinary[1]}/${[...preserved, "c_limit", `w_${CLOUDINARY_PROBE_WIDTH}`].join(",")}/`,
    );
    add(rewritten.href);
  }

  variants.push(url);
  return variants;
}

/** Reads at most `limit` bytes, cancelling the stream so we never pull a whole file. */
async function readHeadBytes(
  url: string,
  limit: number,
): Promise<{ buf: Buffer; totalBytes?: number } | null> {
  const res = await fetch(url, {
    headers: {
      Range: `bytes=0-${limit - 1}`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) return null;

  // Content-Range gives the true file size when the server honored the Range;
  // otherwise fall back to Content-Length (which is then the whole file).
  const contentRange = res.headers.get("content-range");
  const total = contentRange
    ? Number(contentRange.split("/")[1])
    : Number(res.headers.get("content-length"));

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;
  try {
    while (read < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      read += value.length;
    }
  } finally {
    // A server that ignored Range would otherwise stream the entire file at us.
    await reader.cancel().catch(() => {
      /* already closed */
    });
  }

  return {
    buf: Buffer.concat(chunks),
    totalBytes: Number.isFinite(total) && total > 0 ? total : undefined,
  };
}

/** Reads intrinsic dimensions out of a JPEG/PNG/WebP/GIF header. */
export function parseDimensions(
  buf: Buffer,
): { width: number; height: number } | null {
  // PNG — IHDR is always at a fixed offset.
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // GIF
  if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // WebP — RIFF container, dimensions depend on the chunk variant.
  if (
    buf.length > 30 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      return {
        width: (buf.readUIntLE(24, 3) & 0xffffff) + 1,
        height: (buf.readUIntLE(27, 3) & 0xffffff) + 1,
      };
    }
    if (chunk === "VP8 ") {
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      };
    }
  }

  // JPEG — walk the segment chain to the start-of-frame marker. SOF4/8/12 are
  // table definitions, not frames, so they're skipped.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return {
          height: buf.readUInt16BE(i + 5),
          width: buf.readUInt16BE(i + 7),
        };
      }
      const segmentLength = buf.readUInt16BE(i + 2);
      if (segmentLength < 2) return null; // malformed — bail rather than loop
      i += 2 + segmentLength;
    }
  }

  return null;
}

async function probe(url: string): Promise<ImageCandidate | null> {
  try {
    const head = await readHeadBytes(url, HEADER_BYTES);
    if (!head) return null;
    const dimensions = parseDimensions(head.buf);
    if (!dimensions) return null;
    return { url, ...dimensions, bytes: head.totalBytes };
  } catch {
    return null; // unreachable host, timeout, non-image — candidate just drops out
  }
}

/**
 * Upgrades, measures, de-duplicates and ranks image candidates.
 *
 * Returns only candidates whose dimensions we could actually read — anything
 * unreachable or not an image is dropped, which conveniently also removes the
 * empty `<img src="https://site.com/">` placeholders that scraped pages are
 * full of (they resolve to an HTML page, not an image).
 *
 * `demote` optionally marks URLs that should rank below everything else
 * regardless of size — see the sort below.
 */
export async function measureImageCandidates(
  urls: string[],
  limit: number,
  demote?: (url: string) => boolean,
): Promise<ImageCandidate[]> {
  const measured = await Promise.all(
    urls.map(async (url) => {
      // Probe the rewritten originals alongside the original URL and keep the
      // biggest one that actually resolved.
      const results = (
        await Promise.all(originalVariants(url).map(probe))
      ).filter((r): r is ImageCandidate => r !== null);
      if (results.length === 0) return null;
      const best = results.reduce((a, b) =>
        b.width * b.height > a.width * a.height ? b : a,
      );
      // Evaluate `demote` against the URL the CALLER passed in — the winning
      // variant is usually a rewritten URL the caller has never seen, so testing
      // that one instead would silently never match.
      return { candidate: best, demoted: demote?.(url) ?? false };
    }),
  );

  // Size decides the order, except that `demote` forms a lower tier that always
  // sorts beneath everything else. Callers use it for images that are large but
  // categorically wrong for the job (site chrome), so they stay available as a
  // last resort rather than being dropped — a page whose only usable photography
  // lives in its nav should still produce candidates.
  const ranked = measured
    .filter(
      (m): m is { candidate: ImageCandidate; demoted: boolean } => m !== null,
    )
    .sort((a, b) => {
      const tier = Number(a.demoted) - Number(b.demoted);
      if (tier !== 0) return tier;
      return (
        b.candidate.width * b.candidate.height -
        a.candidate.width * a.candidate.height
      );
    });

  // Identical byte length at identical dimensions is the same file reached by a
  // different path — a far more reliable duplicate signal than filename shape.
  const seen = new Set<string>();
  const deduped: ImageCandidate[] = [];
  for (const { candidate, demoted } of ranked) {
    const key = `${candidate.width}x${candidate.height}:${candidate.bytes ?? candidate.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Surfaced so callers can drop demoted results entirely — the flag can't be
    // recomputed downstream, since the winning URL is usually a rewritten one.
    deduped.push(demoted ? { ...candidate, demoted } : candidate);
    if (deduped.length >= limit) break;
  }

  return deduped;
}
