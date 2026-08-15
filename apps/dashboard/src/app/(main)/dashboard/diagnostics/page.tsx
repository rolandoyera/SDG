"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Activity,
  ArrowLeft,
  Code,
  Database,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  RefreshCw,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { H1 } from "@/components/ui/typography";
import { SCRAPER_CONFIG } from "@/config/scraper-config";
import { AI_ASSISTANT_NAME } from "@/lib/ai-assistant";
import { clearDiagnosticRuns, getDiagnosticRuns } from "@/lib/db";
import type { DiagnosticRun } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

import { DiagnosticOutputViewer } from "./_components/diagnostic-output-viewer";

const TABS = [
  { id: "extracted", label: "Selected Fields", icon: Eye },
  { id: "markdown", label: "Scraped Markdown", icon: FileText },
  { id: "prompt", label: "Exact LLM Prompt", icon: Code },
  { id: "raw", label: "Raw AI JSON", icon: Database },
];

export default function DiagnosticsPage() {
  const { uid, role, loading: authLoading } = useAuth();
  const router = useRouter();

  const [runs, setRuns] = useState<DiagnosticRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<DiagnosticRun | null>(null);
  const [activeTab, setActiveTab] = useState("extracted");
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  // Access check & redirect
  useEffect(() => {
    if (authLoading) return;
    if (!uid) {
      router.push("/auth/login");
      return;
    }
    if (role !== "SuperAdmin") {
      toast.error("Access denied. SuperAdmin privileges required.");
      router.push("/dashboard/home");
    }
  }, [uid, role, authLoading, router]);

  // Fetch runs on mount
  const loadRuns = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getDiagnosticRuns();
      setRuns(data);
      setSelectedRun((currentSelected) => {
        if (data.length > 0) {
          if (!currentSelected) {
            return data[0];
          }
          const updated = data.find((r) => r.runId === currentSelected.runId);
          return updated || data[0];
        }
        return null;
      });
    } catch (error) {
      console.error("Failed to load diagnostic logs:", error);
      toast.error("Failed to fetch diagnostics from Firestore.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // Wipes temporary collection
  const handleClear = async () => {
    if (!confirm("Are you sure you want to delete all diagnostic history?"))
      return;
    setClearing(true);
    try {
      await clearDiagnosticRuns();
      setRuns([]);
      setSelectedRun(null);
      toast.success("Diagnostic logs wiped successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to clear diagnostic logs.");
    } finally {
      setClearing(false);
    }
  };

  const getDomainName = (urlString: string) => {
    try {
      const url = new URL(urlString);
      return url.hostname.replace("www.", "");
    } catch {
      return urlString;
    }
  };

  // ~4 chars/token for English text; scraped markdown tokenizes a bit denser
  // (URLs, punctuation), so this reads slightly low. Actual counts are in the
  // Usage page's AI tab via usageMetadata.
  const estimatedTokens = (text: string) =>
    `≈ ${Math.ceil(text.length / 4).toLocaleString()} tokens`;

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  if (authLoading || role !== "SuperAdmin") {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center">
        <div className="relative flex flex-col items-center gap-4">
          <div className="relative size-12">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
          <p className="animate-pulse font-medium text-muted-foreground text-xs uppercase tracking-widest">
            Verifying Authority
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {/* Premium Header */}
      <div className="flex flex-col justify-between gap-4 border-b pb-6 md:flex-row md:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2 font-semibold text-primary text-sm uppercase tracking-wider">
            <Activity className="size-4 animate-pulse" />
            AI Diagnostic Console
          </div>
          <H1>Logs & Extraction Diagnostics</H1>
          <p className="mt-1 text-muted-foreground text-sm">
            Real-time inspection center showing scraped markdown data, prompts,
            and raw JSON returned by {AI_ASSISTANT_NAME}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => loadRuns(true)}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Refresh Logs
          </Button>
          <Button
            variant="destructive"
            onClick={handleClear}
            disabled={clearing || runs.length === 0}
            className="flex items-center gap-2"
          >
            <Trash2 className="size-4" />
            Clear History
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-100 flex-col items-center justify-center gap-3">
          <RefreshCw className="size-8 animate-spin text-primary" />
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            Querying Diagnostic Log Runs
          </p>
        </div>
      ) : runs.length === 0 ? (
        <Card className="flex min-h-87.5 flex-col items-center justify-center border-dashed bg-background/30 p-8 text-center backdrop-blur-xs">
          <Activity className="mb-4 size-16 animate-pulse text-muted-foreground/35" />
          <h3 className="font-heading font-semibold text-xl">
            No Diagnostic Runs Found
          </h3>
          <p className="mt-2 max-w-md text-muted-foreground text-sm leading-relaxed">
            Run an AI Product Autofill from a webpage link or AI Vendor Autofill
            from a domain homepage, and your telemetry logs will populate here
            automatically.
          </p>
          <div className="mt-6 flex items-center gap-4">
            <Button asChild variant="outline">
              <Link href="/dashboard/library">
                <ArrowLeft className="mr-2 size-4" />
                Go to Product Library
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/vendors">Go to Vendors</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* LEFT PANEL: Historical Run Selector */}
          <div className="flex max-h-screen flex-col gap-3 px-1 lg:col-span-4">
            <h3 className="mb-1 px-1 font-bold text-muted-foreground text-xs uppercase tracking-wider">
              Captured Sessions ({runs.length})
            </h3>
            {runs.map((run) => {
              const active = selectedRun?.runId === run.runId;
              const domain = getDomainName(run.url);

              return (
                <Card
                  key={run.runId}
                  onClick={() => setSelectedRun(run)}
                  className={cn(
                    "cursor-pointer transition-all duration-200 hover:border-primary/30 p-4! min-h-fit",
                    active
                      ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                      : "bg-card/40 hover:bg-primary/10",
                  )}
                >
                  <CardContent className="flex flex-col gap-2.5 p-0">
                    <div className="flex w-full items-center justify-between">
                      <Badge
                        variant={
                          run.type === "product" ? "default" : "secondary"
                        }
                      >
                        {run.type === "product"
                          ? "Product Autofill"
                          : "Vendor Profile"}
                      </Badge>
                      <span className="font-medium text-[11px] text-muted-foreground">
                        {formatTimestamp(run.createdAt)}
                      </span>
                    </div>

                    <div>
                      <h4 className="truncate font-heading font-semibold text-foreground text-sm group-hover:text-primary">
                        {run.parsedData?.name || "Unnamed Entity"}
                      </h4>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-muted-foreground text-xs">
                        <Globe className="size-3 shrink-0" />
                        {domain}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* RIGHT PANEL: Live Inspector Console */}
          <div className="flex flex-col gap-4 lg:col-span-8">
            {/* Header info of active inspect target */}
            {selectedRun && (
              <Card>
                <CardContent className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center pt-0">
                  <div>
                    <span className="font-bold text-primary text-xs uppercase tracking-wider">
                      Active Inspector Target
                    </span>
                    <h2 className="mt-0.5 font-bold font-heading text-foreground text-lg">
                      {selectedRun.parsedData?.name || "Unnamed"}
                    </h2>
                    <a
                      href={selectedRun.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-1.5 text-muted-foreground text-xs hover:text-primary hover:underline"
                    >
                      <Globe className="size-3" />
                      {selectedRun.url}
                      <ExternalLink className="size-2.5" />
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">ID: {selectedRun.runId}</Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tab navigation */}
            <div className="flex gap-1 overflow-x-auto border-border border-b">
              {TABS.map((tab) => {
                const ActiveIcon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 font-semibold text-xs transition-all",
                      active
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                    )}
                  >
                    <ActiveIcon className="size-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab contents panel */}
            <div className="min-h-120">
              {/* TAB 1: Extracted Fields UI Showcase */}
              {activeTab === "extracted" && selectedRun && (
                <div className="flex flex-col gap-6">
                  {/* Detailed Field Cards Grid */}
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {/* Basic Meta Fields */}
                    <Card className="bg-card/50">
                      <CardHeader className="border-border/30 border-b pb-3">
                        <CardTitle className="flex items-center gap-2">
                          <ShoppingBag className="size-4 text-primary" />
                          Brand & Category Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="mt-4 flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                            Extracted Name
                          </span>
                          <div className="flex h-5 w-full items-center overflow-hidden">
                            <span className="truncate font-semibold text-foreground text-sm">
                              {selectedRun.parsedData?.name || (
                                <em className="text-muted-foreground/50">
                                  Not extracted
                                </em>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                            Matched Category
                          </span>
                          <div className="flex h-5 items-center">
                            {selectedRun.parsedData?.category ? (
                              <Badge>{selectedRun.parsedData.category}</Badge>
                            ) : (
                              <em className="text-muted-foreground/50 text-xs">
                                Not matched
                              </em>
                            )}
                          </div>
                        </div>

                        {selectedRun.type === "product" && (
                          <div className="flex flex-col gap-1">
                            <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                              Product SKU
                            </span>
                            <div className="flex h-5 items-center">
                              <span className="truncate font-medium font-mono text-foreground text-sm">
                                {selectedRun.parsedData?.sku || (
                                  <em className="font-sans text-muted-foreground/50">
                                    Not extracted
                                  </em>
                                )}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                            Business Phone
                          </span>
                          <div className="flex h-5 items-center">
                            <span className="truncate font-medium text-foreground text-sm">
                              {selectedRun.parsedData?.repPhone || (
                                <em className="text-muted-foreground/50">
                                  Not extracted
                                </em>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                            Business Email
                          </span>
                          <div className="flex h-5 items-center">
                            <span className="truncate font-medium text-foreground text-sm">
                              {selectedRun.parsedData?.repEmail || (
                                <em className="text-muted-foreground/50">
                                  Not extracted
                                </em>
                              )}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Address & Specs */}
                    <Card className="bg-card/50">
                      <CardHeader className="border-border/30 border-b pb-3">
                        <CardTitle className="flex items-center gap-2">
                          <Globe className="size-4 text-primary" />
                          Specs & Address Context
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="mt-4 flex flex-col gap-4">
                        {selectedRun.type === "vendor" ? (
                          <>
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                                Street Address
                              </span>
                              <div className="flex h-5 items-center">
                                <span className="truncate text-foreground text-sm">
                                  {selectedRun.parsedData?.street || (
                                    <em className="text-muted-foreground/50">
                                      Not extracted
                                    </em>
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                                City
                              </span>
                              <div className="flex h-5 items-center">
                                <span className="text-foreground text-sm">
                                  {selectedRun.parsedData?.city || (
                                    <em className="text-muted-foreground/50">
                                      Not extracted
                                    </em>
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                                State
                              </span>
                              <div className="flex h-5 items-center">
                                <span className="text-foreground text-sm">
                                  {selectedRun.parsedData?.state || (
                                    <em className="text-muted-foreground/50">
                                      Not extracted
                                    </em>
                                  )}
                                </span>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                                Finish / Color
                              </span>
                              <div className="flex h-5 items-center">
                                <span className="truncate text-foreground text-sm">
                                  {selectedRun.parsedData?.finishColor || (
                                    <em className="text-muted-foreground/50">
                                      Not extracted
                                    </em>
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                                Dimensions
                              </span>
                              <div className="flex h-5 items-center">
                                <span className="truncate text-foreground text-sm">
                                  {selectedRun.parsedData?.dimensions || (
                                    <em className="text-muted-foreground/50">
                                      Not extracted
                                    </em>
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                                Material Swatches
                              </span>
                              <div className="flex h-5 items-center">
                                <span className="truncate text-foreground text-sm">
                                  {selectedRun.parsedData?.materials || (
                                    <em className="text-muted-foreground/50">
                                      Not extracted
                                    </em>
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                                Unit MSRP Price
                              </span>
                              <div className="flex h-5 items-center">
                                <span className="font-semibold text-primary text-sm">
                                  {selectedRun.parsedData?.msrp ? (
                                    formatCurrency(selectedRun.parsedData.msrp)
                                  ) : (
                                    <em className="font-normal text-muted-foreground/50">
                                      Not extracted
                                    </em>
                                  )}
                                </span>
                              </div>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>

                    {/* Description Block */}
                    <Card className="bg-card/50 md:col-span-2">
                      <CardContent className="flex flex-col gap-2 py-4">
                        <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                          Extracted Company / Product Description
                        </span>
                        <p className="text-foreground text-sm leading-relaxed">
                          {selectedRun.parsedData?.description || (
                            <em className="text-muted-foreground/50">
                              No description extracted
                            </em>
                          )}
                        </p>
                      </CardContent>
                    </Card>

                    {/* Media Assets Inspector */}
                    <Card className="bg-card/50 md:col-span-2">
                      <CardHeader className="border-border/30 border-b pb-3">
                        <CardTitle className="flex items-center gap-2">
                          <Eye className="size-4 text-primary" />
                          Resolved Image Assets
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="mt-4 flex flex-col gap-6">
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                          {/* Logo URL */}
                          <div className="flex flex-col gap-2">
                            <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                              Resolved Branding Logo
                            </span>
                            {selectedRun.parsedData?.logoUrl ? (
                              <div className="flex items-center gap-3 rounded border border-border/50 bg-background/50 p-3">
                                {/* biome-ignore lint/performance/noImgElement: diagnostics preview renders arbitrary scraped image URLs. */}
                                <img
                                  src={selectedRun.parsedData.logoUrl}
                                  alt="Logo"
                                  className="size-12 rounded border border-border bg-white object-contain p-1"
                                />
                                <span className="max-w-50 truncate font-mono text-muted-foreground text-xs">
                                  {selectedRun.parsedData.logoUrl}
                                </span>
                              </div>
                            ) : (
                              <div className="flex select-none items-center justify-center rounded border border-border border-dashed p-4 text-muted-foreground text-xs italic">
                                No branding logo resolved
                              </div>
                            )}
                          </div>

                          {/* Hero Image / Cover Image */}
                          <div className="flex flex-col gap-2">
                            <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                              Resolved Cover / Hero Image
                            </span>
                            {selectedRun.parsedData?.heroImageUrl ||
                            selectedRun.parsedData?.coverImageUrl ? (
                              <div className="flex items-center gap-3 rounded border border-border/50 bg-background/50 p-3">
                                {/* biome-ignore lint/performance/noImgElement: diagnostics preview renders arbitrary scraped image URLs. */}
                                <img
                                  src={
                                    selectedRun.parsedData.heroImageUrl ||
                                    selectedRun.parsedData.coverImageUrl
                                  }
                                  alt="Hero Showcase"
                                  className="size-12 rounded border border-border object-cover"
                                />
                                <span className="max-w-50 truncate font-mono text-muted-foreground text-xs">
                                  {selectedRun.parsedData.heroImageUrl ||
                                    selectedRun.parsedData.coverImageUrl}
                                </span>
                              </div>
                            ) : (
                              <div className="flex select-none items-center justify-center rounded border border-border border-dashed p-4 text-muted-foreground text-xs italic">
                                No showcase image resolved
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Confidence Ratings prevention of layout shift */}
                    <Card className="bg-card/50 md:col-span-2">
                      <CardHeader className="border-border/30 border-b pb-3">
                        <CardTitle>AI Extraction Confidence Matrix</CardTitle>
                      </CardHeader>
                      <CardContent className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
                        {selectedRun.parsedData?.confidence &&
                          Object.entries(selectedRun.parsedData.confidence).map(
                            ([field, score]) => {
                              const val = typeof score === "number" ? score : 0;
                              const pct = Math.round(val * 100);
                              return (
                                <div
                                  key={field}
                                  className="flex flex-col rounded border border-border/40 bg-background/40 p-2.5"
                                >
                                  <span className="truncate font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                                    {field}
                                  </span>
                                  <div className="mt-1 flex h-5 items-center gap-1.5">
                                    <span
                                      className={cn(
                                        "font-bold text-xs",
                                        val >= 0.75
                                          ? "text-emerald-500"
                                          : val >= 0.4
                                            ? "text-amber-500"
                                            : "text-rose-500",
                                      )}
                                    >
                                      {pct}%
                                    </span>
                                    <span className="font-semibold text-[9px] text-muted-foreground">
                                      certainty
                                    </span>
                                  </div>
                                </div>
                              );
                            },
                          )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* TAB 2: Scraped Markdown text viewer */}
              {activeTab === "markdown" && selectedRun && (
                <DiagnosticOutputViewer
                  title="Cleaned Page Readability Snapshot"
                  description={`First ${SCRAPER_CONFIG.maxCharacters.toLocaleString()} characters are fed to the model context.`}
                  emptyText="No Jina Reader scraped markdown captured."
                  value={selectedRun.scrapedMarkdown}
                  kind="markdown"
                  icon={FileText}
                  meta={estimatedTokens(selectedRun.scrapedMarkdown)}
                />
              )}

              {/* TAB 3: Prompt viewer */}
              {activeTab === "prompt" && selectedRun && (
                <DiagnosticOutputViewer
                  title="Raw LLM Prompt Instructions Context"
                  description="Contains the task instructions, category specifications, extracted HTML image crawler results, and Jina body markdown."
                  emptyText="No prompt context captured."
                  value={selectedRun.prompt}
                  kind="prompt"
                  icon={Code}
                  meta={estimatedTokens(selectedRun.prompt)}
                />
              )}

              {/* TAB 4: Raw Response JSON viewer */}
              {activeTab === "raw" && selectedRun && (
                <DiagnosticOutputViewer
                  title="Raw AI Extraction String"
                  description="Raw JSON response text returned from the model before frontend validation, self-healing parser adjustments, and image candidate sorting."
                  emptyText="No raw JSON response text captured."
                  value={selectedRun.rawResponse}
                  kind="json"
                  icon={Database}
                  meta={estimatedTokens(selectedRun.rawResponse)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
