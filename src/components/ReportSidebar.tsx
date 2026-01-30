"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Loader2, ChevronUp, ChevronDown, X, FileText, Search, Check, Plus, Minus, MessageSquare, Bot } from "lucide-react";
import { useChatContext } from "@/components/chat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface Version {
  symbol: string;
  year: number | null;
  publicationDate: string | null;
  recordNumber: string | null;
  wordCount: number | null;
}

export interface ReportGroup {
  title: string;
  symbol: string;
  body: string | null;
  reportType?: string;
  year: number | null;
  entity: string | null;
  entityManual?: string | null;
  entityDri?: string | null;
  suggestedEntities?: string[];
  confirmedEntities?: string[];
  suggestions?: EntitySuggestion[];
  confirmations?: EntityConfirmation[];
  hasConfirmation?: boolean;
  versions: Version[];
  count: number;
  latestYear: number | null;
  // Frequency fields
  frequency: string | null; // Effective frequency (confirmed or calculated)
  calculatedFrequency?: string | null; // From Python weighted-mode
  confirmedFrequency?: string | null; // User confirmed
  gapHistory?: number[] | null; // Year gaps for transparency
  subjectTerms: string[];
}

export interface EntitySuggestion {
  entity: string;
  source: string;
  confidence_score?: number | null;
}

export interface EntityConfirmation {
  entity: string;
  confirmed_by_email?: string;
  confirmed_at?: string;
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
  mandates: MandateInfo[];
}

export interface SimilarReport {
  symbol: string;
  title: string;
  year: number | null;
  similarity: number;
  entity: string | null;
}

// Feedback types (for survey responses)
export type FeedbackStatus = "continue" | "continue_with_changes" | "merge" | "discontinue" | null;
export type FrequencyFeedback = "multiple" | "annual" | "biennial" | "triennial" | "quadrennial" | "one-time" | null;
export type FormatFeedback = "shorter" | "oral" | "dashboard" | "other" | "no-change" | null;

export interface Feedback {
  status: FeedbackStatus;
  mergeTargets: string[];
  discontinueReason: string;
  frequency: FrequencyFeedback;
  format: FormatFeedback;
  formatOther: string;
  comments: string;
}

// Keep legacy type aliases for API compatibility
export type RecommendationStatus = FeedbackStatus;
export type FrequencyRecommendation = FrequencyFeedback;
export type FormatRecommendation = FormatFeedback;
export type Recommendation = Feedback;

// =============================================================================
// Constants
// =============================================================================

const FREQUENCY_OPTIONS = [
  { value: "multiple", label: "Multiple times per year" },
  { value: "annual", label: "Annual" },
  { value: "biennial", label: "Biennial (every 2 years)" },
  { value: "triennial", label: "Triennial (every 3 years)" },
  { value: "quadrennial", label: "Quadrennial (every 4 years)" },
  { value: "one-time", label: "One-time only" },
];

const FORMAT_OPTIONS = [
  { value: "shorter", label: "Shorter written report" },
  { value: "oral", label: "Oral update only" },
  { value: "dashboard", label: "Dashboard / data format" },
  { value: "other", label: "Other (specify)" },
  { value: "no-change", label: "Do not change format" },
];

// Abbreviations for common UN issuing bodies
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

// =============================================================================
// Helper Functions
// =============================================================================

function abbreviateBody(body: string | null): string | null {
  if (!body) return null;
  if (BODY_ABBREVS[body]) return BODY_ABBREVS[body];
  return body
    .split(/\s+/)
    .map((word) => word[0]?.toUpperCase())
    .filter(Boolean)
    .join("");
}

// Build ODS link from document symbol
// Uses undocs.org which is the official UN shortlink service
function buildODSLink(symbol: string): string {
  return `https://undocs.org/en/${encodeURIComponent(symbol)}`;
}

// Build Digital Library search link from symbol
function buildDLLink(symbol: string): string {
  return `https://digitallibrary.un.org/search?ln=en&p=${encodeURIComponent(symbol)}&f=&c=Resource%20Type&c=UN%20Bodies&sf=&so=d&rg=50&fti=0`;
}

// Get quarter from publication date
function getQuarter(publicationDate: string | null): number | null {
  if (!publicationDate) return null;
  const match = publicationDate.match(/^\d{4}-(\d{2})/);
  if (!match) return null;
  const month = parseInt(match[1], 10);
  return Math.ceil(month / 3);
}

// Convert string to Title Case
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Helper to sort subjects by global frequency
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

// Step indicator with UN blue/green circle styling
function StepIndicator({ 
  step, 
  active, 
  complete 
}: { 
  step: number; 
  active: boolean;
  complete: boolean;
}) {
  return (
    <span className={`
      inline-flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold flex-shrink-0
      ${complete ? 'bg-green-500 text-white' : active ? 'bg-un-blue text-white' : 'bg-gray-300 text-gray-500'}
    `}>
      {complete ? <Check className="h-4 w-4" /> : step}
    </span>
  );
}

// Single subject pill component
function SubjectPill({
  subject,
  size = "sm",
}: {
  subject: string;
  size?: "xs" | "sm";
}) {
  const sizeClasses = size === "xs" 
    ? "px-1.5 py-0.5 text-[10px]" 
    : "px-2 py-0.5 text-xs";
  
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap bg-gray-100 text-gray-600 ${sizeClasses}`}
    >
      {toTitleCase(subject)}
    </span>
  );
}

// Sorted subject pills component
function SortedSubjectPills({
  subjects,
  subjectCounts,
  maxVisible,
  size = "xs",
}: {
  subjects: string[];
  subjectCounts: SubjectCount[];
  maxVisible?: number;
  size?: "xs" | "sm";
}) {
  const sorted = useMemo(
    () => sortSubjectsByFrequency(subjects, subjectCounts),
    [subjects, subjectCounts]
  );

  const visible = maxVisible ? sorted.slice(0, maxVisible) : sorted;

  if (sorted.length === 0) {
    return <span className="text-gray-300 text-xs">—</span>;
  }

  if (!maxVisible) {
    return (
      <div className="flex flex-wrap gap-1">
        {sorted.map((term) => (
          <SubjectPill key={term} subject={term} size={size} />
        ))}
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 overflow-hidden cursor-default">
          {visible.map((term) => (
            <SubjectPill key={term} subject={term} size={size} />
          ))}
          {sorted.length > maxVisible && (
            <span className="text-[10px] text-gray-400 flex-shrink-0">
              +{sorted.length - maxVisible}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm p-2 bg-white border shadow-lg">
        <div className="flex flex-wrap gap-1">
          {sorted.map((term) => (
            <SubjectPill key={term} subject={term} size="xs" />
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// Select item with "current" indicator
function SelectItemWithCurrent({ value, label, currentValue }: { value: string; label: string; currentValue?: string | null }) {
  const isCurrent = currentValue?.toLowerCase() === value;
  return (
    <SelectItem value={value} className="flex justify-between">
      <span>{label}</span>
      {isCurrent && <span className="ml-auto text-gray-400 text-xs">current</span>}
    </SelectItem>
  );
}

// Merge target search component
interface MergeSearchResult {
  symbol: string;
  title: string | null;
  year: number | null;
}

function MergeTargetSearch({
  onAdd,
  existingTargets,
}: {
  onAdd: (symbol: string) => void;
  existingTargets: string[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MergeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setHighlightedIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/documents/search?q=${encodeURIComponent(query)}`);
        if (response.ok) {
          const data = await response.json();
          setResults(data);
          setShowResults(true);
          setHighlightedIndex(-1);
        }
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Close results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && resultsRef.current) {
      const item = resultsRef.current.children[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  const handleSelect = (result: MergeSearchResult) => {
    if (existingTargets.includes(result.symbol)) return;
    onAdd(result.symbol);
    setQuery("");
    setResults([]);
    setShowResults(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev < results.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev > 0 ? prev - 1 : results.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          handleSelect(results[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowResults(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-md border border-gray-200 focus-within:border-un-blue focus-within:ring-1 focus-within:ring-un-blue">
        <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search reports..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none min-w-0"
        />
        {isSearching && (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400 flex-shrink-0" />
        )}
      </div>

      {/* Search Results Dropdown */}
      {showResults && results.length > 0 && (
        <div ref={resultsRef} className="absolute left-0 right-0 mt-1 bg-white border rounded shadow-lg z-50 max-h-48 overflow-y-auto">
          {results.map((result, index) => {
            const isAlreadyAdded = existingTargets.includes(result.symbol);
            const isHighlighted = index === highlightedIndex;
            return (
              <div
                key={result.symbol}
                className={`flex items-center gap-2 px-2 py-1.5 border-b last:border-b-0 ${
                  isAlreadyAdded 
                    ? "bg-gray-50 opacity-60" 
                    : isHighlighted 
                    ? "bg-blue-50" 
                    : "hover:bg-blue-50 cursor-pointer"
                }`}
                onClick={() => !isAlreadyAdded && handleSelect(result)}
                onMouseEnter={() => !isAlreadyAdded && setHighlightedIndex(index)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-un-blue">
                      {result.symbol}
                    </span>
                    {result.year && (
                      <span className="text-[10px] text-gray-400">{result.year}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-600 truncate">
                    {result.title || <span className="italic text-gray-400">No title</span>}
                  </div>
                </div>
                {isAlreadyAdded ? (
                  <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
                ) : (
                  <Plus className="h-3 w-3 text-gray-400 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {showResults && query.length >= 2 && results.length === 0 && !isSearching && (
        <div className="absolute left-0 right-0 mt-1 bg-white border rounded shadow-lg z-50 p-2 text-xs text-gray-500">
          No reports found
        </div>
      )}
    </div>
  );
}

// Compact feedback form
function CompactFeedbackForm({
  report,
  mergeTargets,
  onMergeTargetsChange,
  userEntity,
  isConfirmedByUserEntity,
  loadingExisting,
  feedback,
  onFeedbackChange,
  saving,
  saveSuccess,
  onSaveClick,
}: {
  report: ReportGroup;
  mergeTargets: string[];
  onMergeTargetsChange: (targets: string[]) => void;
  userEntity?: string | null;
  isConfirmedByUserEntity: boolean;
  loadingExisting: boolean;
  feedback: Omit<Feedback, 'mergeTargets'>;
  onFeedbackChange: <K extends keyof Omit<Feedback, 'mergeTargets'>>(key: K, value: Omit<Feedback, 'mergeTargets'>[K]) => void;
  saving: boolean;
  saveSuccess: boolean;
  onSaveClick: () => void;
}) {
  const canEdit = userEntity && isConfirmedByUserEntity;
  
  // Show frequency/format options for "continue_with_changes" and "merge"
  const showFrequencyFormat = feedback.status === "continue_with_changes" || feedback.status === "merge";
  
  const isFormValid = useMemo(() => {
    if (!feedback.status) return false;
    
    // "continue" (without changes) doesn't require additional fields
    if (feedback.status === "continue") {
      return true;
    }
    
    // "continue_with_changes" requires at least one change specified
    if (feedback.status === "continue_with_changes") {
      const hasFrequency = !!feedback.frequency;
      const hasFormat = !!feedback.format && (feedback.format !== "other" || !!feedback.formatOther?.trim());
      const hasComments = !!feedback.comments?.trim();
      if (!hasFrequency && !hasFormat && !hasComments) return false;
    }
    
    // "merge" only requires merge targets
    if (feedback.status === "merge") {
      if (mergeTargets.length === 0) return false;
    }
    
    if (feedback.status === "discontinue") {
      if (!feedback.discontinueReason?.trim()) return false;
    }
    
    return true;
  }, [feedback, mergeTargets]);

  if (!canEdit) {
    return (
      <div className="rounded-lg p-3 border border-gray-200 bg-gray-50 text-sm">
        <p className="text-gray-500">
          Confirm this is your entity&apos;s report above to provide feedback.
        </p>
      </div>
    );
  }

  // Small label component for form fields
  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-xs font-medium text-gray-500 mb-1">{children}</label>
  );

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>What action do you recommend?</FieldLabel>
        <Select
          value={feedback.status ?? undefined}
          onValueChange={(v) => onFeedbackChange("status", v as FeedbackStatus)}
        >
          <SelectTrigger className="w-full bg-white">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="continue">Continue</SelectItem>
            <SelectItem value="continue_with_changes">Continue with changes</SelectItem>
            <SelectItem value="merge">Merge with another report</SelectItem>
            <SelectItem value="discontinue">Discontinue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {feedback.status && (
        <div className="space-y-3 pt-1">
          {feedback.status === "merge" && (
            <div className="space-y-2">
              <FieldLabel>Which report(s) to merge with?</FieldLabel>
              {mergeTargets.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {mergeTargets.map((symbol) => (
                    <span
                      key={symbol}
                      className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs"
                    >
                      {symbol}
                      <button
                        onClick={() => onMergeTargetsChange(mergeTargets.filter((s) => s !== symbol))}
                        className="hover:text-blue-900"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">Click &quot;Merge&quot; on reports below to select</p>
              )}
              <MergeTargetSearch
                onAdd={(symbol) => {
                  if (!mergeTargets.includes(symbol)) {
                    onMergeTargetsChange([...mergeTargets, symbol]);
                  }
                }}
                existingTargets={mergeTargets}
              />
            </div>
          )}

          {feedback.status === "discontinue" && (
            <div>
              <FieldLabel>Why discontinue this report?</FieldLabel>
              <textarea
                value={feedback.discontinueReason}
                onChange={(e) => onFeedbackChange("discontinueReason", e.target.value)}
                placeholder="Explain your reasoning..."
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-un-blue focus:ring-1 focus:ring-un-blue resize-none"
                rows={2}
              />
            </div>
          )}

          {showFrequencyFormat && (
            <div className="space-y-3">
              <div>
                <FieldLabel>What frequency do you recommend?</FieldLabel>
                <Select
                  value={feedback.frequency ?? undefined}
                  onValueChange={(v) => onFeedbackChange("frequency", v as FrequencyFeedback)}
                >
                  <SelectTrigger className="w-full text-sm h-9 bg-white">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((opt) => (
                      <SelectItemWithCurrent key={opt.value} value={opt.value} label={opt.label} currentValue={report.frequency} />
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>What format do you recommend?</FieldLabel>
                <Select
                  value={feedback.format ?? undefined}
                  onValueChange={(v) => onFeedbackChange("format", v as FormatFeedback)}
                >
                  <SelectTrigger className="w-full text-sm h-9 bg-white">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAT_OPTIONS.map((opt) => (
                      <SelectItemWithCurrent key={opt.value} value={opt.value} label={opt.label} />
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
          {feedback.format === "other" && showFrequencyFormat && (
            <div>
              <FieldLabel>Describe the format</FieldLabel>
              <Input
                value={feedback.formatOther}
                onChange={(e) => onFeedbackChange("formatOther", e.target.value)}
                placeholder="e.g., interactive dashboard..."
                className="h-9 text-sm bg-white"
              />
            </div>
          )}

          <div>
            <FieldLabel>Any additional comments?</FieldLabel>
            <textarea
              value={feedback.comments}
              onChange={(e) => onFeedbackChange("comments", e.target.value)}
              placeholder="Optional..."
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-un-blue focus:ring-1 focus:ring-un-blue resize-none"
              rows={2}
            />
          </div>
        </div>
      )}

      {feedback.status && (
        <Button 
          className="h-9" 
          disabled={!isFormValid || saving || loadingExisting}
          onClick={onSaveClick}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Saving...
            </>
          ) : saveSuccess ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Saved
            </>
          ) : (
            "Save Feedback"
          )}
        </Button>
      )}
    </div>
  );
}

// Similar reports grid
function SimilarReportsGrid({
  similar,
  loading,
  error,
  onMerge,
  onCompare,
  mergeTargets,
  currentSymbol,
  defaultVisible = 4,
}: {
  similar: SimilarReport[];
  loading: boolean;
  error: string | null;
  onMerge?: (symbol: string) => void;
  onCompare?: (symbol: string) => void;
  mergeTargets?: string[];
  currentSymbol?: string;
  defaultVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 h-10">
        <Loader2 className="h-3 w-3 animate-spin" />
        Finding similar...
      </div>
    );
  }

  if (error || similar.length === 0) {
    return (
      <p className="text-xs text-gray-400 h-10 flex items-center">
        {error || "No similar reports found"}
      </p>
    );
  }

  const visible = expanded ? similar : similar.slice(0, defaultVisible);
  const hasMore = similar.length > defaultVisible;

  return (
    <div className="space-y-1">
      {visible.map((r) => {
        const isInMerge = mergeTargets?.includes(r.symbol);
        return (
          <div 
            key={r.symbol} 
            className={`grid grid-cols-[1fr_auto] gap-2 p-2 rounded-md border transition-colors ${
              isInMerge 
                ? "bg-blue-50 border-blue-200" 
                : "bg-white border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm text-gray-800 truncate" title={r.title}>
                {r.title}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <a
                  href={buildDLLink(r.symbol)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-un-blue font-medium hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {r.symbol}
                </a>
                <span className="text-[11px] text-gray-400">
                  {r.year ?? "—"}
                </span>
                {r.entity && (
                  <span className="text-[10px] text-gray-400 truncate">
                    {r.entity}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {onCompare && (
                <button
                  onClick={() => onCompare(r.symbol)}
                  className="self-center flex items-center gap-1 px-2 py-1 rounded text-xs text-un-blue bg-blue-50 hover:bg-blue-100 transition-colors font-medium"
                  title="Compare in AI chat"
                >
                  <Bot className="h-3 w-3" />
                  Compare
                </button>
              )}
              {onMerge && (
                <button
                  onClick={() => onMerge(r.symbol)}
                  className={`self-center flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                    isInMerge
                      ? "bg-un-blue text-white"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  }`}
                  title={isInMerge ? "Remove from merge" : "Merge with this report"}
                >
                  {isInMerge ? (
                    <>
                      <Check className="h-3 w-3" />
                      Merge
                    </>
                  ) : (
                    "Merge"
                  )}
                </button>
              )}
            </div>
          </div>
        );
      })}
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

// Version row component
function VersionRow({ v }: { v: Version }) {
  const formattedDate = v.publicationDate
    ? new Date(v.publicationDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : v.year?.toString() ?? "—";

  const formattedWordCount = v.wordCount
    ? v.wordCount.toLocaleString()
    : null;

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-xs text-gray-500 w-24 flex-shrink-0">
        {formattedDate}
      </span>
      <span className="text-sm font-medium text-gray-900 min-w-0 truncate">
        {v.symbol}
      </span>
      <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
        {formattedWordCount && (
          <span className="text-xs text-gray-400">
            {formattedWordCount} words
          </span>
        )}
        <a
          href={buildODSLink(v.symbol)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-un-blue bg-blue-50 rounded hover:bg-blue-100 transition-colors"
        >
          <FileText className="h-2.5 w-2.5" />
          PDF
        </a>
        <a
          href={buildDLLink(v.symbol)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
        >
          <Search className="h-2.5 w-2.5" />
          DL
        </a>
      </div>
    </div>
  );
}

// Interactive publication pattern
function InteractivePublicationPattern({ 
  versions, 
  expanded, 
  onToggle,
  onCompare,
}: { 
  versions: Version[]; 
  expanded: boolean;
  onToggle: () => void;
  onCompare?: () => void;
}) {
  const years = versions
    .map((v) => v.year)
    .filter((y): y is number => y !== null);
  
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
      <button
        onClick={onToggle}
        className="w-full text-left group"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Reporting Pattern
          </span>
          <span className="text-xs text-gray-400 group-hover:text-gray-600 flex items-center gap-1">
            {versions.length} versions
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
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
      </button>

      {/* Compare versions button - always visible when multiple versions */}
      {versions.length > 1 && onCompare && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCompare();
          }}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-un-blue bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
        >
          <Bot className="h-3.5 w-3.5" />
          Compare versions in AI
        </button>
      )}

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
          {versions.slice(0, 10).map((v) => (
            <VersionRow key={v.symbol} v={v} />
          ))}
          {versions.length > 10 && (
            <p className="text-xs text-gray-400 pt-1">
              +{versions.length - 10} more versions
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Resolutions Section - concise list with expandable mandate details
function ResolutionsSection({
  resolutions,
  loading,
}: {
  resolutions: ResolutionInfo[];
  loading: boolean;
}) {
  const [expandedMandates, setExpandedMandates] = useState<Set<string>>(new Set());

  const toggleMandateDetails = (symbol: string) => {
    setExpandedMandates(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  // Get frequency from mandate (prefer explicit over implicit)
  const getFrequency = (res: ResolutionInfo): string | null => {
    if (!res.mandates || res.mandates.length === 0) return null;
    const mandate = res.mandates[0];
    return mandate.explicit_frequency || mandate.implicit_frequency || null;
  };

  // Frequency badge color
  const getFrequencyColor = (freq: string | null) => {
    if (!freq) return "bg-gray-100 text-gray-500";
    switch (freq.toLowerCase()) {
      case "annual": return "bg-blue-100 text-blue-700";
      case "biennial": return "bg-green-100 text-green-700";
      case "triennial": return "bg-purple-100 text-purple-700";
      case "quadrennial": return "bg-amber-100 text-amber-700";
      case "one-time": return "bg-gray-100 text-gray-500";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  // Capitalize first letter
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading resolutions...
      </div>
    );
  }

  if (resolutions.length === 0) return null;

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        Based on Resolution{resolutions.length !== 1 ? "s" : ""}
      </h3>
      
      <div className="space-y-1">
        {resolutions.map((res) => {
          const freq = getFrequency(res);
          const hasMandates = res.mandates && res.mandates.length > 0;
          const isExpanded = expandedMandates.has(res.symbol);
          const mandate = hasMandates ? res.mandates[0] : null;
          const hasExpandableContent = mandate?.verbatim_paragraph || freq;

          return (
            <div key={res.symbol}>
              {/* Resolution row */}
              <div className="py-1.5">
                <div className="flex items-start gap-2">
                  <a
                    href={buildDLLink(res.symbol)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-un-blue hover:bg-blue-100 transition-colors flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {res.symbol}
                  </a>
                  <span className="text-sm text-gray-700 leading-snug flex-1">
                    {res.title?.replace(/\s*:\s*$/, "").trim() || <span className="text-gray-400 italic">No title</span>}
                  </span>
                </div>
                {hasExpandableContent && (
                  <button
                    onClick={() => toggleMandateDetails(res.symbol)}
                    className="mt-1 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        <span>Hide mandate details</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        <span>Show mandate details</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Expanded mandate details */}
              {isExpanded && (
                <div className="ml-2 pl-3 border-l-2 border-gray-200 py-2 space-y-2">
                  {/* AI disclaimer */}
                  <p className="text-[10px] text-gray-400 italic">
                    AI-extracted from source document, not validated
                  </p>
                  
                  {/* Mandating paragraphs (verbatim) - primary content */}
                  {mandate?.verbatim_paragraph && (
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                        Mandating paragraph
                      </p>
                      <p className="text-xs text-gray-600 italic leading-relaxed">
                        &ldquo;{mandate.verbatim_paragraph}&rdquo;
                      </p>
                    </div>
                  )}
                  
                  {/* Frequency with reasoning */}
                  {freq && (
                    <div className="flex items-start gap-2">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0 ${getFrequencyColor(freq)}`}>
                        {capitalize(freq)}
                      </span>
                      {mandate?.frequency_reasoning && (
                        <span className="text-xs text-gray-500">
                          {mandate.frequency_reasoning}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Main ReportSidebar Component
// =============================================================================

export interface ReportSidebarProps {
  report: ReportGroup | null;
  onClose: () => void;
  subjectCounts: SubjectCount[];
  onSave?: () => void;
  onDataChanged?: () => void;  // Callback when entity confirmation changes
  userEntity?: string | null;
  userEmail?: string | null;
}

export function ReportSidebar({
  report,
  onClose,
  subjectCounts,
  onSave,
  onDataChanged,
  userEntity,
  userEmail,
}: ReportSidebarProps) {
  const { prefillPrompt } = useChatContext();
  const [similar, setSimilar] = useState<SimilarReport[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [mergeTargets, setMergeTargets] = useState<string[]>([]);
  const [versionsExpanded, setVersionsExpanded] = useState(false);
  const [resolutions, setResolutions] = useState<ResolutionInfo[]>([]);
  const [resolutionsLoading, setResolutionsLoading] = useState(false);
  
  // Track sidebar open/close to force refresh on reopen
  const prevReportRef = useRef<ReportGroup | null>(null);
  const [sidebarOpenCount, setSidebarOpenCount] = useState(0);
  
  // Detect sidebar opening (report transitions from null to non-null)
  useEffect(() => {
    if (report && !prevReportRef.current) {
      setSidebarOpenCount(c => c + 1);
    }
    prevReportRef.current = report;
  }, [report]);
  
  // Form state (feedback instead of recommendation)
  const [feedback, setFeedback] = useState<Omit<Feedback, 'mergeTargets'>>({
    status: null,
    discontinueReason: "",
    frequency: null,
    format: null,
    formatOther: "",
    comments: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  
  // Entity confirmation state (optimistic updates)
  const [confirming, setConfirming] = useState(false);
  const [localConfirmed, setLocalConfirmed] = useState(false);
  const [localRemoved, setLocalRemoved] = useState(false);
  
  // Frequency confirmation state
  const [frequencyConfirming, setFrequencyConfirming] = useState(false);
  const [localFrequencyConfirmed, setLocalFrequencyConfirmed] = useState<string | null>(null);
  const [localFrequencyRemoved, setLocalFrequencyRemoved] = useState(false);
  
  // Check if user's entity has confirmed this report
  // localRemoved overrides server data, localConfirmed adds to it
  const isConfirmedByUserEntity = userEntity && !localRemoved && (
    localConfirmed || report?.confirmedEntities?.includes(userEntity)
  );
  
  // Effective confirmed frequency (local takes precedence)
  const effectiveConfirmedFrequency = localFrequencyRemoved 
    ? null 
    : (localFrequencyConfirmed || report?.confirmedFrequency || null);
  
  // Is this effectively a one-time report?
  const isOneTimeReport = effectiveConfirmedFrequency?.toLowerCase() === 'one-time';
  
  // Extract mandate frequency from resolutions (first available)
  const mandateFrequency = useMemo(() => {
    for (const res of resolutions) {
      for (const mandate of res.mandates || []) {
        if (mandate.explicit_frequency) return { frequency: mandate.explicit_frequency, reasoning: mandate.frequency_reasoning };
        if (mandate.implicit_frequency) return { frequency: mandate.implicit_frequency, reasoning: mandate.frequency_reasoning };
      }
    }
    return null;
  }, [resolutions]);
  
  // Is frequency confirmed (Step 1 complete)?
  const isFrequencyConfirmed = effectiveConfirmedFrequency !== null;
  
  // Is survey complete (Step 2 complete)?
  const isSurveyComplete = feedback.status !== null && saveSuccess;

  // Reset local state when report changes
  useEffect(() => {
    setLocalConfirmed(false);
    setLocalRemoved(false);
    setLocalFrequencyConfirmed(null);
    setLocalFrequencyRemoved(false);
  }, [report?.title]);

  // Handle confirming entity ownership
  const handleConfirmEntity = async () => {
    if (!report || !userEntity || confirming) return;
    
    setConfirming(true);
    try {
      const response = await fetch("/api/entity-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          properTitle: report.title,
          entity: userEntity,
        }),
      });
      
      if (response.ok) {
        setLocalConfirmed(true);
        setLocalRemoved(false);
        onDataChanged?.();
      }
    } catch (error) {
      console.error("Failed to confirm entity:", error);
    } finally {
      setConfirming(false);
    }
  };

  // Handle removing entity ownership
  const handleRemoveEntity = async () => {
    if (!report || !userEntity || confirming) return;
    
    setConfirming(true);
    try {
      const response = await fetch(
        `/api/entity-confirmations?properTitle=${encodeURIComponent(report.title)}&entity=${encodeURIComponent(userEntity)}`,
        { method: "DELETE" }
      );
      
      if (response.ok) {
        setLocalRemoved(true);
        setLocalConfirmed(false);
        onDataChanged?.();
      }
    } catch (error) {
      console.error("Failed to remove entity confirmation:", error);
    } finally {
      setConfirming(false);
    }
  };

  // Handle confirming frequency
  const handleConfirmFrequency = async (frequency: string) => {
    if (!report || frequencyConfirming) return;
    
    setFrequencyConfirming(true);
    try {
      const response = await fetch("/api/frequency-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          properTitle: report.title,
          frequency: frequency.toLowerCase().replace('-', '-'),
        }),
      });
      
      if (response.ok) {
        setLocalFrequencyConfirmed(frequency);
        setLocalFrequencyRemoved(false);
        onDataChanged?.();
      }
    } catch (error) {
      console.error("Failed to confirm frequency:", error);
    } finally {
      setFrequencyConfirming(false);
    }
  };

  // Handle removing frequency confirmation
  const handleRemoveFrequency = async () => {
    if (!report || frequencyConfirming) return;
    
    setFrequencyConfirming(true);
    try {
      const response = await fetch(
        `/api/frequency-confirmations?properTitle=${encodeURIComponent(report.title)}`,
        { method: "DELETE" }
      );
      
      if (response.ok) {
        setLocalFrequencyRemoved(true);
        setLocalFrequencyConfirmed(null);
        onDataChanged?.();
      }
    } catch (error) {
      console.error("Failed to remove frequency confirmation:", error);
    } finally {
      setFrequencyConfirming(false);
    }
  };

  // Fetch similar reports and resolutions when report changes
  useEffect(() => {
    if (!report) return;
    setSimilarLoading(true);
    setSimilarError(null);
    setMergeTargets([]);
    setVersionsExpanded(false);
    setResolutions([]);
    setResolutionsLoading(true);
    
    // Fetch similar reports
    fetch(`/api/similar-reports?symbol=${encodeURIComponent(report.symbol)}&limit=10`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setSimilarError(data.error);
        else setSimilar(data.similar || []);
      })
      .catch(() => setSimilarError("Failed to load similar reports"))
      .finally(() => setSimilarLoading(false));
    
    // Fetch report details including resolutions
    fetch(`/api/sg-reports?symbol=${encodeURIComponent(report.symbol)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.resolutions) setResolutions(data.resolutions);
        else if (data.based_on_resolution_symbols) {
          setResolutions(data.based_on_resolution_symbols.map((s: string) => ({ symbol: s, title: null, date_year: null })));
        }
      })
      .catch(() => {})
      .finally(() => setResolutionsLoading(false));
  }, [report?.symbol]);

  // Load existing response when report changes or sidebar reopens
  useEffect(() => {
    if (!report) return;
    setLoadingExisting(true);
    setSaveSuccess(false);
    fetch(`/api/survey-responses?properTitle=${encodeURIComponent(report.title)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.response) {
          // Map old "continue" with frequency/format to "continue_with_changes"
          let status = data.response.status as FeedbackStatus;
          if (status === "continue" && (data.response.frequency || data.response.format)) {
            status = "continue_with_changes";
          }
          setFeedback({
            status,
            discontinueReason: data.response.discontinueReason || "",
            frequency: data.response.frequency as FrequencyFeedback,
            format: data.response.format as FormatFeedback,
            formatOther: data.response.formatOther || "",
            comments: data.response.comments || "",
          });
          setMergeTargets(data.response.mergeTargets || []);
          setSaveSuccess(true); // Show as already saved if loaded from DB
        } else {
          setFeedback({
            status: null,
            discontinueReason: "",
            frequency: null,
            format: null,
            formatOther: "",
            comments: "",
          });
          setMergeTargets([]);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
  }, [report?.title, sidebarOpenCount]);

  const updateFeedback = useCallback(<K extends keyof Omit<Feedback, 'mergeTargets'>>(
    key: K,
    value: Omit<Feedback, 'mergeTargets'>[K]
  ) => {
    setFeedback((prev) => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
  }, []);

  const toggleMergeTarget = useCallback((symbol: string) => {
    setMergeTargets((prev) => {
      const isRemoving = prev.includes(symbol);
      const newTargets = isRemoving 
        ? prev.filter((s) => s !== symbol) 
        : [...prev, symbol];
      // Auto-set status to "merge" when adding targets
      if (!isRemoving && newTargets.length > 0) {
        setFeedback((r) => ({ ...r, status: "merge" }));
      }
      return newTargets;
    });
    setSaveSuccess(false);
  }, []);

  const handleSave = async () => {
    if (!report) return;
    setSaving(true);
    setSaveSuccess(false);
    
    // Map "continue_with_changes" back to "continue" for API (with frequency/format)
    const apiStatus = feedback.status === "continue_with_changes" ? "continue" : feedback.status;
    
    try {
      const response = await fetch("/api/survey-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          properTitle: report.title,
          latestSymbol: report.symbol,
          status: apiStatus,
          frequency: feedback.status === "continue_with_changes" || feedback.status === "merge" ? feedback.frequency : null,
          format: feedback.status === "continue_with_changes" || feedback.status === "merge" ? feedback.format : null,
          formatOther: feedback.formatOther,
          mergeTargets: mergeTargets,
          discontinueReason: feedback.discontinueReason,
          comments: feedback.comments,
        }),
      });
      
      if (response.ok) {
        setSaveSuccess(true);
        onSave?.();
      }
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setSaving(false);
    }
  };

  if (!report) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-block rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-un-blue">
                  {report.symbol}
                </span>
                {report.body && (
                  <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {abbreviateBody(report.body)}
                  </span>
                )}
              </div>
              <h2 className="text-sm font-medium text-gray-900 leading-snug line-clamp-2" title={report.title?.replace(/\s*:\s*$/, "").trim() || undefined}>
                {report.title?.replace(/\s*:\s*$/, "").trim() || "Untitled"}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
          {/* Chat action */}
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => prefillPrompt(`Please summarize report ${report.symbol}. Focus on the key findings, recommendations, and any important data points.`)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat about report
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-5">
            {/* ============================================================= */}
            {/* STEP 1: Confirm Current Frequency */}
            {/* ============================================================= */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-3">
              <div className="flex items-center gap-2">
                <StepIndicator step={1} active={!isFrequencyConfirmed} complete={isFrequencyConfirmed} />
                <h3 className="text-sm font-medium text-gray-700">Confirm Current Frequency</h3>
              </div>

              {/* Reporting Pattern visualization */}
              <div 
                className="border border-gray-200 rounded-md bg-white p-2 hover:border-gray-300 transition-colors cursor-pointer"
                onClick={() => setVersionsExpanded(!versionsExpanded)}
              >
                <InteractivePublicationPattern
                  versions={report.versions}
                  expanded={versionsExpanded}
                  onToggle={() => setVersionsExpanded(!versionsExpanded)}
                  onCompare={report.versions.length > 1 ? () => {
                    const symbols = report.versions.slice(0, 3).map(v => v.symbol).join(", ");
                    prefillPrompt(`Compare these report versions: ${symbols}. Show key changes between versions in a table.`);
                  } : undefined}
                />
                {!versionsExpanded && (
                  <p className="text-[10px] text-gray-400 mt-2 text-center">
                    Click to expand version history
                  </p>
                )}
              </div>

              {/* Mandating Paragraphs (if any resolutions with mandates) */}
              {resolutions.length > 0 && resolutions.some(r => r.mandates && r.mandates.length > 0) && (
                <div className="border border-gray-200 rounded-md bg-white p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Mandating Paragraphs</span>
                    <span className="text-[10px] text-gray-400">AI-extracted</span>
                  </div>
                  <div className="space-y-2">
                    {resolutions.map((res) => 
                      res.mandates?.map((mandate, idx) => (
                        <div key={`${res.symbol}-${idx}`} className="text-xs text-gray-600">
                          {mandate.verbatim_paragraph ? (
                            <span>&quot;{mandate.verbatim_paragraph}&quot;</span>
                          ) : mandate.summary ? (
                            <span>{mandate.summary}</span>
                          ) : null}
                          <a
                            href={buildDLLink(res.symbol)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-un-blue ml-1.5 hover:bg-blue-100 transition-colors"
                          >
                            {res.symbol}
                          </a>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Frequency selection */}
              <div className="space-y-2">
                {report.calculatedFrequency && !effectiveConfirmedFrequency && (
                  <p className="text-xs text-gray-500">
                    Calculated: <span className="font-medium">{report.calculatedFrequency}</span>
                    {report.gapHistory && report.gapHistory.length > 0 && (
                      <span className="text-gray-400 ml-1">(gaps: {report.gapHistory.slice(0, 4).join(', ')}{report.gapHistory.length > 4 ? '...' : ''} years)</span>
                    )}
                  </p>
                )}
                <Select
                  value={effectiveConfirmedFrequency?.toLowerCase() || ""}
                  onValueChange={(value) => handleConfirmFrequency(value)}
                  disabled={frequencyConfirming}
                >
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue placeholder="Select current frequency..." />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ============================================================= */}
            {/* STEP 2: Provide Feedback */}
            {/* ============================================================= */}
            <div className={`bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-3 transition-opacity ${
              !isFrequencyConfirmed ? 'opacity-50' : ''
            }`}>
              <div className="flex items-center gap-2">
                <StepIndicator 
                  step={2} 
                  active={isFrequencyConfirmed && !isSurveyComplete} 
                  complete={isSurveyComplete || (isFrequencyConfirmed && isOneTimeReport)} 
                />
                <h3 className="text-sm font-medium text-gray-700">Provide Feedback</h3>
              </div>

              {/* Not ready - Step 1 incomplete */}
              {!isFrequencyConfirmed && (
                <p className="text-xs text-gray-500">Complete Step 1 first to provide feedback.</p>
              )}

              {/* One-time report - done message */}
              {isFrequencyConfirmed && isOneTimeReport && (
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-100 rounded-md">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm text-green-700">One-time report. No further action needed.</span>
                </div>
              )}

              {/* Recurring report - need entity confirmation first */}
              {isFrequencyConfirmed && !isOneTimeReport && !isConfirmedByUserEntity && (
                <div className="space-y-2">
                  {userEntity ? (
                    <>
                      <p className="text-sm text-gray-600">
                        Confirm this is {userEntity}&apos;s report to provide feedback.
                      </p>
                      <button
                        onClick={handleConfirmEntity}
                        disabled={confirming}
                        className="w-full flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white p-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        {confirming ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Confirm as {userEntity} report
                      </button>
                    </>
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-700">
                      <a href="/login" className="font-medium underline hover:text-amber-900">Log in</a> to confirm this report and provide feedback.
                    </div>
                  )}
                </div>
              )}

              {/* Recurring report - entity confirmed, show survey */}
              {isFrequencyConfirmed && !isOneTimeReport && isConfirmedByUserEntity && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      Confirmed: {userEntity}
                    </span>
                    <button
                      onClick={handleRemoveEntity}
                      disabled={confirming}
                      className="text-gray-400 hover:text-gray-600 flex items-center gap-1"
                    >
                      {confirming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Minus className="h-3 w-3" />}
                      Undo
                    </button>
                  </div>
                  <CompactFeedbackForm
                    report={{
                      ...report,
                      frequency: effectiveConfirmedFrequency || report.frequency,
                    }}
                    mergeTargets={mergeTargets}
                    onMergeTargetsChange={setMergeTargets}
                    userEntity={userEntity}
                    isConfirmedByUserEntity={true}
                    loadingExisting={loadingExisting}
                    feedback={feedback}
                    onFeedbackChange={updateFeedback}
                    saving={saving}
                    saveSuccess={saveSuccess}
                    onSaveClick={handleSave}
                  />
                </div>
              )}
            </div>

            {/* Similar Reports - for merge context */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-2">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Similar Reports {!similarLoading && similar.length > 0 && `(${similar.length})`}
              </h3>
              {/* Show selected merge targets */}
              {mergeTargets.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-md p-2">
                  <p className="text-[11px] text-gray-500 mb-1.5">Selected for merge:</p>
                  <div className="flex flex-wrap gap-1">
                    {mergeTargets.map((symbol) => (
                      <span
                        key={symbol}
                        className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs"
                      >
                        {symbol}
                        <button
                          onClick={() => toggleMergeTarget(symbol)}
                          className="hover:text-blue-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <SimilarReportsGrid
                similar={similar}
                loading={similarLoading}
                error={similarError}
                onMerge={toggleMergeTarget}
                onCompare={(targetSymbol) => {
                  prefillPrompt(`Compare reports ${report.symbol} and ${targetSymbol}. Highlight key differences in scope, recommendations, and data.`);
                }}
                mergeTargets={mergeTargets}
                currentSymbol={report.symbol}
                defaultVisible={4}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
