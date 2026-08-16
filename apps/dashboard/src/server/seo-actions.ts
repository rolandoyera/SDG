"use server";

import * as cheerio from "cheerio";

import { getActiveOrgId } from "./auth";
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

/** `comp:<index>` into the org's saved competitor list — same keys the Compare tab's source dropdowns use. */
export type SiteTarget = "live" | "local" | `comp:${number}`;

const LOCAL_BASE_URL = "http://localhost:3000";
const COMPETITOR_TARGET_RE = /^comp:(\d+)$/;

/**
 * The live target comes from the active org's Company settings (Website
 * field) — no hardcoded domain, so the tool works per tenant. Competitor
 * targets resolve against the org's saved list rather than a URL the client
 * passes in, so the crawler can only ever be aimed at sites the org configured.
 */
async function resolveBaseUrl(target: SiteTarget): Promise<string> {
  if (target === "local") return LOCAL_BASE_URL;
  const competitor = COMPETITOR_TARGET_RE.exec(target);
  if (competitor) {
    const saved = await getActiveOrgSeoCompetitors();
    const url = saved[Number(competitor[1])]?.url;
    if (!url) throw new Error("That competitor is no longer saved.");
    return url;
  }
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
// A passage carried by at least this share of crawled pages is site furniture
// (testimonial blocks, CTA sections) rather than page-level copying, so it is
// reported separately instead of flagging every page pair. The floor of 3 pages
// matters because with two pages "on every page" and "copied once" are the same
// observation.
const BOILERPLATE_PAGE_SHARE = 0.3;
const BOILERPLATE_MIN_PAGES = 3;
// Under this many shared words a match is stock phrasing colliding, not reuse.
const MIN_DUPLICATE_WORDS = 16;
// Page cap for the no-sitemap fallback (link-following discovery).
const MAX_SPIDER_PAGES = 60;
// Page cap for sitemap discovery, sized to cover a mid-size competitor whole
// (a partial crawl can't answer the orphan question at all). Not unlimited:
// the crawl is one server action with no partial result, so overrunning the
// function budget returns nothing rather than most of the site — and sustained
// concurrency against a site we don't own is what gets a crawler blocked.
// Raising this means checking `maxDuration` on the keyword-analyzer page.
const MAX_CRAWL_PAGES = 250;

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

export interface PageHeading {
  tag: string;
  text: string;
}

export interface PageAnalysis {
  url: string;
  path: string;
  fetchedAt: number;
  title: string;
  metaDescription: string;
  h1s: string[];
  h2s: string[];
  /** Every body heading in document order. */
  headings: PageHeading[];
  imageCount: number;
  missingAltCount: number;
  missingAltSrcs: string[];
  linkCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  links: PageLink[];
  /** Links outside page chrome (header/footer/nav/aside), document order. */
  bodyLinks: PageLink[];
  scopes: {
    all: ScopeReport;
    body: ScopeReport;
    headlines: ScopeReport;
    links: ScopeReport;
    images: ScopeReport;
  };
}

/** One contiguous stretch of identical wording. */
export interface DuplicatePassage {
  words: number;
  text: string;
}

export interface DuplicatePhraseFinding {
  pageA: string;
  pageB: string;
  /** Total words the two pages share, site-wide blocks excluded. */
  sharedWords: number;
  /** How many separate passages those words are spread across. */
  passageCount: number;
  /** The longest few passages, longest first, as evidence. */
  passages: DuplicatePassage[];
  /** sharedWords as a fraction of each page's own main-content word count. */
  ratioA: number;
  ratioB: number;
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

/** A sitemap entry that didn't serve itself — Search Console's "Page with redirect". */
export interface CrawlRedirect {
  path: string;
  /** Where it lands: a path on this site, or an absolute URL when it leaves. */
  to: string;
}

export interface SiteCrawl {
  target: SiteTarget;
  baseUrl: string;
  fetchedAt: number;
  /** How pages were found: the sitemap, or link-following when none exists. */
  discovery: "sitemap" | "links";
  pages: PageAnalysis[];
  errors: CrawlError[];
  redirects: CrawlRedirect[];
  /**
   * Crawled path → how many other crawled pages link to it. 0 reads as an
   * orphan — reachable from the sitemap but from nowhere on the site — but
   * only on a complete sitemap crawl. A link-discovered crawl can't contain
   * orphans at all (links are how it found every page), and if `skipped` is
   * non-zero the link that would have saved a page may simply live on one of
   * the pages the cap dropped.
   */
  inboundLinks: Record<string, number>;
  /** Sitemap pages left uncrawled at the MAX_CRAWL_PAGES cap — 0 for a full crawl. */
  skipped: number;
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
  attribs?: Record<string, string>;
  children?: DomNode[];
  parent?: DomNode | null;
}

const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "template",
  "iframe",
]);

// Text hidden from everyone shouldn't count toward keyword density (e.g.
// WordPress themes emit raw microformat timestamps in display:none spans).
// Screen-reader classes (sr-only etc.) deliberately stay countable: that text
// is read to assistive-tech users and Google weights it as real content.
const HIDDEN_CLASSES = new Set(["rich-snippet-hidden"]);

// Tailwind visibility utilities are decoded for the mobile viewport Google's
// mobile-first indexing renders: a bare `hidden`/`invisible` (or a `max-*:`
// variant, which applies *below* its breakpoint) hides the element on a
// phone, while `sm:`…`2xl:`-prefixed ones only hide it on wider screens. So
// `hidden lg:block` (desktop-only) is excluded and `lg:hidden` (mobile-only)
// counts — responsive desktop/mobile twins count once instead of twice.
function isHiddenClass(cls: string): boolean {
  if (HIDDEN_CLASSES.has(cls.toLowerCase())) return true;
  return /^(max-[^:]+:)?(hidden|invisible)$/.test(cls);
}

function isHiddenElement(node: DomNode): boolean {
  const attribs = node.attribs ?? {};
  if ("hidden" in attribs) return true;
  if (attribs["aria-hidden"] === "true") return true;
  if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attribs.style ?? "")) {
    return true;
  }
  return (attribs.class ?? "").split(/\s+/).some(isHiddenClass);
}

// For elements picked via selectors: extractSegments never descends into a
// hidden subtree, but a selector jumps straight to the element, so its
// hidden ancestors must be checked explicitly.
function isHiddenTree(node: DomNode): boolean {
  for (let cur: DomNode | null | undefined = node; cur; cur = cur.parent) {
    if (isHiddenElement(cur)) return true;
  }
  return false;
}

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
    if (!name || SKIP_TAGS.has(name) || isHiddenElement(node)) return;
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
    .filter((el) => !isHiddenTree(el as unknown as DomNode))
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

/**
 * `finalUrl` is where the request actually landed — redirects are followed, so
 * it differs from `url` whenever the page moved. The crawl needs it to file a
 * page under the path the site really serves.
 */
async function fetchHtml(
  url: string,
): Promise<{ html: string; finalUrl: string }> {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: { "user-agent": "LenisStudio-SEO/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return { html: await response.text(), finalUrl: response.url || url };
}

function analyzeHtml(url: string, html: string): PageAnalysis {
  const pageUrl = new URL(url);
  const $ = cheerio.load(html);

  const title = $("head title").first().text().trim();
  const metaDescription = (
    $('meta[name="description"]').attr("content") ?? ""
  ).trim();

  const headings: PageHeading[] = $(
    "body h1, body h2, body h3, body h4, body h5, body h6",
  )
    .toArray()
    .filter((el) => !isHiddenTree(el as unknown as DomNode))
    .map((el) => ({ tag: el.tagName.toUpperCase(), text: elementText(el) }));
  const h1s = headings
    .filter((heading) => heading.tag === "H1")
    .map((heading) => heading.text);
  const h2s = headings
    .filter((heading) => heading.tag === "H2")
    .map((heading) => heading.text);

  // Link inventory (http/https + relative hrefs only). The full inventory
  // stays unfiltered because spider discovery follows it (menus hidden until
  // JS opens them still lead to real pages); counts, the links scope, and
  // the listing use only mobile-visible links.
  const links: PageLink[] = [];
  const visibleLinks: PageLink[] = [];
  const bodyLinks: PageLink[] = [];
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
    const link: PageLink = {
      href: resolved.href,
      text: elementText(el),
      internal: normalizeHost(resolved.host) === normalizeHost(pageUrl.host),
    };
    links.push(link);
    if (isHiddenTree(el as unknown as DomNode)) continue;
    visibleLinks.push(link);
    if ($(el).parents("header, footer, nav, aside").length === 0) {
      bodyLinks.push(link);
    }
  }

  const images = $("body img")
    .toArray()
    .filter((el) => !isHiddenTree(el as unknown as DomNode));
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
  const linkSegments = visibleLinks.map((link) => link.text);
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
    headings,
    imageCount: images.length,
    missingAltCount: missingAltSrcs.length,
    missingAltSrcs: missingAltSrcs.slice(0, 20),
    linkCount: visibleLinks.length,
    internalLinkCount: visibleLinks.filter((link) => link.internal).length,
    externalLinkCount: visibleLinks.filter((link) => !link.internal).length,
    links,
    bodyLinks,
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
//
// `aside` is deliberately NOT stripped: it is a layout column at least as often
// as a sidebar (oshrat project pages put the entire write-up in one), and a
// sidebar that really does repeat is caught by the boilerplate frequency filter
// on its own merits.
//
// `data-dup-ignore` opts a block out by hand for sites we control. It applies
// here only — the keyword tables in analyzeHtml keep counting testimonials and
// CTAs, because Google indexes them and density has to match what Google sees.
function mainContentView(
  url: string,
  html: string,
): {
  segments: string[];
  internalLinks: PageLink[];
} {
  const pageUrl = new URL(url);
  const $ = cheerio.load(html);
  $("header, footer, nav, [data-dup-ignore]").remove();

  const internalLinks: PageLink[] = [];
  for (const el of $("body a[href]").toArray()) {
    if (isHiddenTree(el as unknown as DomNode)) continue;
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
// Keyed by resolved base URL, not by target: "live" and "comp:0" mean
// different sites for different orgs sharing this server instance, so a
// target-keyed cache would hand one org another's crawl.
const crawlCache = new Map<string, SiteCrawl>();

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
  const analysis = analyzeHtml(url, (await fetchHtml(url)).html);
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
    const { html: xml } = await fetchHtml(url);
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

function toPassage(
  tokens: string[],
  start: number,
  end: number,
): DuplicatePassage {
  // The window at `end` still carries its own trailing SHINGLE_SIZE-1 words.
  const words = tokens.slice(start, end + SHINGLE_SIZE);
  return { words: words.length, text: words.join(" ") };
}

/**
 * Collapse consecutive matching windows back into the passages a reader would
 * recognise. Overlapping windows are why the raw match count reads so high: a
 * copied paragraph of N words produces N-7 of them, so only the merged span is
 * a meaningful unit.
 */
function mergePassages(
  segments: string[][],
  matches: (shingle: string) => boolean,
): DuplicatePassage[] {
  const passages: DuplicatePassage[] = [];
  for (const tokens of segments) {
    const last = tokens.length - SHINGLE_SIZE;
    let start = -1;
    for (let i = 0; i <= last; i++) {
      if (matches(tokens.slice(i, i + SHINGLE_SIZE).join(" "))) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        passages.push(toPassage(tokens, start, i - 1));
        start = -1;
      }
    }
    if (start >= 0) passages.push(toPassage(tokens, start, last));
  }
  return passages;
}

/** Longest first, dropping repeats and passages contained in a longer one. */
function dedupePassages(passages: DuplicatePassage[]): DuplicatePassage[] {
  const kept: DuplicatePassage[] = [];
  for (const passage of [...passages].sort((a, b) => b.words - a.words)) {
    if (!kept.some((k) => k.text.includes(passage.text))) kept.push(passage);
  }
  return kept;
}

function findDuplicatePhrases(
  contentByPath: Map<string, string[]>,
): DuplicatePhraseFinding[] {
  // Shingles keep stop words: paragraph reuse is about literal copy, not
  // keyword density.
  const tokensByPath = new Map<string, string[][]>();
  const shinglesByPath = new Map<string, Set<string>>();
  const wordsByPath = new Map<string, number>();
  const pagesPerShingle = new Map<string, number>();

  for (const [path, segments] of contentByPath) {
    const tokenSegments = segments.map(tokenize);
    const shingles = new Set<string>();
    let words = 0;
    for (const tokens of tokenSegments) {
      words += tokens.length;
      for (let i = 0; i + SHINGLE_SIZE <= tokens.length; i++) {
        shingles.add(tokens.slice(i, i + SHINGLE_SIZE).join(" "));
      }
    }
    // Counted once per page, so a phrase repeated within one page doesn't
    // inflate its document frequency.
    for (const shingle of shingles) {
      pagesPerShingle.set(shingle, (pagesPerShingle.get(shingle) ?? 0) + 1);
    }
    tokensByPath.set(path, tokenSegments);
    shinglesByPath.set(path, shingles);
    wordsByPath.set(path, words);
  }

  const paths = [...shinglesByPath.keys()];
  const minBoilerplatePages = Math.max(
    BOILERPLATE_MIN_PAGES,
    Math.ceil(paths.length * BOILERPLATE_PAGE_SHARE),
  );
  const isBoilerplate = (shingle: string) =>
    (pagesPerShingle.get(shingle) ?? 0) >= minBoilerplatePages;

  const findings: DuplicatePhraseFinding[] = [];
  for (let a = 0; a < paths.length; a++) {
    for (let b = a + 1; b < paths.length; b++) {
      const segments = tokensByPath.get(paths[a]);
      const otherShingles = shinglesByPath.get(paths[b]);
      if (!segments || !otherShingles) continue;
      const passages = dedupePassages(
        mergePassages(
          segments,
          (shingle) => otherShingles.has(shingle) && !isBoilerplate(shingle),
        ),
      );
      const sharedWords = passages.reduce((sum, p) => sum + p.words, 0);
      if (sharedWords < MIN_DUPLICATE_WORDS) continue;
      findings.push({
        pageA: paths[a],
        pageB: paths[b],
        sharedWords,
        passageCount: passages.length,
        passages: passages.slice(0, 3),
        ratioA: sharedWords / Math.max(wordsByPath.get(paths[a]) ?? 1, 1),
        ratioB: sharedWords / Math.max(wordsByPath.get(paths[b]) ?? 1, 1),
      });
    }
  }

  return findings.sort((a, b) => b.sharedWords - a.sharedWords).slice(0, 20);
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
  try {
    const baseUrl = await resolveBaseUrl(target);
    return { success: true, data: crawlCache.get(baseUrl) ?? null };
  } catch {
    // An unresolvable target has no crawl — the empty state says so already.
    return { success: true, data: null };
  }
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

/**
 * How many crawled pages link to each crawled page, counted once per source.
 *
 * Deliberately reads each page's full link inventory rather than the
 * main-content links the anchor-reuse check uses: a careers page reached only
 * from the footer is properly linked, and would read as an orphan if page
 * chrome were stripped first. Links to pages outside the crawl are ignored, so
 * every crawled path gets an entry and nothing else does.
 */
function countInboundLinks(
  pagesByPath: Map<string, PageAnalysis>,
): Record<string, number> {
  // Sitemaps and hrefs disagree about trailing slashes — a sitemap listing
  // /work/ is linked as /work half the time — so pages are matched on a
  // normalized form but the result is keyed by each page's own `path`, which
  // is what the table looks up. Matching on the raw paths marks every page on
  // a trailing-slash site an orphan except the homepage, whose "/" is too
  // short to normalize.
  const canonical = new Map<string, string>();
  const inbound: Record<string, number> = {};
  for (const analysis of pagesByPath.values()) {
    inbound[analysis.path] = 0;
    const normalized = normalizeSpiderPath(analysis.url);
    if (normalized) canonical.set(normalized, analysis.path);
  }

  for (const analysis of pagesByPath.values()) {
    const self = normalizeSpiderPath(analysis.url);
    const targets = new Set<string>();
    for (const link of analysis.links) {
      if (!link.internal) continue;
      const normalized = normalizeSpiderPath(link.href);
      if (!normalized || normalized === self) continue;
      const target = canonical.get(normalized);
      if (target) targets.add(target);
    }
    for (const target of targets) inbound[target] += 1;
  }
  return inbound;
}

/** Crawl the whole site and run the site-wide checks. Takes ~20–40s. */
export async function runSiteCrawl(
  target: SiteTarget,
): Promise<SeoResult<SiteCrawl>> {
  try {
    const baseUrl = await resolveBaseUrl(target);
    const baseHost = normalizeHost(new URL(baseUrl).host);
    const errors: CrawlError[] = [];
    const redirects: CrawlRedirect[] = [];
    const contentByPath = new Map<string, string[]>();
    const linksBySource = new Map<string, PageLink[]>();
    const pagesByPath = new Map<string, PageAnalysis>();

    const crawlPage = async (path: string): Promise<PageAnalysis | null> => {
      try {
        const requested = new URL(path, baseUrl).href;
        const { html, finalUrl } = await fetchHtml(requested);

        // A page is filed under the path the site actually serves, not the one
        // the sitemap claimed. Two stale entries redirecting to one live page
        // would otherwise become two identical rows, and the duplicate check
        // would report that page as a verbatim copy of itself.
        let finalPath = path;
        if (finalUrl !== requested) {
          const landed = normalizeSpiderPath(finalUrl);
          if (!landed || normalizeHost(new URL(finalUrl).host) !== baseHost) {
            // Left the site, or landed on a file rather than a page.
            redirects.push({ path, to: finalUrl });
            return null;
          }
          finalPath = landed;
          if (finalPath !== path) {
            redirects.push({ path, to: finalPath });
            if (pagesByPath.has(finalPath)) return null;
          }
        }

        const analysis = analyzeHtml(finalUrl, html);
        pageCache.set(finalUrl, analysis);
        const content = mainContentView(finalUrl, html);
        contentByPath.set(finalPath, content.segments);
        linksBySource.set(finalPath, content.internalLinks);
        pagesByPath.set(finalPath, analysis);
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
    let skipped = 0;
    if (sitemapPaths.length > 0) {
      discovery = "sitemap";
      skipped = Math.max(0, sitemapPaths.length - MAX_CRAWL_PAGES);
      // Shallowest paths first, so a capped crawl keeps the shape of the site
      // — homepage, then top-level pages — instead of the alphabetical slice
      // the sitemap arrives in, which on a big site stops somewhere inside
      // /blog and never reaches "/".
      const byDepth = [...sitemapPaths].sort(
        (a, b) =>
          a.split("/").length - b.split("/").length || a.localeCompare(b),
      );
      await mapLimit(
        byDepth.slice(0, MAX_CRAWL_PAGES),
        CRAWL_CONCURRENCY,
        crawlPage,
      );
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
      redirects,
      inboundLinks: countInboundLinks(pagesByPath),
      skipped,
      duplicatePhrases: findDuplicatePhrases(contentByPath),
      anchorReuse: findAnchorReuse(linksBySource),
    };
    crawlCache.set(baseUrl, crawl);
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
  const organizationId = await getActiveOrgId();
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
