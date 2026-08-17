"use server";

import { SCRAPER_CONFIG } from "@/config/scraper-config";
import { AI_ASSISTANT_NAME } from "@/lib/ai-assistant";

import {
  CATEGORIES,
  MAX_IMAGES,
  SUBCATEGORIES,
  withProtocol,
} from "../app/(main)/dashboard/library/_components/library-constants";
import { VENDOR_CATEGORIES } from "../app/(main)/dashboard/vendors/_components/vendor-constants";
import { recordAiUsage } from "./ai-usage";
import { saveDiagnosticRun } from "./diagnostics";

/**
 * Classifies a non-OK Gemini HTTP status. Transient overload (503/500) and rate-limit (429)
 * responses are marked retryable with a user-friendly message so the client can retry; all
 * other statuses return `message: null` so callers fall back to their own context-specific text.
 */
function classifyGeminiError(status: number): {
  retryable: boolean;
  message: string | null;
} {
  if (status === 503 || status === 500) {
    return {
      retryable: true,
      message: `${AI_ASSISTANT_NAME} is experiencing high demand right now. Please try again in a few minutes.`,
    };
  }
  if (status === 429) {
    return {
      retryable: true,
      message: `${AI_ASSISTANT_NAME} has hit a snag. Please wait a bit and try again.`,
    };
  }
  return { retryable: false, message: null };
}

interface GeminiFetchResult {
  response: Response;
  modelUsed: string;
}

/**
 * Executes a Gemini API request with an automatic transparent fallback if the primary model returns a rate limit (429), service unavailable (503),
 * or times out.
 */
async function fetchGeminiWithFallback(
  apiKey: string,
  body: string,
  signal: AbortSignal,
): Promise<GeminiFetchResult> {
  const primaryModel = SCRAPER_CONFIG.primaryModel;
  const fallbackModel = SCRAPER_CONFIG.fallbackModel;

  console.log(
    `[AI Fallback] Sending request to primary model: ${primaryModel}`,
  );
  const primaryUrl = `https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${apiKey}`;

  let res: Response | null = null;
  let primaryFailed = false;

  try {
    res = await fetch(primaryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    });
    if (res.status === 429 || res.status === 503) {
      primaryFailed = true;
      console.warn(
        `[AI Fallback] Primary model ${primaryModel} failed with status ${res.status}. Falling back to ${fallbackModel}...`,
      );
    }
  } catch (err) {
    primaryFailed = true;
    console.error(
      `[AI Fallback] Primary model ${primaryModel} fetch error or timeout:`,
      err,
    );
  }

  // Fall back if primary failed
  if (primaryFailed) {
    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${apiKey}`;
    try {
      const fallbackRes = await fetch(fallbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal,
      });
      console.log(
        `[AI Fallback] Fallback model ${fallbackModel} completed with status ${fallbackRes.status}`,
      );
      return { response: fallbackRes, modelUsed: fallbackModel };
    } catch (fallbackErr) {
      console.error(
        `[AI Fallback] Fallback model ${fallbackModel} fetch error:`,
        fallbackErr,
      );
      if (res) return { response: res, modelUsed: primaryModel };
      throw fallbackErr;
    }
  }

  if (!res) {
    throw new Error(`Primary model ${primaryModel} did not return a response.`);
  }
  return { response: res, modelUsed: primaryModel };
}

export interface AutofillResult {
  success: boolean;
  error?: string;
  /** True when the failure is transient (Gemini overload/rate-limit/timeout) and a retry may succeed. */
  retryable?: boolean;
  modelUsed?: string;
  data?: {
    name: string;
    sku?: string;
    category?: string;
    subcategory?: string;
    description?: string;
    finishColor?: string;
    manufacturer?: string;
    materials?: string;
    dimensions?: string;
    msrp?: number;
    imageUrls?: string[];
    confidence?: Record<string, number>;
    rawExtraction?: string;
  };
}

/**
 * Normalizes an image URL into a dedup key: drops the query string and common
 * size suffixes (e.g. `_300x300`, `-1200x1200`) so the same photo served at
 * different resolutions collapses to a single candidate.
 */
function cleanImageUrlSize(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    // Strip common Shopify and WordPress thumbnail suffixes (e.g., _170x, _170x170, _large, etc.)
    const cleanedPath = path.replace(
      /[_-](?:\d+x\d*|x\d+|large|medium|small|grande|master)(?=\.[a-z]+$)/i,
      "",
    );
    if (cleanedPath !== path) {
      parsed.pathname = cleanedPath;
      return parsed.toString();
    }
  } catch {
    return url.replace(
      /[_-](?:\d+x\d*|x\d+|large|medium|small|grande|master)(?=\.[a-z]+$)/i,
      "",
    );
  }
  return url;
}

function imageDedupKey(url: string): string {
  try {
    const cleanUrl = url.split("?")[0].split("#")[0];
    const parsed = new URL(cleanUrl);
    const filename = parsed.pathname.split("/").pop() || "";
    const cleaned = filename.replace(
      /[_-](?:\d+x\d*|x\d+|large|medium|small|grande|master)(?=\.[a-z]+$)/i,
      "",
    );
    return cleaned.toLowerCase();
  } catch {
    const cleanUrl = url.split("?")[0].split("#")[0];
    const filename = cleanUrl.split("/").pop() || "";
    const cleaned = filename.replace(
      /[_-](?:\d+x\d*|x\d+|large|medium|small|grande|master)(?=\.[a-z]+$)/i,
      "",
    );
    return cleaned.toLowerCase();
  }
}

/** Picks the URL with the largest width (`w`) or pixel-density (`x`) descriptor in a srcset value. */
function largestFromSrcset(srcset: string): string | undefined {
  let best: { url: string; score: number } | null = null;
  for (const part of srcset.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [url, descriptor] = trimmed.split(/\s+/, 2);
    if (!url) continue;
    let score = 1;
    if (descriptor) {
      const w = /^(\d+)w$/i.exec(descriptor);
      const x = /^([\d.]+)x$/i.exec(descriptor);
      if (w) score = Number(w[1]);
      else if (x) score = Number(x[1]) * 1000; // density descriptors rank above bare entries
    }
    if (!best || score > best.score) best = { url, score };
  }
  return best?.url;
}

/** Recursively pulls `image` values out of a parsed JSON-LD node (string | string[] | ImageObject | @graph). */
function collectJsonLdImages(node: unknown, out: string[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) collectJsonLdImages(n, out);
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const img = obj.image;
    if (typeof img === "string") {
      out.push(img);
    } else if (Array.isArray(img)) {
      for (const i of img) {
        if (typeof i === "string") out.push(i);
        else if (
          i &&
          typeof i === "object" &&
          typeof (i as Record<string, unknown>).url === "string"
        ) {
          out.push((i as Record<string, string>).url);
        }
      }
    } else if (
      img &&
      typeof img === "object" &&
      typeof (img as Record<string, unknown>).url === "string"
    ) {
      out.push((img as Record<string, string>).url);
    }
    if (Array.isArray(obj["@graph"])) collectJsonLdImages(obj["@graph"], out);
  }
}

/**
 * Extracts product image candidates from raw page HTML using web standards rather
 * than CDN-specific guesswork: Open Graph `og:image` (canonical hero), JSON-LD
 * `Product.image`, and the largest variant declared in each `srcset`. Returns
 * absolute URLs ordered best-first (hero → schema images → srcset gallery → plain <img>).
 */
function extractProductImagesFromHtml(html: string, base: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const add = (raw?: string) => {
    if (!raw) return;
    const abs = resolveAbsoluteUrl(raw.trim(), base);
    if (!abs.startsWith("http")) return; // skips data: URIs and unresolved relatives
    const key = imageDedupKey(abs);
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(abs);
  };

  // 1. og:image / twitter:image — canonical hero (highest priority)
  const ogImage =
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    )?.[1] ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(
      html,
    )?.[1] ??
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    )?.[1];
  add(ogImage);

  // 2. JSON-LD Product.image
  const ldRe =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ld = ldRe.exec(html);
  while (ld !== null) {
    try {
      const images: string[] = [];
      collectJsonLdImages(JSON.parse(ld[1].trim()), images);
      for (const img of images) add(img);
    } catch {
      /* skip malformed JSON-LD */
    }
    ld = ldRe.exec(html);
  }

  // 3. srcset / <picture><source> — largest declared variant per set
  const srcsetRe = /srcset=["']([^"']+)["']/gi;
  let ss = srcsetRe.exec(html);
  while (ss !== null) {
    add(largestFromSrcset(ss[1]));
    ss = srcsetRe.exec(html);
  }

  // 4. Plain <img src> as a final fallback
  const imgRe = /<img\s+[^>]*\bsrc=["'](https?:\/\/[^"']+)["']/gi;
  let im = imgRe.exec(html);
  while (im !== null) {
    add(im[1]);
    im = imgRe.exec(html);
  }

  return ordered;
}

/** Image URLs that are never product photos (nav chrome, payment badges, trackers, …). */
const JUNK_IMAGE_PATTERNS =
  /logo|icon|avatar|sprite|banner|pixel|social|facebook|instagram|pinterest|twitter|linkedin|tracker|nav|footer|header|loading|\.svg|\.gif|analytics|checkout|cart|adroll|doubleclick|yotpo|trust|badge|payment|paypal|visa|mastercard|amex|applepay|googlepay|shipping|delivery|guarante|refund|secur|padlock|warranty|search-menu|placeholder/i;

const JSON_OUTPUT_RULES = `CRITICAL: You MUST return 100% valid JSON. Do not include raw unescaped newlines or raw unescaped double quotes inside your string properties. All double quotes inside text properties must be escaped as \\" and all literal linebreaks must be escaped as \\n. Do not include any inner monologues, reasoning, debates, or explanations within the JSON property values. Every property value must contain ONLY the final extracted data value (or an empty string if not found).`;

/**
 * The per-field extraction instructions shared by the Jina-markdown prompt and the
 * url_context fallback prompt. Only the imageUrls guidance differs between the two
 * (the fallback has no pre-ranked candidate array).
 */
function productFieldInstructions(imageUrlsInstruction: string): string {
  return `- name: The clean, brief product name/title (e.g. "Carey Accent Table").
- category: Match the product to one of these exact categories: ${CATEGORIES.map((c) => `"${c}"`).join(", ")}. Choose the single closest match.
- subcategory: Match the product to one of the exact subcategories corresponding to the chosen category. The valid subcategories for each category are:
${Object.entries(SUBCATEGORIES)
  .map(([cat, subs]) => `  - "${cat}": ${subs.map((s) => `"${s}"`).join(", ")}`)
  .join("\n")}
  Choose the single closest match. If the category does not have a matching specific subcategory, use "Other".
- description: Write a concise product description for use in an interior design client proposal. Describe the item as a designer would naturally explain a selected product directly to a client during a conversation. The wording should feel human and conversational, not like manufacturer copy, ecommerce copy, or a technical specification sheet.
  Prioritize the product type, defining visual/design feature, primary materials, and at most one or two meaningful functional features. Include only the most important details needed for a client to understand the item.
  Do not include secondary technical details such as faucet hole spacing, mounting methods, plumbing accommodations, installation requirements, hardware options, care instructions, warranties, shipping information, or construction details that are not visually or functionally important to the client.
  Do not list available options or alternate finishes. Describe only the selected product/variant when clearly identified.
  Use clean, professional proposal language. Avoid marketing language, storytelling, superlatives, filler, and phrases such as "this piece includes," "designed to," "perfect for," "timeless," "luxurious," or "elevated." Never use any form of the verb "feature" ("features," "featuring," "featured").
  Do not invent or infer details. The final description must not exceed 250 characters, including spaces and punctuation. Prefer shorter wording when the product can be clearly described in fewer characters.
- finishColor: The finish, color, or upholstery (e.g. "Honed Natural", "Boucle Cream").
- manufacturer: The brand or manufacturer (e.g. "Crate & Barrel").
- materials: The material composition (e.g. "Solid Oak, Boucle Fabric").
- dimensions: The dimensions of the product. Format the value consistently using abbreviated dimensions with double quotes for inches and capital letters for directions, separated by " x " (e.g., "25.5" W x 25.5" D x 32.25" H"). Never write out the full words (e.g., do not write "Width", "Depth", "Height", "inches", or "in"). If only some dimensions are present, format similarly (e.g., "18" W x 24" H").
- msrp: The retail price/selling price listed on the page. Parse as a clean float number (e.g. 1299.00). Do not include currency symbols.
- sku: The model number, article number, model name, or inventory SKU of the product if listed (e.g. "42801140").
- imageUrls: ${imageUrlsInstruction}
- confidence: An object with keys matching each of the parsed text/numeric fields above (name, sku, category, subcategory, description, finishColor, manufacturer, materials, dimensions, msrp, imageUrls). For each field, return a float confidence value between 0.0 (completely uncertain) and 1.0 (absolutely certain) based on how clearly and unambiguously the information was stated in the page content.`;
}

const PRODUCT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    sku: { type: "STRING" },
    category: { type: "STRING" },
    subcategory: { type: "STRING" },
    description: { type: "STRING" },
    finishColor: { type: "STRING" },
    manufacturer: { type: "STRING" },
    materials: { type: "STRING" },
    dimensions: { type: "STRING" },
    msrp: { type: "NUMBER" },
    imageUrls: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    confidence: {
      type: "OBJECT",
      properties: {
        name: { type: "NUMBER" },
        sku: { type: "NUMBER" },
        category: { type: "NUMBER" },
        subcategory: { type: "NUMBER" },
        description: { type: "NUMBER" },
        finishColor: { type: "NUMBER" },
        manufacturer: { type: "NUMBER" },
        materials: { type: "NUMBER" },
        dimensions: { type: "NUMBER" },
        msrp: { type: "NUMBER" },
        imageUrls: { type: "NUMBER" },
      },
      required: [
        "name",
        "sku",
        "category",
        "subcategory",
        "description",
        "finishColor",
        "manufacturer",
        "materials",
        "dimensions",
        "msrp",
        "imageUrls",
      ],
    },
  },
  required: [
    "name",
    "sku",
    "category",
    "subcategory",
    "description",
    "finishColor",
    "manufacturer",
    "materials",
    "dimensions",
    "imageUrls",
    "confidence",
  ],
};

/**
 * Ferguson/Build.com serve images through a Cloudinary-style CDN (s3.img-b.com)
 * whose transform segment is caller-controlled — rewrite the small thumbnail
 * params the search index returns into a large square so we mirror high-res bytes.
 */
function upgradeKnownCdnTransforms(url: string): string {
  try {
    if (new URL(url).hostname.endsWith("img-b.com")) {
      return url
        .replace(/\bw_\d+/g, "w_1500")
        .replace(/\bh_\d+/g, "h_1500")
        .replace(/\bdpr_(?:auto|[\d.]+)/g, "dpr_1");
    }
  } catch {
    /* leave untouched */
  }
  return url;
}

/** One `images_search` item from DataForSEO's Google Images SERP endpoint. */
interface DfsImageItem {
  type?: string;
  title?: string;
  alt?: string;
  /** Source PAGE the image was indexed from (contextLink equivalent). */
  url?: string;
  /** Direct image URL. */
  source_url?: string;
}

/**
 * Image rescue for blocked sites: queries Google Images via DataForSEO's SERP
 * API (reusing the position-tracking credentials; Googlebot crawls through the
 * WAFs that block scrapers) for images of the exact product, then accepts only
 * results that provably belong to it:
 *   1. the source page is the same product page (shares a long numeric id token), or
 *   2. the normalized SKU appears in the image URL itself, or
 *   3. the result comes from the manufacturer's own domain and mentions the SKU.
 * Anything else is dropped — returning [] (and the client's warning toast)
 * beats attaching a lookalike product or wrong finish. Titles lie (a "PNLHP"
 * title can front a chrome-finish image), so tier 2 trusts only the image URL.
 * No-op when the DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD env vars are absent.
 * Cost: one live Google Images SERP ≈ $0.002, only on blocked-site fills.
 */
async function searchProductImagesViaSerp(
  originalUrl: string,
  manufacturer: string,
  sku: string,
): Promise<string[]> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password || !sku) return [];

  let originalHost = "";
  let numericIdTokens: string[] = [];
  try {
    const parsed = new URL(originalUrl);
    originalHost = parsed.hostname.replace(/^www\./, "");
    numericIdTokens = parsed.pathname.match(/\d{5,}/g) ?? [];
  } catch {
    return [];
  }

  let items: DfsImageItem[];
  try {
    const res = await fetch(
      "https://api.dataforseo.com/v3/serp/google/images/live/advanced",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            keyword: `${manufacturer} ${sku}`.trim(),
            location_code: 2840, // United States
            language_code: "en",
            depth: 20,
          },
        ]),
        cache: "no-store",
        signal: AbortSignal.timeout(25000),
      },
    );
    if (!res.ok) {
      console.warn(`[AI Autofill] DataForSEO image search HTTP ${res.status}`);
      return [];
    }
    const json = (await res.json()) as {
      tasks?: { status_code?: number; result?: { items?: DfsImageItem[] }[] }[];
    };
    const task = json.tasks?.[0];
    if (task?.status_code !== 20000) {
      console.warn(
        `[AI Autofill] DataForSEO task status ${task?.status_code ?? "missing"}`,
      );
      return [];
    }
    items = (task.result?.[0]?.items ?? []).filter(
      (i) => i.type === "images_search",
    );
  } catch (err) {
    console.warn("[AI Autofill] DataForSEO image search failed:", err);
    return [];
  }

  const skuLower = sku.toLowerCase();
  const skuCompact = skuLower.replace(/[^a-z0-9]/g, "");
  const manufacturerSlug = manufacturer.toLowerCase().replace(/[^a-z0-9]/g, "");

  const matchesSku = (value: string | undefined): boolean => {
    if (!value) return false;
    const lower = value.toLowerCase();
    return (
      lower.includes(skuLower) ||
      lower.replace(/[^a-z0-9]/g, "").includes(skuCompact)
    );
  };

  const scoreItem = (item: DfsImageItem): number => {
    const link = item.source_url ?? "";
    const contextLink = item.url ?? "";
    if (!link.startsWith("http") || JUNK_IMAGE_PATTERNS.test(link)) return 0;
    // Google's proxied thumbnails are tiny and expire — never use them.
    if (/\bgstatic\.com|\bggpht\.com/.test(link)) return 0;
    let contextHost = "";
    try {
      contextHost = new URL(contextLink).hostname.replace(/^www\./, "");
    } catch {
      /* no context host */
    }
    // Tier 1: indexed from the exact product page we were asked about.
    if (
      contextHost === originalHost &&
      numericIdTokens.some((t) => contextLink.includes(t))
    ) {
      return 3;
    }
    // Tier 2: the finish SKU is baked into the image URL itself.
    if (matchesSku(link)) return 2;
    // Tier 3: manufacturer's own domain, SKU mentioned in the result.
    if (
      manufacturerSlug &&
      contextHost.includes(manufacturerSlug) &&
      (matchesSku(contextLink) ||
        matchesSku(item.title) ||
        matchesSku(item.alt))
    ) {
      return 1;
    }
    return 0;
  };

  const scored = items
    .map((item) => ({ item, score: scoreItem(item) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const { item } of scored) {
    const url = upgradeKnownCdnTransforms(
      cleanImageUrlSize(item.source_url ?? ""),
    );
    const key = imageDedupKey(url);
    if (!url.startsWith("http") || seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
    if (urls.length >= MAX_IMAGES) break;
  }

  console.log(`[AI Autofill] SERP image rescue found ${urls.length} image(s)`);
  return urls;
}

/**
 * Fallback extractor for sites that block the scraper (e.g. Akamai/Cloudflare 403s):
 * a single Gemini call with the `url_context` tool, which fetches the page through
 * Google's own infrastructure — allowed through by many WAFs that reject scrapers.
 * Returns null on any failure so the caller can surface its original error message.
 *
 * Runs on `SCRAPER_CONFIG.urlContextModel` (must stay a Gemini 3.x model — 2.5-era
 * models reject tools combined with JSON response mode). Note the REST field is
 * camelCase `urlContext`; the snake_case `url_context` silently fails to trigger.
 */
async function extractProductViaUrlContext(
  apiKey: string,
  normalizedUrl: string,
  imageCandidates: string[],
): Promise<AutofillResult | null> {
  const model = SCRAPER_CONFIG.urlContextModel;
  console.log(
    `[AI Autofill] Scraper blocked — attempting url_context fallback via ${model}`,
  );

  const imageInstruction =
    imageCandidates.length > 0
      ? `Select the top 1 to ${MAX_IMAGES} direct product image URLs from the 'Candidate Images' array (pre-ranked best-first), and add any additional absolute product image URLs found in the retrieved page content up to ${MAX_IMAGES} total. CRITICAL: You must NEVER return base64-encoded data: URLs. Only return absolute HTTP or HTTPS URLs.`
      : `Extract up to ${MAX_IMAGES} absolute product image URLs (best/primary first) if any appear in the retrieved page content; otherwise return an empty array. CRITICAL: You must NEVER return base64-encoded data: URLs. Only return absolute HTTP or HTTPS URLs.`;

  const prompt = `You are an expert product data extractor. Use the url_context tool to retrieve the product page at the URL below, then extract the exact product specifications to populate a library item form.

URL: ${normalizedUrl}
${
  imageCandidates.length > 0
    ? `\nCandidate Images found on the page:\n${JSON.stringify(imageCandidates)}\n`
    : ""
}
Extract the following specifications and return them in the requested JSON structure. If a field cannot be found, use an empty string or omit it.
Specifically:
${productFieldInstructions(imageInstruction)}

${JSON_OUTPUT_RULES}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ urlContext: {} }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: PRODUCT_RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(60000),
      },
    );

    if (!res.ok) {
      console.error(
        `[AI Autofill] url_context fallback failed with HTTP ${res.status}`,
      );
      return null;
    }

    const geminiJson = await res.json();
    void recordAiUsage(geminiJson?.usageMetadata);

    const candidate = geminiJson.candidates?.[0];
    const retrievalStatus =
      candidate?.urlContextMetadata?.urlMetadata?.[0]?.urlRetrievalStatus;
    if (retrievalStatus !== "URL_RETRIEVAL_STATUS_SUCCESS") {
      console.warn(
        `[AI Autofill] url_context could not retrieve the page: ${retrievalStatus ?? "no retrieval metadata"}`,
      );
      return null;
    }

    // Gemini 3.x may prepend thought-signature parts; take the first text part.
    const parts = candidate?.content?.parts as { text?: string }[] | undefined;
    const parsedText = parts?.find((p) => typeof p.text === "string")?.text;
    if (!parsedText) {
      console.warn("[AI Autofill] url_context fallback returned no text part");
      return null;
    }

    let sanitizedData = sanitizeProductData(parseGeminiJson(parsedText));
    console.log(
      `[AI Autofill] url_context fallback succeeded. Data:`,
      sanitizedData,
    );

    // url_context strips markup, so imageUrls is usually empty here. When a SKU
    // was extracted, try recovering images from Google's search index instead.
    const hasImages = (sanitizedData.imageUrls ?? []).some(
      (u) => typeof u === "string" && u.trim(),
    );
    let rescueNote = "not needed (model returned images)";
    if (!hasImages) {
      if (sanitizedData.sku) {
        const rescued = await searchProductImagesViaSerp(
          normalizedUrl,
          sanitizedData.manufacturer ?? "",
          sanitizedData.sku,
        );
        if (rescued.length > 0) {
          sanitizedData = { ...sanitizedData, imageUrls: rescued };
        }
        rescueNote = `ran — ${rescued.length} validated image(s) attached`;
      } else {
        rescueNote = "skipped (no SKU extracted to search by)";
      }
    }

    void saveDiagnosticRun({
      type: "product",
      url: normalizedUrl,
      scrapedMarkdown: [
        "Scraper blocked — page retrieved via Gemini url_context. Google injects a condensed text digest server-side; the raw page content is never returned, so there is no markdown to show.",
        "",
        `Retrieved URL: ${candidate?.urlContextMetadata?.urlMetadata?.[0]?.retrievedUrl ?? normalizedUrl}`,
        `Page digest size: ~${geminiJson?.usageMetadata?.toolUsePromptTokenCount ?? "unknown"} tokens (billed as input)`,
        `SERP image rescue (DataForSEO): ${rescueNote}`,
      ].join("\n"),
      prompt,
      rawResponse: parsedText,
      parsedData: sanitizedData,
    });

    return {
      success: true,
      modelUsed: `${model} (url_context)`,
      data: sanitizedData,
    };
  } catch (error) {
    console.error("[AI Autofill] url_context fallback error:", error);
    return null;
  }
}

/**
 * Server Action: Scrapes a product webpage via Jina Reader and passes the cleaned
 * markdown to Gemini. Returns structured, verified JSON content
 * alongside confidence ratings and a raw snapshot of the page contents.
 */
export async function autofillProductFromUrl(
  url: string,
): Promise<AutofillResult> {
  try {
    if (!url || url.trim() === "") {
      return {
        success: false,
        error: "Please enter a valid product web link.",
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error:
          "GEMINI_API_KEY is not defined. Please add it to your apps/dashboard/.env.local file.",
      };
    }

    const normalizedUrl = withProtocol(url.trim());
    console.log(
      `[AI Autofill] Starting scraping via Jina Reader for: ${normalizedUrl}`,
    );

    // 1. Fetch the raw page contents converted to clean Markdown via Jina Reader
    const jinaHeaders: Record<string, string> = {
      "X-Remove-Selector":
        "nav, header, footer, .navigation, .menu, .nav, .minicart, .mega-menu, .megamenu, #header, #footer, #nav, #menu, .header, .footer, .js-mini-cart, .global-header, .global-footer, .newsletter-signup",
      "X-No-Cache": "true",
    };
    if (process.env.JINA_API_KEY) {
      jinaHeaders.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
    }

    // Kick off a best-effort raw HTML fetch in parallel: Jina markdown drives the spec
    // extraction, but the raw HTML is where the high-quality image signals live
    // (og:image, JSON-LD, srcset). Failures here are non-fatal — images simply fall
    // back to whatever the markdown yields.
    const rawHtmlPromise = fetch(normalizedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CRM-Enricher/1.0)" },
      signal: AbortSignal.timeout(12000),
    })
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "");

    // Image candidates for the url_context fallback: best-effort from the direct
    // HTML fetch only (when the scraper is blocked there is no Jina markdown, and
    // a site that blocks Jina usually blocks this fetch too — empty is fine).
    const htmlImageCandidates = async (): Promise<string[]> => {
      const rawHtml = await rawHtmlPromise;
      if (!rawHtml) return [];
      return extractProductImagesFromHtml(rawHtml, normalizedUrl)
        .filter((src) => !JUNK_IMAGE_PATTERNS.test(src))
        .slice(0, SCRAPER_CONFIG.maxImageCandidates);
    };

    const jinaRes = await fetch(
      `${SCRAPER_CONFIG.jinaReaderUrl}${normalizedUrl}`,
      {
        headers: jinaHeaders,
        next: { revalidate: 0 }, // Prevent Next.js from caching pages so it grabs fresh pricing
        signal: AbortSignal.timeout(20000), // 20 seconds timeout to prevent infinite hanging
      },
    );

    if (!jinaRes.ok) {
      console.error(
        `[AI Autofill] Jina Reader failed with status ${jinaRes.status}`,
      );
      const fallback = await extractProductViaUrlContext(
        apiKey,
        normalizedUrl,
        await htmlImageCandidates(),
      );
      if (fallback) return fallback;
      return {
        success: false,
        error: `Could not reach the website via AI Scraper (Jina Reader status: ${jinaRes.status}).`,
      };
    }

    const rawMarkdownText = await jinaRes.text();
    if (!rawMarkdownText || rawMarkdownText.trim() === "") {
      console.error(`[AI Autofill] Jina Reader returned empty markdown`);
      return {
        success: false,
        error: "The scraper was unable to read any content from that webpage.",
      };
    }

    const markdownText = cleanScrapedMarkdown(rawMarkdownText);
    if (markdownText.trim() === "") {
      console.error(`[AI Autofill] Cleaned markdown is empty`);
      return {
        success: false,
        error:
          "The scraper was unable to extract readable content from that webpage.",
      };
    }

    // Intercept Jina Reader upstream block/HTTP errors hidden in successful text responses
    if (markdownText.includes("Warning: Target URL returned error")) {
      const errorLine =
        markdownText
          .split("\n")
          .find((line) =>
            line.includes("Warning: Target URL returned error"),
          ) || "";
      console.error(
        `[AI Autofill] Jina Reader scraped a target site error: ${errorLine}`,
      );

      if (errorLine.includes("404")) {
        return {
          success: false,
          error: "This product page was not found. Please verify the link.",
        };
      }
      if (errorLine.includes("503") || errorLine.includes("502")) {
        return {
          success: false,
          error:
            "The website is temporarily unavailable. Please try again later or type details manually.",
        };
      }

      // Blocked (403) or otherwise unreadable: the page exists but a WAF rejects
      // the scraper. Gemini's url_context fetcher often gets through where Jina
      // (and direct fetches) are blocked.
      const fallback = await extractProductViaUrlContext(
        apiKey,
        normalizedUrl,
        await htmlImageCandidates(),
      );
      if (fallback) return fallback;

      return {
        success: false,
        error: errorLine.includes("403")
          ? "This website is protected against AI. Please input specifications manually."
          : "Fetching data was blocked or could not read this website. Please input specs manually.",
      };
    }

    console.log(
      `[AI Autofill] Scraped Markdown successfully. Length: ${markdownText.length} characters.`,
    );

    // 2. High-Density Payload Extraction (Multi-Strategy Image URL Crawler)
    const markdownCandidates: { url: string; highPriority: boolean }[] = [];
    const seenMarkdownUrls = new Set<string>();

    // Find the first index of specifications or details sections in markdown
    const lowerMarkdown = markdownText.toLowerCase();
    const specKeywords = [
      "specification",
      "spec sheet",
      "specsheet",
      "specs",
      "dimension",
      "details",
      "downloads",
      "tearsheet",
    ];
    let specStartIndex = markdownText.length;
    for (const kw of specKeywords) {
      const idx = lowerMarkdown.indexOf(kw);
      if (idx !== -1 && idx < specStartIndex) {
        specStartIndex = idx;
      }
    }

    const addMarkdownCandidate = (
      src: string,
      matchIndex: number,
      matchLength: number,
    ) => {
      const trimmed = src.trim();
      if (!trimmed || seenMarkdownUrls.has(trimmed)) return;
      seenMarkdownUrls.add(trimmed);

      // Check if near "View larger image"
      const startRange = Math.max(0, matchIndex - 120);
      const endRange = Math.min(
        markdownText.length,
        matchIndex + matchLength + 120,
      );
      const surroundingContext = markdownText
        .substring(startRange, endRange)
        .toLowerCase();
      const isNearViewLarger = surroundingContext.includes("view larger image");

      // Check if before specifications
      const isBeforeSpecs = matchIndex < specStartIndex;

      const highPriority = isNearViewLarger || isBeforeSpecs;
      markdownCandidates.push({ url: trimmed, highPriority });
    };

    let match: RegExpExecArray | null;

    // Strategy A: Standard markdown images `![Alt text](url)`
    const mdImgRegex = /!\[.*?\]\((https?:\/\/[^)\s]+)\)/gi;
    match = mdImgRegex.exec(markdownText);
    while (match !== null) {
      const src = match[1].trim();
      addMarkdownCandidate(src, match.index, match[0].length);
      match = mdImgRegex.exec(markdownText);
    }

    // Strategy B: Raw HTML `<img>` tag sources if present
    const htmlImgRegex = /<img\s+[^>]*src=["'](https?:\/\/[^"']+)["']/gi;
    match = htmlImgRegex.exec(markdownText);
    while (match !== null) {
      const src = match[1].trim();
      addMarkdownCandidate(src, match.index, match[0].length);
      match = htmlImgRegex.exec(markdownText);
    }

    // Strategy C: Markdown links containing image keywords or standard extensions `[Alt text](url)`
    const mdLinkRegex = /\[.*?\]\((https?:\/\/[^)\s]+)\)/gi;
    const imgExtensionOrPathPattern =
      /\.(jpg|jpeg|png|webp|gif|svg|tiff)(\?.*)?$/i;
    const imageKeywordPattern =
      /image|product|asset|media|photo|picture|thumb/i;
    match = mdLinkRegex.exec(markdownText);
    while (match !== null) {
      const src = match[1].trim();
      if (
        imgExtensionOrPathPattern.test(src) ||
        imageKeywordPattern.test(src)
      ) {
        addMarkdownCandidate(src, match.index, match[0].length);
      }
      match = mdLinkRegex.exec(markdownText);
    }

    // Strategy D: Raw absolute URLs in the text ending with classic image extensions (with optional queries)
    const rawUrlRegex =
      /(https?:\/\/[^\s"'<>()]+?\.(?:jpg|jpeg|png|webp|gif|svg)(?:\?[^\s"'<>()]*)?)/gi;
    match = rawUrlRegex.exec(markdownText);
    while (match !== null) {
      const src = match[1].trim();
      addMarkdownCandidate(src, match.index, match[0].length);
      match = rawUrlRegex.exec(markdownText);
    }

    // Strategy E: Standards-based extraction from raw HTML (og:image, JSON-LD, srcset).
    // These are canonical, high-resolution sources, so they lead the candidate list.
    const rawHtml = await rawHtmlPromise;
    const htmlImages = rawHtml
      ? extractProductImagesFromHtml(rawHtml, normalizedUrl)
      : [];
    console.log(
      `[AI Autofill] HTML-derived image candidates: ${htmlImages.length}`,
    );

    // Merge HTML-derived (priority) ahead of markdown candidates, collapsing size
    // variants of the same photo so the largest/canonical version wins each slot.
    const mergedImages: string[] = [];
    const seenImageKeys = new Set<string>();

    const tryAddImage = (src: string) => {
      const trimmed = src.trim();
      if (!trimmed.startsWith("http") || JUNK_IMAGE_PATTERNS.test(trimmed))
        return;
      const cleanUrl = cleanImageUrlSize(trimmed);
      const key = imageDedupKey(cleanUrl);
      if (seenImageKeys.has(key)) return;
      seenImageKeys.add(key);
      mergedImages.push(cleanUrl);
    };

    // 1. Add high-priority markdown images (View larger / before specs)
    for (const item of markdownCandidates) {
      if (item.highPriority) {
        tryAddImage(item.url);
      }
    }

    // 2. Add HTML-derived images (og:image, JSON-LD, etc.)
    for (const src of htmlImages) {
      tryAddImage(src);
    }

    // 3. Add other markdown images
    for (const item of markdownCandidates) {
      if (!item.highPriority) {
        tryAddImage(item.url);
      }
    }

    const filteredImages = mergedImages.slice(
      0,
      SCRAPER_CONFIG.maxImageCandidates,
    );
    console.log(
      `[AI Autofill] Filtered image candidates count: ${filteredImages.length}`,
      filteredImages,
    );

    const optimizedMarkdown = markdownText.substring(
      0,
      SCRAPER_CONFIG.maxCharacters,
    );

    // 3. Formulate Query to Gemini 3.5 Flash with fallback
    console.log(`[AI Autofill] Sending optimized markdown to Gemini...`);

    const requestBody = JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are an expert product data extractor. Parse the product page details below, which is a Markdown snapshot of an e-commerce website. Extract the exact product specifications to populate a library item form.

URL: ${normalizedUrl}
Page Content:
${optimizedMarkdown}

Candidate Images found on the page:
${JSON.stringify(filteredImages)}

Extract the following specifications and return them in the requested JSON structure. If a field cannot be found, use an empty string or omit it.
Specifically:
${productFieldInstructions(
  `The 'Candidate Images' array above is pre-ranked best-first. Select the top 1 to ${MAX_IMAGES} direct product image URLs from that array, keeping the very first suitable product image as the primary cover. If the 'Candidate Images' array is incomplete (contains fewer than ${MAX_IMAGES} valid product gallery images) or empty, you MUST also extract valid absolute product image URLs directly from the Markdown page content to complete the list up to ${MAX_IMAGES} images. Strongly prefer images that represent different views/details of the product. CRITICAL: You must NEVER under any circumstances return base64-encoded image data URLs (e.g. data:image/jpeg;base64,...). Only return absolute HTTP or HTTPS URLs.`,
)}

${JSON_OUTPUT_RULES}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: PRODUCT_RESPONSE_SCHEMA,
      },
    });

    const { response: geminiRes, modelUsed } = await fetchGeminiWithFallback(
      apiKey,
      requestBody,
      AbortSignal.timeout(45000),
    );
    console.log(
      `[AI Autofill] Gemini response received with status: ${geminiRes.status}`,
    );

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error("Gemini API Error:", errorText);
      const { retryable, message } = classifyGeminiError(geminiRes.status);
      return {
        success: false,
        retryable,
        error:
          message ??
          "The Gemini AI model failed to extract product data from the scraped webpage.",
      };
    }

    const geminiJson = await geminiRes.json();
    void recordAiUsage(geminiJson?.usageMetadata);
    const parsedText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!parsedText) {
      return {
        success: false,
        error:
          "The AI model returned an empty response. Product could not be parsed.",
      };
    }

    const data = parseGeminiJson(parsedText);
    const sanitizedData = sanitizeProductData(data);
    console.log(
      `[AI Autofill] Gemini response successfully parsed and sanitized! Data:`,
      sanitizedData,
    );

    // Save diagnostic run in Firestore background (non-blocking)
    void saveDiagnosticRun({
      type: "product",
      url: normalizedUrl,
      scrapedMarkdown: markdownText,
      prompt:
        typeof requestBody === "string"
          ? JSON.parse(requestBody).contents?.[0]?.parts?.[0]?.text ||
            requestBody
          : "",
      rawResponse: parsedText,
      parsedData: sanitizedData,
    });

    // Append the raw Markdown snapshot of Jina Reader for tracing and debugging purposes
    return {
      success: true,
      modelUsed,
      data: {
        ...sanitizedData,
        rawExtraction: optimizedMarkdown,
      },
    };
  } catch (error: unknown) {
    console.error("Autofill Server Action Error:", error);
    if (error instanceof Error && error.name === "TimeoutError") {
      return {
        success: false,
        retryable: true,
        error:
          "AI scraping timed out. The website is taking too long to respond. Please try again.",
      };
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage || "An unexpected error occurred during AI autofill.",
    };
  }
}

// ─── Image Mirroring ────────────────────────────────────────────────────────────

export interface FetchedImage {
  success: boolean;
  /** Base64-encoded image bytes (no data: prefix). */
  base64?: string;
  /** MIME type reported by the source server (e.g. "image/jpeg"). */
  contentType?: string;
  error?: string;
}

/** Maximum image size we are willing to mirror into Firebase Storage (12 MB). */
const MAX_MIRROR_BYTES = 12 * 1024 * 1024;

/**
 * Server Action: fetches an external image server-side (bypassing browser CORS) and
 * returns its bytes as base64. The client then re-uploads these bytes to Firebase
 * Storage via the authenticated client SDK — there is no firebase-admin in this app,
 * so the download must happen on the server and the upload on the client.
 */
export async function fetchImageBytes(url: string): Promise<FetchedImage> {
  try {
    if (!url || !/^https?:\/\//i.test(url)) {
      return { success: false, error: "Invalid image URL." };
    }

    // Present as a real browser. Many image hosts return 403 to non-browser
    // User-Agents or to requests with no Referer (hotlink protection); a
    // same-origin Referer is what those checks usually look for.
    let referer: string | undefined;
    try {
      referer = `${new URL(url).origin}/`;
    } catch {
      referer = undefined;
    }

    let res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        ...(referer ? { Referer: referer } : {}),
      },
      // Never cache: a transient failure (e.g. a 403) must not be replayed.
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(
        `[fetchImageBytes] Direct fetch failed (status ${res.status}). Retrying via images.weserv.nl...`,
      );
      const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
      res = await fetch(proxyUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
    }

    if (!res.ok) {
      return {
        success: false,
        error: `Image fetch failed (status ${res.status}).`,
      };
    }

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return { success: false, error: "That URL did not return an image." };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0) {
      return { success: false, error: "The image was empty." };
    }
    if (buffer.byteLength > MAX_MIRROR_BYTES) {
      return { success: false, error: "The image is too large to mirror." };
    }

    return { success: true, base64: buffer.toString("base64"), contentType };
  } catch (error: unknown) {
    try {
      console.warn(
        `[fetchImageBytes] Direct fetch threw error. Retrying via images.weserv.nl...`,
        error,
      );
      const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const contentType = res.headers.get("content-type") ?? "image/jpeg";
        if (contentType.startsWith("image/")) {
          const buffer = Buffer.from(await res.arrayBuffer());
          if (buffer.byteLength > 0 && buffer.byteLength <= MAX_MIRROR_BYTES) {
            return {
              success: true,
              base64: buffer.toString("base64"),
              contentType,
            };
          }
        }
      }
    } catch (fallbackError) {
      console.error(
        "[fetchImageBytes] Fallback proxy also failed:",
        fallbackError,
      );
    }

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unexpected error fetching the image.",
    };
  }
}

// ─── Vendor Autofill ──────────────────────────────────────────────────────────

export interface VendorAutofillResult {
  success: boolean;
  error?: string;
  /** True when the failure is transient (Gemini overload/rate-limit/timeout) and a retry may succeed. */
  retryable?: boolean;
  modelUsed?: string;
  data?: {
    name?: string;
    category?: string;
    description?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    formattedAddress?: string;
    repPhone?: string;
    repEmail?: string;
    logoUrl?: string;
    heroImageUrl?: string;
    imageCandidates?: string[];
    showImagePicker?: boolean;
    confidence?: Record<string, number>;
    instagram?: string;
    pinterest?: string;
    facebook?: string;
    youtube?: string;
    xTwitter?: string;
  };
}

/**
 * Vendor enrichment scrapes the **exact** URL the user entered — paths, locale
 * routes (`/en/`, `/it/`), and trailing slashes are all significant (stripping
 * them loses localized content or 404s some sites). We only add a protocol if
 * missing; we never reduce the URL to its origin.
 */
function normalizeVendorUrl(url: string): string {
  return withProtocol(url.trim());
}

function resolveAbsoluteUrl(href: string, base: string): string {
  if (href.startsWith("http://")) {
    return href.replace(/^http:\/\//i, "https://");
  }
  if (href.startsWith("https://")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) {
    try {
      const { protocol, hostname } = new URL(base);
      return `${protocol}//${hostname}${href}`;
    } catch {
      return href;
    }
  }
  return href;
}

interface OgMeta {
  ogImage?: string;
  ogDescription?: string;
  ogSiteName?: string;
  faviconUrl?: string;
  schemaLogo?: string;
}

function extractOgMeta(html: string, base: string): OgMeta {
  const head = html.substring(0, 25000);

  function firstMatch(patterns: RegExp[]): string | undefined {
    for (const p of patterns) {
      const m = p.exec(head);
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return undefined;
  }

  const ogImage = firstMatch([
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ]);

  const ogDescription = firstMatch([
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
  ]);

  const ogSiteName = firstMatch([
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i,
  ]);

  const rawFavicon = firstMatch([
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i,
    /<link[^>]+rel=["']shortcut icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']shortcut icon["']/i,
    /<link[^>]+rel=["']icon["'][^>]+type=["']image\/(?:png|svg[^"']*)["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']icon["']/i,
  ]);
  const faviconUrl = rawFavicon
    ? resolveAbsoluteUrl(rawFavicon, base)
    : undefined;

  let schemaLogo: string | undefined;
  const jsonLdRe =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch = jsonLdRe.exec(head);
  while (ldMatch !== null) {
    try {
      const ld = JSON.parse(ldMatch[1]) as Record<string, unknown>;
      const candidates = [
        (ld?.logo as Record<string, string>)?.url,
        typeof ld?.logo === "string" ? ld.logo : undefined,
        (ld?.image as Record<string, string>)?.url,
        typeof ld?.image === "string" ? ld.image : undefined,
      ].filter(
        (v): v is string => typeof v === "string" && v.startsWith("http"),
      );
      if (candidates[0]) {
        schemaLogo = candidates[0];
        break;
      }
    } catch {
      /* skip */
    }
    ldMatch = jsonLdRe.exec(head);
  }

  return {
    ogImage: ogImage ? resolveAbsoluteUrl(ogImage, base) : undefined,
    ogDescription,
    ogSiteName,
    faviconUrl,
    schemaLogo,
  };
}

function extractVendorImageCandidates(markdown: string): {
  logoCandidates: string[];
  imageCandidates: string[];
} {
  const all: string[] = [];

  const mdImgRe = /!\[.*?\]\((https?:\/\/[^)\s]+)\)/gi;
  let m = mdImgRe.exec(markdown);
  while (m !== null) {
    const src = m[1].trim();
    if (src && !all.includes(src)) all.push(src);
    m = mdImgRe.exec(markdown);
  }

  const htmlImgRe = /<img\s+[^>]*src=["'](https?:\/\/[^"']+)["']/gi;
  m = htmlImgRe.exec(markdown);
  while (m !== null) {
    const src = m[1].trim();
    if (src && !all.includes(src)) all.push(src);
    m = htmlImgRe.exec(markdown);
  }

  const rawUrlRe =
    /(https?:\/\/[^\s"'<>()]+?\.(?:jpg|jpeg|png|webp|gif|svg)(?:\?[^\s"'<>()]*)?)/gi;
  m = rawUrlRe.exec(markdown);
  while (m !== null) {
    const src = m[1].trim();
    if (src && !all.includes(src)) all.push(src);
    m = rawUrlRe.exec(markdown);
  }

  const junkRe =
    /pixel|tracker|analytics|data:|base64|cart|checkout|spinner|loading|1x1|adroll|doubleclick|yotpo|trust|badge|payment|paypal|visa|mastercard|amex|applepay|googlepay|shipping|delivery|guarante|refund|secur|padlock|warranty|\.svg|\.gif/i;
  const logoKeyRe = /logo|brand|icon/i;

  const logoCandidates: string[] = [];
  const imageCandidates: string[] = [];

  for (const src of all) {
    if (junkRe.test(src)) continue;
    const cleanUrl = cleanImageUrlSize(src);
    if (logoKeyRe.test(cleanUrl)) {
      if (logoCandidates.length < 6 && !logoCandidates.includes(cleanUrl))
        logoCandidates.push(cleanUrl);
    } else {
      if (imageCandidates.length < 6 && !imageCandidates.includes(cleanUrl))
        imageCandidates.push(cleanUrl);
    }
  }

  return { logoCandidates, imageCandidates };
}

const VENDOR_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    category: { type: "STRING" },
    description: { type: "STRING" },
    addressLine1: { type: "STRING" },
    addressLine2: { type: "STRING" },
    city: { type: "STRING" },
    region: { type: "STRING" },
    postalCode: { type: "STRING" },
    country: { type: "STRING" },
    formattedAddress: { type: "STRING" },
    repPhone: { type: "STRING" },
    repEmail: { type: "STRING" },
    logoUrl: { type: "STRING" },
    heroImageUrl: { type: "STRING" },
    instagram: { type: "STRING" },
    pinterest: { type: "STRING" },
    facebook: { type: "STRING" },
    youtube: { type: "STRING" },
    xTwitter: { type: "STRING" },
    confidence: {
      type: "OBJECT",
      properties: {
        name: { type: "NUMBER" },
        category: { type: "NUMBER" },
        description: { type: "NUMBER" },
        addressLine1: { type: "NUMBER" },
        addressLine2: { type: "NUMBER" },
        city: { type: "NUMBER" },
        region: { type: "NUMBER" },
        postalCode: { type: "NUMBER" },
        country: { type: "NUMBER" },
        formattedAddress: { type: "NUMBER" },
        repPhone: { type: "NUMBER" },
        repEmail: { type: "NUMBER" },
        logoUrl: { type: "NUMBER" },
        heroImageUrl: { type: "NUMBER" },
        instagram: { type: "NUMBER" },
        pinterest: { type: "NUMBER" },
        facebook: { type: "NUMBER" },
        youtube: { type: "NUMBER" },
        xTwitter: { type: "NUMBER" },
      },
      required: [
        "name",
        "category",
        "description",
        "addressLine1",
        "addressLine2",
        "city",
        "region",
        "postalCode",
        "country",
        "formattedAddress",
        "repPhone",
        "repEmail",
        "logoUrl",
        "heroImageUrl",
        "instagram",
        "pinterest",
        "facebook",
        "youtube",
        "xTwitter",
      ],
    },
  },
  required: [
    "name",
    "category",
    "description",
    "addressLine1",
    "addressLine2",
    "city",
    "region",
    "postalCode",
    "country",
    "formattedAddress",
    "repPhone",
    "repEmail",
    "logoUrl",
    "heroImageUrl",
    "instagram",
    "pinterest",
    "facebook",
    "youtube",
    "xTwitter",
    "confidence",
  ],
};

/**
 * Google's favicon cache — serves a site's icon from Google's own infrastructure,
 * so it works even for WAF-walled sites. A 256px icon is a usable logo stand-in
 * (surfaced with low confidence; the user can replace it in the form).
 */
function faviconLogoUrl(siteUrl: string): string | undefined {
  try {
    const host = new URL(siteUrl).hostname;
    return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${host}&size=256`;
  } catch {
    return undefined;
  }
}

/**
 * Vendor fallback for sites that block the scraper (mirrors the product flow):
 * one Gemini call with the `url_context` tool extracts the text fields (name,
 * address, contact, socials — prose that survives Google's page digest). Images
 * can't come from the digest, so the logo falls back to Google's favicon cache
 * and the hero is left empty for the user to upload. Returns null on any
 * failure so the caller can surface its own error message.
 */
async function extractVendorViaUrlContext(
  apiKey: string,
  vendorUrl: string,
): Promise<VendorAutofillResult | null> {
  const model = SCRAPER_CONFIG.urlContextModel;
  console.log(
    `[Vendor Autofill] Scraper blocked — attempting url_context fallback via ${model}`,
  );

  const prompt = `You are an expert business data extractor for an interior design CRM. Use the url_context tool to retrieve the company website at the URL below, then extract structured contact and brand information. For contact details NOT found on the retrieved page (address, phone, email, social profiles), use Google Search to find the company's official headquarters contact information — but only report values clearly associated with this exact company; when uncertain, return an empty string rather than guessing.

Page URL: ${vendorUrl}

Extract the following and return as JSON:
- name: The company's official brand/trade name.
- category: Match to ONE of these exact categories: ${VENDOR_CATEGORIES.join(", ")}. Leave empty if unsure.
- description: A clean 1–3 sentence company description or tagline. About the company, not a product.
- addressLine1: Street address line (number + street, or PO box) from footer, contact, or about section. Empty if not found.
- addressLine2: Secondary address line (suite, unit, floor, building) if present. Empty if not found.
- city: City / town / locality from the business address. Empty if not found.
- region: State, province, or region exactly as written on the page (e.g. "TX", "Ontario", "Lombardia"). Do NOT convert or assume a US state. Empty if not found.
- postalCode: Postal/ZIP code in whatever format appears (e.g. "12345", "SW1A 1AA", "75008"). Empty if not found.
- country: The country as an ISO 3166-1 alpha-2 code (e.g. "US", "CA", "GB", "IT"). Do NOT assume the United States — infer it from the address, domain, currency, language, or phone code. Empty only if genuinely indeterminable.
- formattedAddress: The full address as a single human-readable line. ALWAYS provide this whenever any address text is present, even if you cannot split it into the discrete fields above.
- repPhone: Primary business phone number. Empty if not found.
- repEmail: Primary business contact email (not newsletter/unsubscribe). Empty if not found.
- logoUrl: Return an empty string (the logo is resolved separately).
- heroImageUrl: Return an empty string (the cover image is chosen separately).
- instagram: The company's official Instagram profile URL if found. Empty string if not found.
- pinterest: The company's official Pinterest profile URL if found. Empty string if not found.
- facebook: The company's official Facebook page URL if found. Empty string if not found.
- youtube: The company's official YouTube channel URL if found. Empty string if not found.
- xTwitter: The company's official X / Twitter profile URL if found. Empty string if not found.
- confidence: Float 0.0–1.0 for each field based on how clearly the information appeared.

CRITICAL: Return 100% valid JSON only. Use empty string "" for fields not found.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          // googleSearch backfills contact info the walled page can't provide
          // (HQ address, phone, socials live in Google's index/Knowledge Graph).
          tools: [{ urlContext: {} }, { googleSearch: {} }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: VENDOR_RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(60000),
      },
    );

    if (!res.ok) {
      console.error(
        `[Vendor Autofill] url_context fallback HTTP ${res.status}`,
      );
      return null;
    }

    const geminiJson = await res.json();
    void recordAiUsage(geminiJson?.usageMetadata);

    const candidate = geminiJson.candidates?.[0];
    const retrievalStatus =
      candidate?.urlContextMetadata?.urlMetadata?.[0]?.urlRetrievalStatus;
    if (retrievalStatus !== "URL_RETRIEVAL_STATUS_SUCCESS") {
      console.warn(
        `[Vendor Autofill] url_context could not retrieve the page: ${retrievalStatus ?? "no retrieval metadata"}`,
      );
      return null;
    }

    const parts = candidate?.content?.parts as { text?: string }[] | undefined;
    const parsedText = parts?.find((p) => typeof p.text === "string")?.text;
    if (!parsedText) return null;

    const extracted = parseGeminiJson(parsedText) as Record<string, unknown>;
    const conf = (extracted.confidence ?? {}) as Record<string, number>;
    const logoUrl = faviconLogoUrl(vendorUrl);
    if (logoUrl) conf.logoUrl = 0.4;

    const returnedData = sanitizeVendorData({
      name: (extracted.name as string) || undefined,
      category: (extracted.category as string) || undefined,
      description: (extracted.description as string) || undefined,
      addressLine1: (extracted.addressLine1 as string) || undefined,
      addressLine2: (extracted.addressLine2 as string) || undefined,
      city: (extracted.city as string) || undefined,
      region: (extracted.region as string) || undefined,
      postalCode: (extracted.postalCode as string) || undefined,
      country: (extracted.country as string) || undefined,
      formattedAddress: (extracted.formattedAddress as string) || undefined,
      repPhone: (extracted.repPhone as string) || undefined,
      repEmail: (extracted.repEmail as string) || undefined,
      logoUrl,
      heroImageUrl: undefined,
      imageCandidates: undefined,
      showImagePicker: false,
      confidence: conf,
      instagram: (extracted.instagram as string) || undefined,
      pinterest: (extracted.pinterest as string) || undefined,
      facebook: (extracted.facebook as string) || undefined,
      youtube: (extracted.youtube as string) || undefined,
      xTwitter: (extracted.xTwitter as string) || undefined,
    });

    void saveDiagnosticRun({
      type: "vendor",
      url: vendorUrl,
      scrapedMarkdown: [
        "Scraper blocked — page retrieved via Gemini url_context. Google injects a condensed text digest server-side; the raw page content is never returned, so there is no markdown to show.",
        "",
        `Retrieved URL: ${candidate?.urlContextMetadata?.urlMetadata?.[0]?.retrievedUrl ?? vendorUrl}`,
        `Page digest size: ~${geminiJson?.usageMetadata?.toolUsePromptTokenCount ?? "unknown"} tokens (billed as input)`,
        `Google Search grounding: ${candidate?.groundingMetadata ? "invoked (backfilled contact fields from the search index)" : "not invoked"}`,
        `Logo: ${logoUrl ? "Google favicon cache fallback (confidence 0.4)" : "none available"}; hero left empty by design`,
      ].join("\n"),
      prompt,
      rawResponse: parsedText,
      parsedData: returnedData,
    });

    return {
      success: true,
      modelUsed: `${model} (url_context)`,
      data: returnedData,
    };
  } catch (error) {
    console.error("[Vendor Autofill] url_context fallback error:", error);
    return null;
  }
}

export async function autofillVendorFromUrl(
  url: string,
): Promise<VendorAutofillResult> {
  try {
    if (!url?.trim()) {
      return { success: false, error: "Please enter a vendor website URL." };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { success: false, error: "GEMINI_API_KEY is not configured." };
    }

    const vendorUrl = normalizeVendorUrl(url);
    console.log(`[Vendor Autofill] Fetching: ${vendorUrl}`);

    const jinaHeaders: Record<string, string> = { "X-No-Cache": "true" };
    if (process.env.JINA_API_KEY)
      jinaHeaders.Authorization = `Bearer ${process.env.JINA_API_KEY}`;

    const [htmlSettled, jinaSettled] = await Promise.allSettled([
      fetch(vendorUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CRM-Enricher/1.0)" },
        signal: AbortSignal.timeout(10000),
        // A WAF 403 page must count as "no HTML", not content — the blocked-site
        // fallback below keys off rawHtml being empty.
      }).then((r) => (r.ok ? r.text() : "")),
      fetch(`${SCRAPER_CONFIG.jinaReaderUrl}${vendorUrl}`, {
        headers: jinaHeaders,
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(20000),
      }).then((r) => (r.ok ? r.text() : Promise.reject(`Jina ${r.status}`))),
    ]);

    const rawHtml = htmlSettled.status === "fulfilled" ? htmlSettled.value : "";
    const rawMarkdownText =
      jinaSettled.status === "fulfilled" ? jinaSettled.value : "";
    let markdownText = cleanScrapedMarkdown(rawMarkdownText);

    // Jina surfaces upstream WAF blocks as scraped "Access Denied" text —
    // treat that as no content rather than feeding it to the model.
    if (markdownText.includes("Warning: Target URL returned error")) {
      console.warn("[Vendor Autofill] Jina scraped a target-site error page");
      markdownText = "";
    }

    if (!markdownText && !rawHtml) {
      const fallback = await extractVendorViaUrlContext(apiKey, vendorUrl);
      if (fallback) return fallback;
      return {
        success: false,
        error:
          "Could not read the vendor website (it may block automated access). Please fill the details manually.",
      };
    }

    const ogMeta = rawHtml ? extractOgMeta(rawHtml, vendorUrl) : {};
    const { logoCandidates, imageCandidates } =
      extractVendorImageCandidates(markdownText);

    console.log(`[Vendor Autofill] OG:`, ogMeta);
    console.log(
      `[Vendor Autofill] Logo candidates: ${logoCandidates.length}, Image candidates: ${imageCandidates.length}`,
    );

    const logoSourceLines = [
      ogMeta.schemaLogo
        ? `Schema.org logo (highest priority): ${cleanImageUrlSize(ogMeta.schemaLogo)}`
        : null,
      ogMeta.faviconUrl
        ? `Apple touch icon / favicon: ${cleanImageUrlSize(ogMeta.faviconUrl)}`
        : null,
      logoCandidates.length > 0
        ? `Logo URL candidates from page: ${JSON.stringify(logoCandidates)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const heroSourceLines = [
      ogMeta.ogImage
        ? `og:image (highest priority): ${cleanImageUrlSize(ogMeta.ogImage)}`
        : null,
      imageCandidates.length > 0
        ? `Hero image candidates from page: ${JSON.stringify(imageCandidates)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const optimizedMarkdown = markdownText.substring(
      0,
      SCRAPER_CONFIG.maxCharacters,
    );

    const prompt = `You are an expert business data extractor for an interior design CRM. Parse the vendor/supplier website content below and extract structured contact and brand information.

Page URL: ${vendorUrl}
og:site_name: ${ogMeta.ogSiteName ?? "not found"}
Meta description: ${ogMeta.ogDescription ?? "not found"}

Logo Sources (use in priority order listed):
${logoSourceLines || "none found"}

Hero Image Sources (use in priority order listed):
${heroSourceLines || "none found"}

Page Content (Markdown):
${optimizedMarkdown}

Extract the following and return as JSON:
- name: The company's official brand/trade name. Prefer og:site_name over page title.
- category: Match to ONE of these exact categories: ${VENDOR_CATEGORIES.join(", ")}. Leave empty if unsure.
- description: A clean 1–3 sentence company description or tagline. About the company, not a product.
- addressLine1: Street address line (number + street, or PO box) from footer, contact, or about section. Empty if not found.
- addressLine2: Secondary address line (suite, unit, floor, building) if present. Empty if not found.
- city: City / town / locality from the business address. Empty if not found.
- region: State, province, or region exactly as written on the page (e.g. "TX", "Ontario", "Lombardia"). Do NOT convert or assume a US state. Empty if not found.
- postalCode: Postal/ZIP code in whatever format appears (e.g. "12345", "SW1A 1AA", "75008"). Empty if not found.
- country: The country as an ISO 3166-1 alpha-2 code (e.g. "US", "CA", "GB", "IT"). Do NOT assume the United States — infer it from the address, domain, currency, language, or phone code. Empty only if genuinely indeterminable.
- formattedAddress: The full address as a single human-readable line. ALWAYS provide this whenever any address text is present, even if you cannot split it into the discrete fields above.
- repPhone: Primary business phone number. Empty if not found.
- repEmail: Primary business contact email (not newsletter/unsubscribe). Empty if not found.
- logoUrl: The single best logo URL from the Logo Sources above. Use priority order. Only absolute HTTPS URLs. Return empty string if nothing suitable.
- heroImageUrl: The single best brand/lifestyle image URL from Hero Image Sources above. Must be a product showcase or brand image — not a tracker pixel, ad banner, or UI element. Only absolute HTTPS URLs. Return empty string if nothing suitable.
- instagram: The company's official Instagram profile URL if found (e.g. "https://instagram.com/brandname"). Empty string if not found.
- pinterest: The company's official Pinterest profile URL if found (e.g. "https://pinterest.com/brandname"). Empty string if not found.
- facebook: The company's official Facebook page URL if found (e.g. "https://facebook.com/brandname"). Empty string if not found.
- youtube: The company's official YouTube channel URL if found (e.g. "https://youtube.com/c/brandname"). Empty string if not found.
- xTwitter: The company's official X / Twitter profile URL if found (e.g. "https://x.com/brandname"). Empty string if not found.
- confidence: Float 0.0–1.0 for each field. Use 0.95 for og:image or Schema.org logo, 0.75 for apple-touch-icon, lower for guessed candidates.

CRITICAL: Return 100% valid JSON only. Never return base64 data: URLs. Use empty string "" for fields not found.`;

    const requestBody = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: VENDOR_RESPONSE_SCHEMA,
      },
    });

    const { response: geminiRes, modelUsed } = await fetchGeminiWithFallback(
      apiKey,
      requestBody,
      AbortSignal.timeout(45000),
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("[Vendor Autofill] Gemini error:", errText);
      const { retryable, message } = classifyGeminiError(geminiRes.status);
      return {
        success: false,
        retryable,
        error: message ?? "AI model failed to extract vendor data.",
      };
    }

    const geminiJson = await geminiRes.json();
    void recordAiUsage(geminiJson?.usageMetadata);
    const parsedText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text as
      | string
      | undefined;
    if (!parsedText) {
      return { success: false, error: "AI returned an empty response." };
    }

    const extracted = parseGeminiJson(parsedText) as Record<string, unknown>;
    const conf = (extracted.confidence ?? {}) as Record<string, number>;

    // The model can't see the images, so it never picks the hero blindly:
    // whenever more than one candidate exists, leave heroImageUrl empty and
    // tell the client to open the picker so the user makes the final choice.
    // The logo stays the model's pick (logos are identifiable from URL/context).
    const pickerImageCandidates = [
      ...new Set(
        [extracted.heroImageUrl as string, ...imageCandidates].filter(Boolean),
      ),
    ];
    const showImagePicker = pickerImageCandidates.length > 1;

    const logoUrl = (extracted.logoUrl as string) || "";
    const heroImageUrl = showImagePicker
      ? ""
      : (extracted.heroImageUrl as string) || "";

    const rawReturnedData = {
      name: (extracted.name as string) || undefined,
      category: (extracted.category as string) || undefined,
      description: (extracted.description as string) || undefined,
      addressLine1: (extracted.addressLine1 as string) || undefined,
      addressLine2: (extracted.addressLine2 as string) || undefined,
      city: (extracted.city as string) || undefined,
      region: (extracted.region as string) || undefined,
      postalCode: (extracted.postalCode as string) || undefined,
      country: (extracted.country as string) || undefined,
      formattedAddress: (extracted.formattedAddress as string) || undefined,
      repPhone: (extracted.repPhone as string) || undefined,
      repEmail: (extracted.repEmail as string) || undefined,
      logoUrl: logoUrl || undefined,
      heroImageUrl: heroImageUrl || undefined,
      imageCandidates:
        pickerImageCandidates.length > 0 ? pickerImageCandidates : undefined,
      showImagePicker,
      confidence: conf,
      instagram: (extracted.instagram as string) || undefined,
      pinterest: (extracted.pinterest as string) || undefined,
      facebook: (extracted.facebook as string) || undefined,
      youtube: (extracted.youtube as string) || undefined,
      xTwitter: (extracted.xTwitter as string) || undefined,
    };

    const returnedData = sanitizeVendorData(rawReturnedData);

    // Save diagnostic run in Firestore background (non-blocking)
    void saveDiagnosticRun({
      type: "vendor",
      url: vendorUrl,
      scrapedMarkdown: markdownText,
      prompt: prompt || "",
      rawResponse: parsedText || "",
      parsedData: returnedData,
    });

    return {
      success: true,
      modelUsed,
      data: returnedData,
    };
  } catch (error: unknown) {
    console.error("[Vendor Autofill] Error:", error);
    if (error instanceof Error && error.name === "TimeoutError") {
      return {
        success: false,
        retryable: true,
        error:
          "Request timed out. The website may be slow or blocking scrapers.",
      };
    }
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.",
    };
  }
}

// ─── Shared Utilities ──────────────────────────────────────────────────────────

/**
 * Resilient, self-healing JSON parser that strips markdown wrappers,
 * escapes raw newlines/tabs inside JSON string properties, and
 * removes trailing commas to ensure successful parsing.
 */
function parseGeminiJson(rawText: string): unknown {
  let text = rawText.trim();

  // 1. Strip markdown code block wrapper if present
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  text = text.trim();

  try {
    return JSON.parse(text);
  } catch (firstError) {
    console.warn(
      "[AI Autofill] Initial JSON.parse failed. Attempting self-healing cleanup...",
      firstError,
    );

    try {
      // 2. Self-healing: Escape raw newlines, carriage returns, and tabs in string values
      let cleaned = text.replace(
        /"([^"\\]*(?:\\.[^"\\]*)*)"/g,
        (_match, p1) => {
          return `"${p1.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`;
        },
      );

      // 3. Self-healing: Remove trailing commas in arrays/objects which violate JSON standard
      cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");

      return JSON.parse(cleaned);
    } catch (secondError) {
      console.error(
        "[AI Autofill] Both JSON parsing attempts failed.",
        secondError,
      );
      throw new Error(
        "The AI returned formatted data that could not be parsed as clean JSON. Please try again.",
      );
    }
  }
}

/**
 * Resiliently strips cookie policies, GDPR consent banners, and massive list details
 * of third-party tracker cookies from Jina's scraped markdown, reducing context bloat
 * in the LLM query payload.
 */
function cleanScrapedMarkdown(text: string): string {
  let cleaned = text;

  // 1. Strip Pandectes/GDPR consent preferences block (e.g. Strictly necessary cookies -> Save preferences)
  cleaned = cleaned.replace(
    /(?:Strictly necessary cookies|We use cookies to optimize|This website uses cookies)[\s\S]*?(?:Save preferences|Powered by Pandectes|Manage consent preferences|Deny all Accept all)/gi,
    "",
  );

  // 2. Strip standard popup/banner cookie statements (e.g. This website uses cookies -> Decline/Accept/Preferences)
  cleaned = cleaned.replace(
    /This website uses cookies to improve[\s\S]*?(?:Accept|Decline|Preferences|Close|Save settings)/gi,
    "",
  );

  // 3. Clean up loose bulleted cookie details tables (Name, Provider, Domain, Path, Retention, Purpose)
  cleaned = cleaned.replace(
    /\*\s+Name\s+[a-zA-Z0-9_*.-]+\s+Provider[\s\S]*?(?=\n\n|\n[^\s*]|$)/gi,
    "",
  );

  // 4. Clean up any left-over consent button/decline list details
  cleaned = cleaned.replace(
    /(?:Preferences Decline Accept|Manage consent preferences|Deny all Accept all)/gi,
    "",
  );

  // 5. Remove consecutive empty line spaces left behind by stripped chunks
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

/**
 * Helper function to detect and strip out model reasoning, debates,
 * or conversational text mistakenly placed in structured fields,
 * and truncate them to a reasonable length.
 */
function sanitizeField(
  value: unknown,
  maxLength = 80,
  fieldName = "",
  allowParagraphs = false,
): string {
  if (value === undefined || value === null) return "";
  const str = String(value).trim();
  if (str === "") return "";

  const lower = str.toLowerCase();

  // Detect reasoning/explanation text
  const isReasoning =
    str.length > 40 &&
    str.includes(" ") &&
    (lower.includes("not specified") ||
      lower.includes("not found") ||
      lower.includes("could not be") ||
      lower.includes("omitted") ||
      lower.includes("empty string") ||
      lower.includes("per instructions") ||
      lower.includes("schema") ||
      lower.includes("unable to") ||
      lower.includes("not present") ||
      lower.includes("no explicit") ||
      lower.includes("instead of") ||
      lower.includes("safe to") ||
      lower.includes("decided to") ||
      lower.includes("re-evaluating") ||
      lower.includes("re-reading") ||
      (!allowParagraphs &&
        lower.includes("is") &&
        lower.includes("the") &&
        lower.includes("to") &&
        str.split(/\s+/).length > 8));

  if (isReasoning || str.length > maxLength) {
    console.warn(
      `[AI Sanitizer] Stripped conversational text for field '${fieldName}': "${str.substring(0, 60)}..."`,
    );
    if (fieldName === "name") {
      return "Unnamed Product";
    }
    return "";
  }

  return str;
}

function sanitizeProductData(
  data: unknown,
): NonNullable<AutofillResult["data"]> {
  if (!data || typeof data !== "object") return { name: "Unnamed Product" };
  const product = data as Record<string, unknown>;

  const name = sanitizeField(product.name, 150, "name");
  const sku = sanitizeField(product.sku, 50, "sku");
  const category = sanitizeField(product.category, 50, "category");
  const description = sanitizeField(
    product.description,
    1000,
    "description",
    true,
  );
  const finishColor = sanitizeField(product.finishColor, 80, "finishColor");
  const manufacturer = sanitizeField(product.manufacturer, 100, "manufacturer");
  const materials = sanitizeField(product.materials, 150, "materials");
  const dimensions = sanitizeField(product.dimensions, 100, "dimensions");

  return {
    ...product,
    name: name || "Unnamed Product",
    sku,
    category,
    description,
    finishColor,
    manufacturer,
    materials,
    dimensions,
  };
}

function sanitizeVendorData(
  data: unknown,
): NonNullable<VendorAutofillResult["data"]> {
  if (!data || typeof data !== "object") return {};
  const vendor = data as Record<string, unknown>;

  const name = sanitizeField(vendor.name, 150, "name");
  const category = sanitizeField(vendor.category, 50, "category");
  const description = sanitizeField(
    vendor.description,
    1000,
    "description",
    true,
  );
  const addressLine1 = sanitizeField(vendor.addressLine1, 150, "addressLine1");
  const addressLine2 = sanitizeField(vendor.addressLine2, 100, "addressLine2");
  const city = sanitizeField(vendor.city, 80, "city");
  const region = sanitizeField(vendor.region, 60, "region");
  const postalCode = sanitizeField(vendor.postalCode, 20, "postalCode");
  const country = sanitizeField(vendor.country, 60, "country");
  const formattedAddress = sanitizeField(
    vendor.formattedAddress,
    250,
    "formattedAddress",
  );
  const repPhone = sanitizeField(vendor.repPhone, 40, "repPhone");
  const repEmail = sanitizeField(vendor.repEmail, 80, "repEmail");
  const logoUrl = sanitizeField(vendor.logoUrl, 1000, "logoUrl", true);
  const heroImageUrl = sanitizeField(
    vendor.heroImageUrl,
    1000,
    "heroImageUrl",
    true,
  );
  const instagram = sanitizeField(vendor.instagram, 500, "instagram", true);
  const pinterest = sanitizeField(vendor.pinterest, 500, "pinterest", true);
  const facebook = sanitizeField(vendor.facebook, 500, "facebook", true);
  const youtube = sanitizeField(vendor.youtube, 500, "youtube", true);
  const xTwitter = sanitizeField(vendor.xTwitter, 500, "xTwitter", true);

  return {
    ...vendor,
    name: name || "Unnamed Vendor",
    category,
    description,
    addressLine1,
    addressLine2,
    city,
    region,
    postalCode,
    country,
    formattedAddress,
    repPhone,
    repEmail,
    logoUrl,
    heroImageUrl,
    instagram,
    pinterest,
    facebook,
    youtube,
    xTwitter,
  };
}
