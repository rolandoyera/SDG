"use server";

import { cookies } from "next/headers";

import * as cheerio from "cheerio";

import { ACTIVE_ORG_COOKIE } from "@/lib/org-cookie";

import { getAdminDb } from "./firebase-admin";
import {
  getActiveOrgCompanyName,
  getActiveOrgSeoCompetitors,
  getActiveOrgWebsite,
} from "./org-config";
import { SEO_STOP_WORDS } from "./seo-stop-words";

// ---------------------------------------------------------------------------
// Keyword/phrase analyzer modeled on SEOBook's keyword-density tool so our
// numbers stay directly comparable to that reference: densities are
// count × phrase-length ÷ scope word total (stop words excluded from the
// total), phrases never contain stop words, words shorter than 2 chars are
// dropped, and tables list phrases occurring at least twice.
// ---------------------------------------------------------------------------

export type SiteTarget = "live" | "local";

const LOCAL_BASE_URL = "http://localhost:3000";

/**
 * The live target comes from the active org's Company settings (Website
 * field) — no hardcoded domain, so the tool works per tenant.
 */
async function resolveBaseUrl(target: SiteTarget): Promise<string> {
  if (target === "local") return LOCAL_BASE_URL;
  const website = await getActiveOrgWebsite();
  if (!website) {
    throw new Error(
      "No company website configured — set the Website field on the Company page.",
    );
  }
  const withProtocol = /^https?:\/\//i.test(website)
    ? website
    : `https://${website}`;
  return new URL(withProtocol).origin;
}

const FETCH_TIMEOUT_MS = 15_000;
const CRAWL_CONCURRENCY = 8;
const PAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const MIN_OCCURRENCES = 2;
const TABLE_LIMIT = 15;
// Paragraph-reuse detection compares runs of this many consecutive words.
const SHINGLE_SIZE = 8;
// Page cap for the no-sitemap fallback (link-following discovery).
const MAX_SPIDER_PAGES = 60;

export interface SeoResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PhraseRow {
  phrase: string;
  count: number;
  /** Fraction of the scope's word total (already × phrase length). */
  density: number;
}

export interface ScopeReport {
  /** Word count excluding stop words (the density base). */
  words: number;
  wordsWithStop: number;
  unique: number;
  uniqueWithStop: number;
  one: PhraseRow[];
  two: PhraseRow[];
  three: PhraseRow[];
}

export interface PageLink {
  href: string;
  text: string;
  internal: boolean;
}

export interface PageAnalysis {
  url: string;
  path: string;
  fetchedAt: number;
  title: string;
  metaDescription: string;
  h1s: string[];
  h2s: string[];
  imageCount: number;
  missingAltCount: number;
  missingAltSrcs: string[];
  linkCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  links: PageLink[];
  scopes: {
    all: ScopeReport;
    body: ScopeReport;
    headlines: ScopeReport;
    links: ScopeReport;
    images: ScopeReport;
  };
}

export interface DuplicatePhraseFinding {
  pageA: string;
  pageB: string;
  /** Number of shared 8-word runs between the two pages' main content. */
  count: number;
  sample: string;
}

export interface AnchorReuseFinding {
  target: string;
  anchors: {
    text: string;
    sources: string[];
  }[];
}

export interface CrawlError {
  path: string;
  error: string;
}

export interface SiteCrawl {
  target: SiteTarget;
  baseUrl: string;
  fetchedAt: number;
  /** How pages were found: the sitemap, or link-following when none exists. */
  discovery: "sitemap" | "links";
  pages: PageAnalysis[];
  errors: CrawlError[];
  duplicatePhrases: DuplicatePhraseFinding[];
  anchorReuse: AnchorReuseFinding[];
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/** Minimal structural view of htmlparser2's DOM nodes. */
interface DomNode {
  type: string;
  data?: string;
  name?: string;
  children?: DomNode[];
}

const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "template",
  "iframe",
]);

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);

/**
 * Walks the DOM emitting one string per block-level run of text. Inline
 * element boundaries contribute a space so adjacent anchors never run
 * together ("design group" + "design architecture" ≠ "groupdesign"), while
 * phrases still flow across inline markup within a block. Phrases are later
 * counted within a segment only, never across segments.
 */
function extractSegments(nodes: DomNode[]): string[] {
  const segments: string[] = [];
  let current = "";

  const flush = () => {
    const text = current.replace(/\s+/g, " ").trim();
    if (text) segments.push(text);
    current = "";
  };

  const visit = (node: DomNode) => {
    if (node.type === "text") {
      current += ` ${node.data ?? ""} `;
      return;
    }
    const name = node.name;
    if (!name || SKIP_TAGS.has(name)) return;
    const isBlock = BLOCK_TAGS.has(name);
    if (isBlock) flush();
    current += " ";
    for (const child of node.children ?? []) visit(child);
    current += " ";
    if (isBlock) flush();
  };

  for (const node of nodes) visit(node);
  flush();
  return segments;
}

function elementSegments($: cheerio.CheerioAPI, selector: string): string[] {
  return $(selector)
    .toArray()
    .flatMap((el) => extractSegments([el as unknown as DomNode]));
}

function elementText(el: unknown): string {
  return extractSegments([el as DomNode]).join(" ");
}

// ---------------------------------------------------------------------------
// Tokenizing + phrase tables
// ---------------------------------------------------------------------------

function tokenize(segment: string): string[] {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, " ")
    .split(" ")
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter((word) => word.length >= 2);
}

function buildScopeReport(segments: string[]): ScopeReport {
  const tokenSegments = segments.map(tokenize);
  const allTokens = tokenSegments.flat();
  const nonStop = allTokens.filter((word) => !SEO_STOP_WORDS.has(word));
  const words = nonStop.length;

  const tableFor = (size: number): PhraseRow[] => {
    const counts = new Map<string, number>();
    for (const tokens of tokenSegments) {
      for (let i = 0; i + size <= tokens.length; i++) {
        const slice = tokens.slice(i, i + size);
        if (slice.some((word) => SEO_STOP_WORDS.has(word))) continue;
        const phrase = slice.join(" ");
        counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, count]) => count >= MIN_OCCURRENCES)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TABLE_LIMIT)
      .map(([phrase, count]) => ({
        phrase,
        count,
        density: words > 0 ? (count * size) / words : 0,
      }));
  };

  return {
    words,
    wordsWithStop: allTokens.length,
    unique: new Set(nonStop).size,
    uniqueWithStop: new Set(allTokens).size,
    one: tableFor(1),
    two: tableFor(2),
    three: tableFor(3),
  };
}

// ---------------------------------------------------------------------------
// Page analysis
// ---------------------------------------------------------------------------

function normalizeHost(host: string): string {
  return host.replace(/^www\./, "");
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: { "user-agent": "LenisStudio-SEO/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return await response.text();
}

function analyzeHtml(url: string, html: string): PageAnalysis {
  const pageUrl = new URL(url);
  const $ = cheerio.load(html);

  const title = $("head title").first().text().trim();
  const metaDescription = (
    $('meta[name="description"]').attr("content") ?? ""
  ).trim();

  const h1s = $("body h1")
    .toArray()
    .map((el) => elementText(el));
  const h2s = $("body h2")
    .toArray()
    .map((el) => elementText(el));

  // Link inventory (http/https + relative hrefs only).
  const links: PageLink[] = [];
  for (const el of $("body a[href]").toArray()) {
    const href = $(el).attr("href") ?? "";
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      continue;
    }
    links.push({
      href: resolved.href,
      text: elementText(el),
      internal: normalizeHost(resolved.host) === normalizeHost(pageUrl.host),
    });
  }

  const images = $("body img").toArray();
  const missingAltSrcs = images
    .filter((el) => !($(el).attr("alt") ?? "").trim())
    .map((el) => $(el).attr("src") ?? "(no src)");

  // Scope texts. "All text" mirrors the reference tool's defaults: visible
  // page text plus the title and meta description.
  const bodyNodes = $("body").toArray() as unknown as DomNode[];
  const allSegments = [title, metaDescription, ...extractSegments(bodyNodes)];
  const headlineSegments = elementSegments(
    $,
    "body h1, body h2, body h3, body h4, body h5, body h6",
  );
  const linkSegments = links.map((link) => link.text);
  const imageSegments = images
    .map((el) => ($(el).attr("alt") ?? "").trim())
    .filter(Boolean);

  // Body text = visible text minus headlines and anchor text.
  const $body = cheerio.load(html);
  $body("h1, h2, h3, h4, h5, h6, a").remove();
  const bodySegments = extractSegments(
    $body("body").toArray() as unknown as DomNode[],
  );

  return {
    url: pageUrl.href,
    path: pageUrl.pathname,
    fetchedAt: Date.now(),
    title,
    metaDescription,
    h1s,
    h2s,
    imageCount: images.length,
    missingAltCount: missingAltSrcs.length,
    missingAltSrcs: missingAltSrcs.slice(0, 20),
    linkCount: links.length,
    internalLinkCount: links.filter((link) => link.internal).length,
    externalLinkCount: links.filter((link) => !link.internal).length,
    links,
    scopes: {
      all: buildScopeReport(allSegments),
      body: buildScopeReport(bodySegments),
      headlines: buildScopeReport(headlineSegments),
      links: buildScopeReport(linkSegments),
      images: buildScopeReport(imageSegments),
    },
  };
}

// Main-content view (page chrome stripped) used only by the site-wide checks,
// so shared nav/header/footer don't flag every page pair as duplicated.
function mainContentView(
  url: string,
  html: string,
): {
  segments: string[];
  internalLinks: PageLink[];
} {
  const pageUrl = new URL(url);
  const $ = cheerio.load(html);
  $("header, footer, nav, aside").remove();

  const internalLinks: PageLink[] = [];
  for (const el of $("body a[href]").toArray()) {
    const href = $(el).attr("href") ?? "";
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (normalizeHost(resolved.host) !== normalizeHost(pageUrl.host)) continue;
    if (resolved.pathname === pageUrl.pathname) continue;
    internalLinks.push({
      href: resolved.pathname,
      text: elementText(el),
      internal: true,
    });
  }

  return {
    segments: extractSegments($("body").toArray() as unknown as DomNode[]),
    internalLinks,
  };
}

// ---------------------------------------------------------------------------
// Caches (in-memory, per server instance — a restart just means re-running)
// ---------------------------------------------------------------------------

const pageCache = new Map<string, PageAnalysis>();
const crawlCache = new Map<SiteTarget, SiteCrawl>();

// The cache exists to serve leave-and-return restores; an explicit Analyze
// passes fresh=true to refetch (and update the cache for the next restore).
async function analyzeWithCache(
  url: string,
  fresh: boolean,
): Promise<PageAnalysis> {
  if (!fresh) {
    const cached = pageCache.get(url);
    if (cached && Date.now() - cached.fetchedAt < PAGE_CACHE_TTL_MS) {
      return cached;
    }
  }
  const analysis = analyzeHtml(url, await fetchHtml(url));
  pageCache.set(url, analysis);
  return analysis;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

async function readSitemapPaths(baseUrl: string): Promise<string[]> {
  const origin = new URL(baseUrl);

  const readLocs = async (url: string): Promise<string[]> => {
    const xml = await fetchHtml(url);
    const $ = cheerio.load(xml, { xmlMode: true });
    if ($("sitemapindex").length > 0) {
      const children = $("sitemap > loc")
        .toArray()
        .map((el) => $(el).text().trim());
      const nested = await Promise.all(children.map(readLocs));
      return nested.flat();
    }
    return $("url > loc")
      .toArray()
      .map((el) => $(el).text().trim());
  };

  const locs = await readLocs(`${baseUrl}/sitemap.xml`);
  const paths = locs
    .filter(Boolean)
    .map((loc) => new URL(loc))
    .filter((url) => normalizeHost(url.host) === normalizeHost(origin.host))
    .map((url) => url.pathname);
  return [...new Set(paths)].sort();
}

// ---------------------------------------------------------------------------
// Site-wide checks
// ---------------------------------------------------------------------------

function findDuplicatePhrases(
  contentByPath: Map<string, string[]>,
): DuplicatePhraseFinding[] {
  // Shingles keep stop words: paragraph reuse is about literal copy, not
  // keyword density.
  const shinglesByPath = new Map<string, Set<string>>();
  for (const [path, segments] of contentByPath) {
    const shingles = new Set<string>();
    for (const segment of segments) {
      const tokens = tokenize(segment);
      for (let i = 0; i + SHINGLE_SIZE <= tokens.length; i++) {
        shingles.add(tokens.slice(i, i + SHINGLE_SIZE).join(" "));
      }
    }
    shinglesByPath.set(path, shingles);
  }

  const paths = [...shinglesByPath.keys()];
  const findings: DuplicatePhraseFinding[] = [];
  for (let a = 0; a < paths.length; a++) {
    for (let b = a + 1; b < paths.length; b++) {
      const setA = shinglesByPath.get(paths[a]);
      const setB = shinglesByPath.get(paths[b]);
      if (!setA || !setB) continue;
      let count = 0;
      let sample = "";
      for (const shingle of setA) {
        if (setB.has(shingle)) {
          count++;
          if (!sample) sample = shingle;
        }
      }
      if (count > 0) {
        findings.push({ pageA: paths[a], pageB: paths[b], count, sample });
      }
    }
  }
  return findings.sort((a, b) => b.count - a.count).slice(0, 20);
}

function findAnchorReuse(
  linksBySource: Map<string, PageLink[]>,
): AnchorReuseFinding[] {
  // target path → anchor text → source paths that use it
  const byTarget = new Map<string, Map<string, Set<string>>>();
  for (const [source, links] of linksBySource) {
    for (const link of links) {
      const text = link.text.toLowerCase().replace(/\s+/g, " ").trim();
      if (!text) continue;
      const anchors = byTarget.get(link.href) ?? new Map<string, Set<string>>();
      const sources = anchors.get(text) ?? new Set<string>();
      sources.add(source);
      anchors.set(text, sources);
      byTarget.set(link.href, anchors);
    }
  }

  const findings: AnchorReuseFinding[] = [];
  for (const [target, anchors] of byTarget) {
    const reused = [...anchors.entries()]
      .filter(([, sources]) => sources.size >= 2)
      .sort((a, b) => b[1].size - a[1].size)
      .map(([text, sources]) => ({ text, sources: [...sources].sort() }));
    if (reused.length > 0) {
      findings.push({ target, anchors: reused });
    }
  }
  return findings
    .sort(
      (a, b) =>
        (b.anchors[0]?.sources.length ?? 0) -
        (a.anchors[0]?.sources.length ?? 0),
    )
    .slice(0, 20);
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

/** Sitemap paths for the own-site page picker. */
export async function fetchSitemapPages(
  target: SiteTarget,
): Promise<SeoResult<string[]>> {
  try {
    const baseUrl = await resolveBaseUrl(target);
    return { success: true, data: await readSitemapPaths(baseUrl) };
  } catch (error) {
    console.error("fetchSitemapPages failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Could not load the sitemap."),
    };
  }
}

/** Analyze one page of the own site by path. */
export async function analyzeSitePage(
  target: SiteTarget,
  path: string,
  fresh = false,
): Promise<SeoResult<PageAnalysis>> {
  try {
    const baseUrl = await resolveBaseUrl(target);
    const url = new URL(path, baseUrl).href;
    return { success: true, data: await analyzeWithCache(url, fresh) };
  } catch (error) {
    console.error("analyzeSitePage failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Could not analyze the page."),
    };
  }
}

/** Analyze an arbitrary (competitor) URL. */
export async function analyzeExternalUrl(
  rawUrl: string,
  fresh = false,
): Promise<SeoResult<PageAnalysis>> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return { success: false, error: "Enter a valid URL." };
  }
  try {
    return { success: true, data: await analyzeWithCache(url.href, fresh) };
  } catch (error) {
    console.error("analyzeExternalUrl failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Could not analyze the URL."),
    };
  }
}

/** Last crawl for the target, if this server instance has one. */
export async function fetchCachedCrawl(
  target: SiteTarget,
): Promise<SeoResult<SiteCrawl | null>> {
  return { success: true, data: crawlCache.get(target) ?? null };
}

// Paths the link-following fallback should not treat as pages.
const ASSET_PATH_RE =
  /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|mp4|webm|xml|txt|css|js)$/i;

function normalizeSpiderPath(href: string): string | null {
  let path: string;
  try {
    path = new URL(href).pathname;
  } catch {
    return null;
  }
  if (ASSET_PATH_RE.test(path)) return null;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

/** Crawl the whole site and run the site-wide checks. Takes ~20–40s. */
export async function runSiteCrawl(
  target: SiteTarget,
): Promise<SeoResult<SiteCrawl>> {
  try {
    const baseUrl = await resolveBaseUrl(target);
    const errors: CrawlError[] = [];
    const contentByPath = new Map<string, string[]>();
    const linksBySource = new Map<string, PageLink[]>();
    const pagesByPath = new Map<string, PageAnalysis>();

    const crawlPage = async (path: string): Promise<PageAnalysis | null> => {
      try {
        const url = new URL(path, baseUrl).href;
        const html = await fetchHtml(url);
        const analysis = analyzeHtml(url, html);
        pageCache.set(url, analysis);
        const content = mainContentView(url, html);
        contentByPath.set(path, content.segments);
        linksBySource.set(path, content.internalLinks);
        pagesByPath.set(path, analysis);
        return analysis;
      } catch (error) {
        errors.push({ path, error: getErrorMessage(error, "Fetch failed.") });
        return null;
      }
    };

    let sitemapPaths: string[] = [];
    try {
      sitemapPaths = await readSitemapPaths(baseUrl);
    } catch {
      // Escape hatch below: crawl by following links instead.
    }

    let discovery: SiteCrawl["discovery"];
    if (sitemapPaths.length > 0) {
      discovery = "sitemap";
      await mapLimit(sitemapPaths, CRAWL_CONCURRENCY, crawlPage);
    } else {
      // No (usable) sitemap — breadth-first discovery from the homepage,
      // following same-origin links up to MAX_SPIDER_PAGES.
      discovery = "links";
      const seen = new Set<string>(["/"]);
      const queue: string[] = ["/"];
      while (queue.length > 0) {
        const batch = queue.splice(0, CRAWL_CONCURRENCY);
        const results = await Promise.all(batch.map(crawlPage));
        for (const analysis of results) {
          if (!analysis) continue;
          for (const link of analysis.links) {
            if (!link.internal || seen.size >= MAX_SPIDER_PAGES) continue;
            const path = normalizeSpiderPath(link.href);
            if (!path || seen.has(path)) continue;
            seen.add(path);
            queue.push(path);
          }
        }
      }
    }

    const crawl: SiteCrawl = {
      target,
      baseUrl,
      fetchedAt: Date.now(),
      discovery,
      pages: [...pagesByPath.values()],
      errors,
      duplicatePhrases: findDuplicatePhrases(contentByPath),
      anchorReuse: findAnchorReuse(linksBySource),
    };
    crawlCache.set(target, crawl);
    return { success: true, data: crawl };
  } catch (error) {
    console.error("runSiteCrawl failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "The crawl failed."),
    };
  }
}

// ---------------------------------------------------------------------------
// Competitors (saved on the org document — config data, not cache)
// ---------------------------------------------------------------------------

export interface SeoCompetitor {
  name: string;
  url: string;
}

const MAX_COMPETITORS = 5;

/** The org's saved competitor list for the Competitor Analysis page. */
export async function fetchCompetitors(): Promise<SeoResult<SeoCompetitor[]>> {
  try {
    return { success: true, data: await getActiveOrgSeoCompetitors() };
  } catch (error) {
    console.error("fetchCompetitors failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Could not load competitors."),
    };
  }
}

/**
 * Replace the org's competitor list (max 5). URLs are normalized to their
 * origin so the Keyword Analyzer can compose page paths against them.
 */
export async function saveCompetitors(
  competitors: SeoCompetitor[],
): Promise<SeoResult<SeoCompetitor[]>> {
  const cookieStore = await cookies();
  const organizationId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  if (!organizationId) {
    return { success: false, error: "No active organization." };
  }
  if (competitors.length > MAX_COMPETITORS) {
    return {
      success: false,
      error: `Up to ${MAX_COMPETITORS} competitors are supported.`,
    };
  }

  const cleaned: SeoCompetitor[] = [];
  for (const entry of competitors) {
    const name = entry.name.trim();
    const raw = entry.url.trim();
    if (!name || !raw) {
      return {
        success: false,
        error: "Every competitor needs a name and URL.",
      };
    }
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      cleaned.push({ name, url: url.origin });
    } catch {
      return { success: false, error: `"${raw}" is not a valid URL.` };
    }
  }

  try {
    await getAdminDb()
      .doc(`organizations/${organizationId}`)
      .set({ seo: { competitors: cleaned } }, { merge: true });
    return { success: true, data: cleaned };
  } catch (error) {
    console.error("saveCompetitors failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Could not save competitors."),
    };
  }
}

/** Sitemap paths for an arbitrary site (competitor page pickers). */
export async function fetchSitemapForUrl(
  rawUrl: string,
): Promise<SeoResult<string[]>> {
  let origin: string;
  try {
    origin = new URL(
      /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`,
    ).origin;
  } catch {
    return { success: false, error: "Enter a valid URL." };
  }
  try {
    return { success: true, data: await readSitemapPaths(origin) };
  } catch (error) {
    console.error("fetchSitemapForUrl failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Could not load the sitemap."),
    };
  }
}

/** Company display name for labeling the own-site source in the UI. */
export async function fetchCompanyName(): Promise<SeoResult<string | null>> {
  try {
    return { success: true, data: await getActiveOrgCompanyName() };
  } catch (error) {
    console.error("fetchCompanyName failed:", error);
    return { success: false, error: "Could not load the company name." };
  }
}

/** The live site's origin, for client-side "Visit Page" links. */
export async function fetchLiveBaseUrl(): Promise<SeoResult<string | null>> {
  try {
    return { success: true, data: await resolveBaseUrl("live") };
  } catch {
    // No website configured — the client just disables live visit links.
    return { success: true, data: null };
  }
}
