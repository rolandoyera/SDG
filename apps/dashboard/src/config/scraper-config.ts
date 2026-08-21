/**
 * Configuration limits and settings for the AI scraper and LLM extraction.
 */
export const SCRAPER_CONFIG = {
  maxCharacters: 100000,
  maxImageCandidates: 15,
  primaryModel: "gemini-3.1-flash-lite",
  fallbackModel: "gemini-2.5-flash",
  /**
   * Model for the url_context fallback when the target site blocks the scraper.
   * Must be a Gemini 3.x model: 2.5-era models reject tools combined with
   * `responseMimeType: "application/json"` (HTTP 400).
   */
  urlContextModel: "gemini-3.1-flash-lite",
  jinaReaderUrl: "https://r.jina.ai/",
};

export interface DomainScrapeHint {
  /**
   * Scrape via Firecrawl FIRST instead of after a failed Jina attempt — for
   * domains whose WAF is known to block Jina every time. Jina remains the
   * fallback if Firecrawl comes back empty/blocked, so the chain still
   * degrades gracefully if the wall ever drops or the Firecrawl quota runs out.
   */
  preferFirecrawl?: boolean;
  /**
   * Query param that pins ONE exact variant on this domain. Ferguson uses
   * `uid`, which matches the page's own `Item: bci{uid}` id — but `uid` is far
   * too generic to add to the shared urlPinsVariant regex, where it would
   * collide with user/session ids on other sites and wrongly suppress a variant
   * picker the buyer needs.
   */
  variantParam?: string;
}

/**
 * Per-domain scrape routing hints, keyed by registrable domain (subdomains
 * match). Scraping MECHANICS belong in generic platform rules (image-probe
 * rewrites, `urlPinsVariant`, junk selectors) — an entry here is only for
 * domain-specific knowledge those can't express, and is only earned by an
 * observed failure or slowness (check the saved diagnostic runs), never
 * curated speculatively.
 */
export const DOMAIN_SCRAPE_HINTS: Record<string, DomainScrapeHint> = {
  // Akamai blocks both Jina Reader and the direct HTML fetch (the interstitial
  // parses as valid ~300-char markdown); Firecrawl returns the real page.
  "fergusonhome.com": { preferFirecrawl: true, variantParam: "uid" },
};

/** Look up the scrape hint for a URL's domain (matches any subdomain depth). */
export function domainScrapeHint(url: string): DomainScrapeHint | undefined {
  try {
    const parts = new URL(url).hostname.toLowerCase().split(".");
    for (let i = 0; i < parts.length - 1; i++) {
      const hint = DOMAIN_SCRAPE_HINTS[parts.slice(i).join(".")];
      if (hint) return hint;
    }
  } catch {
    // Not a parseable URL — no hint.
  }
  return undefined;
}
