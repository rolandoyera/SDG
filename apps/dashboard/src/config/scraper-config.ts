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
