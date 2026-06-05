"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { X, ChevronUp, ChevronDown, Loader2, Search, FileText } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EntityBadges } from "@/components/EntityBadges";
import { FrequencyBadge } from "@/components/FrequencyBadge";
import { DocumentSymbolBadge, buildODSLink } from "@/components/DocumentSymbolBadge";

// =============================================================================
// Types
// =============================================================================

export interface Version {
  symbol: string;
  year: number | null;
  publicationDate: string | null;
  recordNumber: string | null;
  wordCount: number | null;
}

export type EntityRole = "lead" | "contributing";

export interface EntitySuggestion {
  entity: string;
  source: string;
  confidence_score?: number | null;
}

// Kept for backwards-compat with importers. The public API never returns the
// underlying confirmation rows (they carry user_id / email) — see the
// report_entities_public view.
export interface EntityConfirmation {
  entity: string;
  role?: EntityRole;
}

export interface SubjectCount {
  subject: string;
  count: number;
}

export interface MandateInfo {
  summary: string | null;
  explicit_frequency: string | null;
  implicit_frequency: string | null;
  frequency_reasoning: string | null;
  verbatim_paragraph: string | null;
}

export interface ResolutionInfo {
  symbol: string;
  title: string | null;
  date_year: number | null;
  mandates?: MandateInfo[];
}

export interface SimilarReport {
  symbol: string;
  title: string;
  year: number | null;
  similarity: number;
  entity: string | null;
}

export interface ReportGroup {
  title: string;
  symbol: string;
  body: string | null;
  reportType?: string;
  year: number | null;
  entity: string | null;
  suggestedEntities?: string[];
  confirmedEntities?: string[];
  leadEntities?: string[];
  contributingEntities?: string[];
  suggestions?: EntitySuggestion[];
  hasConfirmation?: boolean;
  versions: Version[];
  count: number;
  latestYear: number | null;
  frequency: string | null;
  calculatedFrequency?: string | null;
  confirmedFrequency?: string | null;
  gapHistory?: number[] | null;
  downloadCount?: number;
  subjectTerms: string[];
}

// =============================================================================
// Helpers
// =============================================================================

const BODY_ABBREVS: Record<string, string> = {
  "General Assembly": "GA",
  "Security Council": "SC",
  "Economic and Social Council": "ECOSOC",
  "Human Rights Council": "HRC",
  "Human Rights Bodies": "HRB",
  "Secretary-General": "SG",
  "Secretariat": "Sec",
  "International Court of Justice": "ICJ",
  "Trusteeship Council": "TC",
};

function abbreviateBody(body: string | null): string | null {
  if (!body) return null;
  if (BODY_ABBREVS[body]) return BODY_ABBREVS[body];
  return body
    .split(/\s+/)
    .map((word) => word[0]?.toUpperCase())
    .filter(Boolean)
    .join("");
}

function buildDLLink(symbol: string): string {
  return `https://digitallibrary.un.org/search?ln=en&p=${encodeURIComponent(symbol)}&f=&c=Resource%20Type&c=UN%20Bodies&sf=&so=d&rg=50&fti=0`;
}

function getQuarter(publicationDate: string | null): number | null {
  if (!publicationDate) return null;
  const match = publicationDate.match(/^\d{4}-(\d{2})/);
  if (!match) return null;
  const month = parseInt(match[1], 10);
  if (month >= 1 && month <= 3) return 1;
  if (month >= 4 && month <= 6) return 2;
  if (month >= 7 && month <= 9) return 3;
  if (month >= 10 && month <= 12) return 4;
  return null;
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function sortSubjectsByFrequency(
  subjects: string[],
  subjectCounts: SubjectCount[]
): string[] {
  const countMap = new Map(subjectCounts.map((s) => [s.subject.toLowerCase(), s.count]));
  return [...subjects].sort((a, b) => {
    const countA = countMap.get(a.toLowerCase()) || 0;
    const countB = countMap.get(b.toLowerCase()) || 0;
    if (countB !== countA) return countB - countA;
    return a.localeCompare(b);
  });
}

// =============================================================================
// Sub-components
// =============================================================================

function SubjectPill({ subject, size = "xs" }: { subject: string; size?: "xs" | "sm" }) {
  const sizeClasses = size === "xs"
    ? "px-2 py-0.5 text-xs"
    : "px-2.5 py-0.5 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap border border-gray-200 bg-white text-gray-700 ${sizeClasses}`}
    >
      {toTitleCase(subject)}
    </span>
  );
}

function SortedSubjectPills({
  subjects,
  subjectCounts,
}: {
  subjects: string[];
  subjectCounts: SubjectCount[];
}) {
  const sorted = useMemo(
    () => sortSubjectsByFrequency(subjects, subjectCounts),
    [subjects, subjectCounts]
  );
  if (sorted.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {sorted.map((term) => (
        <SubjectPill key={term} subject={term} />
      ))}
    </div>
  );
}

function VersionRow({ v }: { v: Version }) {
  const formattedDate = v.publicationDate
    ? new Date(v.publicationDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : v.year?.toString() ?? "—";

  const formattedWordCount = v.wordCount ? v.wordCount.toLocaleString() : null;

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-xs text-gray-500 w-20 flex-shrink-0">
        {formattedDate}
      </span>
      <span className="text-xs font-medium text-gray-900 min-w-0 truncate flex-1">
        {v.symbol}
      </span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {formattedWordCount && (
          <span className="text-xs text-gray-400" title="Word count">
            {formattedWordCount} words
          </span>
        )}
        <a
          href={buildODSLink(v.symbol)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-un-blue bg-blue-50 rounded hover:bg-blue-100 transition-colors"
        >
          <FileText className="h-3 w-3" />
          PDF
        </a>
        <a
          href={buildDLLink(v.symbol)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
        >
          <Search className="h-3 w-3" />
          Digital Library
        </a>
      </div>
    </div>
  );
}

// Per-language colors from the UN visual identity palette (UN Blue + accents).
// EN takes UN Blue; remaining accent hues are assigned in palette order.
const LANG_COLORS: Record<string, string> = {
  EN: "#009EDB", // UN Blue
  FR: "#A05FB4", // Purple
  ES: "#F58220", // Orange
  AR: "#72BF44", // Green
  ZH: "#ED1847", // Red
  RU: "#FFC800", // Yellow
  DE: "#AEA29A", // Gray
};
const LANG_FALLBACK = "#AEA29A";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonth(month: string): string {
  // month is "YYYY-MM"
  const [y, m] = month.split("-");
  const idx = parseInt(m, 10) - 1;
  if (idx < 0 || idx > 11) return month;
  return `${MONTH_NAMES[idx]} ${y}`;
}

interface DownloadStats {
  languages: string[];
  totals: Record<string, number>;
  total: number;
  series: { month: string; langs: Record<string, number>; total: number }[];
}

function DownloadChart({ stats }: { stats: DownloadStats }) {
  const { series, languages, totals, total } = stats;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (series.length === 0 || total === 0) {
    return (
      <p className="text-xs text-gray-400">No download data available.</p>
    );
  }

  const maxTotal = Math.max(...series.map((s) => s.total), 1);

  const yearTicks: { year: string; index: number }[] = [];
  let lastYear = "";
  series.forEach((s, i) => {
    const y = s.month.slice(0, 4);
    if (y !== lastYear) {
      yearTicks.push({ year: y, index: i });
      lastYear = y;
    }
  });

  const hovered = hoverIdx !== null ? series[hoverIdx] : null;
  // Tooltip horizontal anchor: center over the hovered bar, clamped so it
  // never overflows the chart edges.
  const tooltipLeftPct =
    hoverIdx !== null
      ? Math.min(
          Math.max(((hoverIdx + 0.5) / series.length) * 100, 18),
          82
        )
      : 50;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {languages.map((lang) => (
          <span
            key={lang}
            className="inline-flex items-center gap-1 text-[11px] text-gray-600"
          >
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: LANG_COLORS[lang] || LANG_FALLBACK }}
            />
            <span className="font-medium">{lang}</span>
            <span className="tabular-nums text-gray-400">
              {totals[lang].toLocaleString()}
            </span>
          </span>
        ))}
      </div>
      <div
        className="relative h-20 w-full"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <div className="absolute inset-0 flex items-end gap-px">
          {series.map((m, i) => {
            const heightPct = (m.total / maxTotal) * 100;
            const isHovered = hoverIdx === i;
            return (
              <div
                key={m.month}
                className="group relative flex h-full flex-1 min-w-0 flex-col justify-end cursor-default"
                onMouseEnter={() => setHoverIdx(i)}
              >
                {/* Hover highlight column behind the bar */}
                <div
                  className={`absolute inset-0 transition-colors ${
                    isHovered ? "bg-gray-200/60" : "bg-transparent"
                  }`}
                />
                <div
                  className="relative flex flex-col-reverse w-full"
                  style={{ height: `${heightPct}%` }}
                >
                  {languages.map((lang) => {
                    const v = m.langs[lang] || 0;
                    if (v === 0) return null;
                    const segPct = (v / m.total) * 100;
                    return (
                      <div
                        key={lang}
                        style={{
                          height: `${segPct}%`,
                          backgroundColor: LANG_COLORS[lang] || LANG_FALLBACK,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {hovered && (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] shadow-md"
            style={{ left: `${tooltipLeftPct}%` }}
          >
            <div className="mb-1 flex items-baseline gap-3">
              <span className="font-medium text-gray-700">
                {formatMonth(hovered.month)}
              </span>
              <span className="ml-auto tabular-nums font-semibold text-gray-900">
                {hovered.total.toLocaleString()}
              </span>
            </div>
            <div className="space-y-0.5">
              {languages
                .filter((lang) => (hovered.langs[lang] || 0) > 0)
                .map((lang) => (
                  <div
                    key={lang}
                    className="flex items-center gap-1.5 text-gray-600"
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-sm"
                      style={{
                        backgroundColor: LANG_COLORS[lang] || LANG_FALLBACK,
                      }}
                    />
                    <span className="font-medium">{lang}</span>
                    <span className="ml-auto tabular-nums">
                      {hovered.langs[lang].toLocaleString()}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
      <div className="relative h-4 w-full text-[11px] text-gray-400">
        {yearTicks.map((t) => (
          <span
            key={t.year}
            className="absolute"
            style={{ left: `${(t.index / series.length) * 100}%` }}
          >
            {t.year}
          </span>
        ))}
      </div>
    </div>
  );
}

function PublicationPattern({
  versions,
  frequencyBadge,
}: {
  versions: Version[];
  frequencyBadge?: React.ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  const INITIAL_VISIBLE = 5;
  const hasMore = versions.length > INITIAL_VISIBLE;
  const visibleVersions = showAll ? versions : versions.slice(0, INITIAL_VISIBLE);

  const years = versions.map((v) => v.year).filter((y): y is number => y !== null);
  if (years.length === 0) return null;

  const maxYear = Math.max(...years);
  const minDisplayYear = maxYear - 5;
  const displayYears = Array.from({ length: 6 }, (_, i) => minDisplayYear + i);

  const versionMap = new Map<number, Set<number>>();
  versions.forEach((v) => {
    if (v.year === null) return;
    if (!versionMap.has(v.year)) versionMap.set(v.year, new Set());
    const q = getQuarter(v.publicationDate);
    if (q) versionMap.get(v.year)!.add(q);
    else versionMap.get(v.year)!.add(0);
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Reporting Pattern
          </span>
          {frequencyBadge}
        </span>
        <span className="text-xs text-gray-400">
          {versions.length} versions
        </span>
      </div>
      <div className="flex gap-2">
        {displayYears.map((year) => {
          const quarters = versionMap.get(year);
          const hasPublication = !!quarters;
          const hasUnknownQuarter = quarters?.has(0);
          return (
            <div key={year} className="flex-1 min-w-0">
              <div className="flex gap-[1px] mb-1">
                {[1, 2, 3, 4].map((q) => {
                  const isFilled = quarters?.has(q) || (hasUnknownQuarter && q === 1);
                  return (
                    <div
                      key={q}
                      className={`h-4 flex-1 transition-colors ${
                        isFilled ? "bg-un-blue" : "bg-gray-100"
                      }`}
                    />
                  );
                })}
              </div>
              <div
                className={`text-[9px] text-center ${
                  hasPublication ? "text-gray-600 font-medium" : "text-gray-300"
                }`}
              >
                {year}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 space-y-0.5">
        {visibleVersions.map((v) => (
          <VersionRow key={v.symbol} v={v} />
        ))}
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full text-xs text-gray-500 hover:text-gray-700 py-1 flex items-center justify-center gap-1 mt-1"
          >
            {showAll ? (
              <>Show less <ChevronUp className="h-3 w-3" /></>
            ) : (
              <>Show {versions.length - INITIAL_VISIBLE} more <ChevronDown className="h-3 w-3" /></>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function SimilarReportsGrid({
  similar,
  loading,
  error,
  onSelect,
  defaultVisible = 4,
}: {
  similar: SimilarReport[];
  loading: boolean;
  error: string | null;
  onSelect?: (symbol: string) => void;
  defaultVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 h-10">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Finding similar...
      </div>
    );
  }

  if (error || similar.length === 0) {
    return (
      <p className="text-sm text-gray-400 h-10 flex items-center">
        {error || "No similar reports found"}
      </p>
    );
  }

  const visible = expanded ? similar : similar.slice(0, defaultVisible);
  const hasMore = similar.length > defaultVisible;

  return (
    <div className="space-y-1">
      {visible.map((r) => (
        <button
          key={r.symbol}
          type="button"
          onClick={() => onSelect?.(r.symbol)}
          className="block w-full text-left p-2 rounded-md border bg-white border-gray-200 hover:border-un-blue hover:bg-blue-50/40 transition-colors cursor-pointer"
        >
          <p className="text-sm text-gray-800 truncate" title={r.title}>
            {r.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="text-[11px] font-medium px-1.5 py-0.5 rounded cursor-help"
                  style={{
                    backgroundColor: `rgba(0, 0, 0, ${0.05 + Math.max(0, (r.similarity - 0.7) / 0.3) * 0.25})`,
                    color: `rgba(0, 0, 0, ${0.4 + Math.max(0, (r.similarity - 0.7) / 0.3) * 0.5})`,
                  }}
                >
                  {Math.round(r.similarity * 100)}%
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">Similarity score (0–100%). Typical matches fall between 70% and 85%. Scores below 70% suggests only loose thematic overlap.</p>
              </TooltipContent>
            </Tooltip>
            <span className="text-xs font-medium text-un-blue">{r.symbol}</span>
            <span className="text-xs text-gray-400">{r.year ?? "—"}</span>
            {r.entity && (
              <span className="text-xs text-gray-400 truncate min-w-0">{r.entity}</span>
            )}
          </div>
        </button>
      ))}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-xs text-gray-500 hover:text-gray-700 py-1.5 flex items-center justify-center gap-1"
        >
          {expanded ? (
            <>Show less <ChevronUp className="h-3 w-3" /></>
          ) : (
            <>Show {similar.length - defaultVisible} more <ChevronDown className="h-3 w-3" /></>
          )}
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

export interface ReportSidebarProps {
  report: ReportGroup | null;
  onClose: () => void;
  subjectCounts: SubjectCount[];
  onSelectSymbol?: (symbol: string) => void;
}

export function ReportSidebar({
  report,
  onClose,
  subjectCounts,
  onSelectSymbol,
}: ReportSidebarProps) {
  const [similar, setSimilar] = useState<SimilarReport[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<ResolutionInfo[]>([]);
  const [mandatingParagraphsExpanded, setMandatingParagraphsExpanded] = useState(false);
  const [downloadStats, setDownloadStats] = useState<DownloadStats | null>(null);
  const [downloadStatsLoading, setDownloadStatsLoading] = useState(false);

  const prevReportRef = useRef<ReportGroup | null>(null);
  useEffect(() => {
    prevReportRef.current = report;
  }, [report]);

  useEffect(() => {
    if (!report) return;
    setSimilarLoading(true);
    setSimilarError(null);
    setMandatingParagraphsExpanded(false);
    setResolutions([]);

    fetch(`/api/similar-reports?symbol=${encodeURIComponent(report.symbol)}&limit=10`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setSimilarError(data.error);
        else setSimilar(data.similar || []);
      })
      .catch(() => setSimilarError("Failed to load similar reports"))
      .finally(() => setSimilarLoading(false));

    fetch(`/api/sg-reports?symbol=${encodeURIComponent(report.symbol)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.resolutions) setResolutions(data.resolutions);
      })
      .catch(() => {});

    setDownloadStats(null);
    if ((report.downloadCount ?? 0) > 0) {
      setDownloadStatsLoading(true);
      fetch(
        `/api/report-downloads?symbol=${encodeURIComponent(report.symbol)}`
      )
        .then((r) => r.json())
        .then((data) => {
          if (!data.error) setDownloadStats(data);
        })
        .catch(() => {})
        .finally(() => setDownloadStatsLoading(false));
    }
  }, [report?.symbol]);

  if (!report) return null;

  const displayTitle = report.title?.replace(/\s*:\s*$/, "").trim() || "Untitled";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity min-h-screen"
        onClick={onClose}
        style={{ height: "100vh", minHeight: "100vh" }}
      />
      <div className="fixed right-0 top-0 h-screen w-full max-w-lg bg-white shadow-xl z-50 flex flex-col">
        <div className="flex-shrink-0 border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <DocumentSymbolBadge symbol={report.symbol} size="sm" linkToODS={false} />
                {report.body && (
                  <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {abbreviateBody(report.body)}
                  </span>
                )}
                <EntityBadges
                  suggestions={report.suggestions}
                  confirmedEntities={report.confirmedEntities}
                  leadEntities={report.leadEntities}
                  contributingEntities={report.contributingEntities}
                  maxVisible={6}
                  size="xs"
                />
              </div>
              <h2
                className="text-base font-medium text-gray-900 leading-snug line-clamp-2"
                title={displayTitle}
              >
                {displayTitle}
              </h2>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <a
                  href={buildODSLink(report.symbol)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-un-blue bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  PDF
                </a>
                <a
                  href={buildDLLink(report.symbol)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  <Search className="h-3.5 w-3.5" />
                  Digital Library
                </a>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-5">
            {/* Mandating paragraphs (always shown, with empty states) */}
            {(() => {
              const allMandates: Array<{ mandate: MandateInfo; resSymbol: string; idx: number }> = [];
              resolutions.forEach((res) => {
                res.mandates?.forEach((mandate, idx) => {
                  if (mandate.verbatim_paragraph || mandate.summary) {
                    allMandates.push({ mandate, resSymbol: res.symbol, idx });
                  }
                });
              });

              const hasResolutions = resolutions.length > 0;
              const hasMandates = allMandates.length > 0;

              const INITIAL_VISIBLE = 2;
              const hasMore = allMandates.length > INITIAL_VISIBLE;
              const visibleMandates = mandatingParagraphsExpanded
                ? allMandates
                : allMandates.slice(0, INITIAL_VISIBLE);

              const uniqueSources = hasMandates
                ? Array.from(new Set(allMandates.map((m) => m.resSymbol)))
                : resolutions.map((r) => r.symbol);
              const showMultiSource = uniqueSources.length > 1;

              return (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <h3 className="mb-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mandating Paragraphs
                  </h3>

                  {!hasResolutions ? (
                    <p className="text-sm leading-relaxed text-gray-500 italic">
                      No mandating resolution is recorded for this report in
                      the Digital Library metadata.
                    </p>
                  ) : (
                    <p className="text-sm leading-relaxed text-gray-600">
                      Mandate source{uniqueSources.length > 1 ? "s" : ""}{" "}
                      according to Digital Library metadata:{" "}
                      {uniqueSources.map((sym, i) => (
                        <span key={sym}>
                          {i > 0 && ", "}
                          <a
                            href={buildDLLink(sym)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-un-blue hover:bg-blue-100 transition-colors"
                          >
                            {sym}
                          </a>
                        </span>
                      ))}
                    </p>
                  )}

                  {hasResolutions && !hasMandates && (
                    <p className="mt-3 text-sm leading-relaxed text-gray-500 italic">
                      No relevant operative paragraph could be extracted from{" "}
                      {uniqueSources.length > 1 ? "these resolutions" : "this resolution"}.
                    </p>
                  )}

                  {hasMandates && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm leading-relaxed text-gray-600">
                        Potentially matching paragraphs according to AI analysis
                        (unverified):
                      </p>
                      {visibleMandates.map(({ mandate, resSymbol, idx }) => (
                        <a
                          key={`${resSymbol}-${idx}`}
                          href={`https://docs.un.org/en/${encodeURI(resSymbol)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-md border border-gray-200 bg-white p-2.5 space-y-1.5 hover:border-un-blue hover:bg-blue-50/40 transition-colors"
                        >
                          <p className="text-sm leading-relaxed text-gray-700 italic">
                            {mandate.verbatim_paragraph ? (
                              <>&quot;{mandate.verbatim_paragraph}&quot;</>
                            ) : mandate.summary ? (
                              <>{mandate.summary}</>
                            ) : null}
                          </p>
                          {showMultiSource && (
                            <p className="text-[11px] text-gray-400">
                              from {resSymbol}
                            </p>
                          )}
                        </a>
                      ))}
                      {hasMore && (
                        <button
                          onClick={() => setMandatingParagraphsExpanded(!mandatingParagraphsExpanded)}
                          className="w-full text-xs text-gray-500 hover:text-gray-700 py-1 flex items-center justify-center gap-1 mt-1"
                        >
                          {mandatingParagraphsExpanded ? (
                            <>Show less <ChevronUp className="h-3 w-3" /></>
                          ) : (
                            <>Show {allMandates.length - INITIAL_VISIBLE} more <ChevronDown className="h-3 w-3" /></>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Subjects */}
            {report.subjectTerms && report.subjectTerms.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-2">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subjects
                </h3>
                <SortedSubjectPills subjects={report.subjectTerms} subjectCounts={subjectCounts} />
              </div>
            )}

            {/* Reporting pattern */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <PublicationPattern
                versions={report.versions}
                frequencyBadge={
                  <FrequencyBadge
                    frequency={report.frequency}
                    calculatedFrequency={report.calculatedFrequency}
                    confirmedFrequency={report.confirmedFrequency}
                    gapHistory={report.gapHistory}
                    size="xs"
                  />
                }
              />
            </div>

            {/* Downloads */}
            {report.downloadCount !== undefined && report.downloadCount > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex items-baseline gap-2">
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Downloads
                    </h3>
                    <span className="text-sm font-semibold tabular-nums text-gray-900">
                      {report.downloadCount.toLocaleString()}
                    </span>
                  </span>
                  <span className="text-xs text-gray-400">
                    monthly, by language
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-gray-600">
                  Downloads of this report in all six official languages from
                  the UN Digital Library; this does not include
                  downloads via the UN Official Document System.
                </p>
                {downloadStatsLoading && !downloadStats ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 h-20">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading download history...
                  </div>
                ) : downloadStats ? (
                  <DownloadChart stats={downloadStats} />
                ) : (
                  <p className="text-sm text-gray-400">No download history available.</p>
                )}
              </div>
            )}

            {/* Similar reports */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-2">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Similar Reports {!similarLoading && similar.length > 0 && `(${similar.length})`}
              </h3>
              <p className="text-sm leading-relaxed text-gray-600">
                Reports are ranked by topical similarity to this one, using
                vector embeddings of each report&apos;s title, subjects, and
                opening text. Higher scores reflect closer subject matter and
                framing, not verbatim content overlap.
              </p>
              <SimilarReportsGrid
                similar={similar}
                loading={similarLoading}
                error={similarError}
                onSelect={onSelectSymbol}
                defaultVisible={4}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
