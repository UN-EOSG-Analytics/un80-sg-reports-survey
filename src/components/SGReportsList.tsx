"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Loader2, ChevronUp, ChevronDown, Filter, X, Search, ChevronRight, Clock, Layers, Plus, Check, Minus, ArrowRight, Play, GitMerge, XCircle, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ReportSidebar, ReportGroup, SubjectCount, EntitySuggestion, EntityConfirmation } from "@/components/ReportSidebar";
import { EntityBadges } from "@/components/EntityBadges";
import { FrequencyBadge } from "@/components/FrequencyBadge";

interface Version {
  symbol: string;
  year: number | null;
  publicationDate: string | null;
  recordNumber: string | null;
  wordCount: number | null;
}

interface CountItem {
  value: string;
  count: number;
}

interface FilterOptions {
  bodies: CountItem[];
  years: number[];
  frequencies: string[];
  entities: CountItem[];
  reportTypes: CountItem[];
}

interface APIResponse {
  reports: (ReportGroup & { reportType?: string })[];
  total: number;
  page: number;
  limit: number;
  filterOptions: FilterOptions;
  subjectCounts: SubjectCount[];
}

interface Filters {
  search: string; // Unified search for symbol OR title
  symbol: string;
  title: string;
  bodies: string[];
  years: number[]; // Selected years (2023, 2024, 2025)
  frequencies: string[];
  subjects: string[];
  entities: string[]; // Filter by reporting entities
  reportTypes: string[]; // Filter by report type (Report/Note/Other)
}

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

function abbreviateBody(body: string | null): string | null {
  if (!body) return null;
  // Check for known abbreviations first
  if (BODY_ABBREVS[body]) return BODY_ABBREVS[body];
  // Fallback: first letter of each word
  return body
    .split(/\s+/)
    .map((word) => word[0]?.toUpperCase())
    .filter(Boolean)
    .join("");
}

type SortColumn = "symbol" | "title" | "subjects" | "entity" | "body" | "year" | "frequency";
type SortDirection = "asc" | "desc";

// Grid columns vary by mode:
// All: Symbol, Title, Entity, Body, Year, Subjects, Frequency, Survey (no actions)
// My: Actions(36px), Symbol, Title, Body, Year, Subjects, Frequency, Survey (no entity - it's the user's)
// Suggested: Actions(36px), Symbol, Title, Entity, Body, Year, Subjects, Frequency (no survey)
const GRID_COLS_ALL = "grid-cols-[120px_1fr_100px_75px_65px_120px_90px_150px]";
const GRID_COLS_MY = "grid-cols-[36px_120px_1fr_75px_65px_100px_80px_150px]";
const GRID_COLS_SUGGESTED = "grid-cols-[36px_120px_1fr_100px_75px_65px_120px_100px]";

// Convert string to Title Case
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function SortArrow({
  column,
  sortColumn,
  sortDirection,
  onSort,
}: {
  column: SortColumn;
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}) {
  const isActive = sortColumn === column;
  return (
    <button
      onClick={() => onSort(column)}
      className="hover:text-gray-600 transition-colors"
    >
      {isActive ? (
        sortDirection === "asc" ? (
          <ChevronUp className="h-3.5 w-3.5 text-un-blue" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-un-blue" />
        )
      ) : (
        <ChevronDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </button>
  );
}

// Filter popover with counts (pill-style like subjects)
function CountFilterPopover({
  options,
  selected,
  onChange,
  label,
}: {
  options: CountItem[];
  selected: string[];
  onChange: (values: string[]) => void;
  label?: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  
  const filtered = useMemo(() => {
    if (!searchQuery) return options;
    const q = searchQuery.toLowerCase();
    return options.filter((o) => o.value.toLowerCase().includes(q));
  }, [options, searchQuery]);

  const toggleOption = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
            selected.length > 0
              ? "bg-un-blue text-white"
              : "text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          }`}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          {options.length > 8 && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder={`Search ${label || "options"}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-sm pl-7"
              />
            </div>
          )}
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <X className="h-3 w-3" /> Clear {selected.length} selected
            </button>
          )}
          <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
            {filtered.map(({ value, count }) => (
              <button
                key={value}
                onClick={() => toggleOption(value)}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  selected.includes(value)
                    ? "bg-un-blue text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <span>{value}</span>
                <span className={`text-[9px] ${selected.includes(value) ? "text-blue-200" : "text-gray-400"}`}>
                  {count}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-gray-400 py-2">No options found</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Simple frequency filter (no counts, just list)
function FrequencyFilterPopover({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const toggleOption = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
            selected.length > 0
              ? "bg-un-blue text-white"
              : "text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          }`}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1">
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="mb-2 flex w-full items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <X className="h-3 w-3" /> Clear filter
            </button>
          )}
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 rounded cursor-pointer text-sm"
            >
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={() => toggleOption(opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Year filter (multi-select for 2023-2025)
function YearFilterPopover({
  options,
  selected,
  onChange,
}: {
  options: number[];
  selected: number[];
  onChange: (values: number[]) => void;
}) {
  const toggleOption = (value: number) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
            selected.length > 0
              ? "bg-un-blue text-white"
              : "text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          }`}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-2" align="start">
        <div className="space-y-1">
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="mb-2 flex w-full items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <X className="h-3 w-3" /> Clear filter
            </button>
          )}
          {options.map((year) => (
            <label
              key={year}
              className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 rounded cursor-pointer text-sm"
            >
              <Checkbox
                checked={selected.includes(year)}
                onCheckedChange={() => toggleOption(year)}
              />
              <span>{year}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
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
    if (countB !== countA) return countB - countA; // Higher count first
    return a.localeCompare(b); // Alphabetical tiebreaker
  });
}

// Sorted subject pills component (DRY for table and sidebar)
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
  const remaining = maxVisible ? sorted.length - maxVisible : 0;

  if (sorted.length === 0) {
    return <span className="text-gray-300 text-xs">—</span>;
  }

  // If showing all (no maxVisible or showing in tooltip)
  if (!maxVisible) {
    return (
      <div className="flex flex-wrap gap-1">
        {sorted.map((term) => (
          <SubjectPill key={term} subject={term} size={size} />
        ))}
      </div>
    );
  }

  // Table view with tooltip for overflow
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 overflow-hidden cursor-default">
          {visible.map((term) => (
            <SubjectPill key={term} subject={term} size={size} />
          ))}
          {remaining > 0 && (
            <span className="text-[10px] text-gray-400 flex-shrink-0">
              +{remaining}
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

// Single subject pill component (reusable)
function SubjectPill({
  subject,
  count,
  isSelected,
  onClick,
  size = "sm",
}: {
  subject: string;
  count?: number;
  isSelected?: boolean;
  onClick?: () => void;
  size?: "xs" | "sm";
}) {
  const sizeClasses = size === "xs" 
    ? "px-1.5 py-0.5 text-[10px]" 
    : "px-2 py-0.5 text-xs";
  
  const Component = onClick ? "button" : "span";
  
  return (
    <Component
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full font-medium transition-colors whitespace-nowrap ${sizeClasses} ${
        isSelected
          ? "bg-un-blue text-white"
          : onClick
          ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
          : "bg-gray-100 text-gray-600"
      }`}
    >
      <span>{toTitleCase(subject)}</span>
      {count !== undefined && (
        <span className={`text-[9px] ${isSelected ? "text-blue-200" : "text-gray-400"}`}>
          {count}
        </span>
      )}
    </Component>
  );
}

// Subject filter popover with search and pills
function SubjectFilterPopover({
  subjects,
  selectedSubjects,
  onToggle,
}: {
  subjects: SubjectCount[];
  selectedSubjects: string[];
  onToggle: (subject: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Filter subjects by search (count > 1 already filtered on backend)
  const filteredSubjects = useMemo(() => {
    if (!searchQuery) return subjects;
    const query = searchQuery.toLowerCase();
    return subjects.filter((s) => s.subject.toLowerCase().includes(query));
  }, [subjects, searchQuery]);
  
  const DEFAULT_VISIBLE = 20;
  const visibleSubjects = isExpanded 
    ? filteredSubjects 
    : filteredSubjects.slice(0, DEFAULT_VISIBLE);
  const hasMore = filteredSubjects.length > DEFAULT_VISIBLE;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
            selectedSubjects.length > 0
              ? "bg-un-blue text-white"
              : "text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          }`}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search subjects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-sm pl-7"
            />
          </div>
          
          {/* Clear button */}
          {selectedSubjects.length > 0 && (
            <button
              onClick={() => selectedSubjects.forEach((s) => onToggle(s))}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <X className="h-3 w-3" /> Clear {selectedSubjects.length} selected
            </button>
          )}
          
          {/* Pills */}
          <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
            {visibleSubjects.map(({ subject, count }) => (
              <SubjectPill
                key={subject}
                subject={subject}
                count={count}
                isSelected={selectedSubjects.includes(subject)}
                onClick={() => onToggle(subject)}
              />
            ))}
            {filteredSubjects.length === 0 && (
              <p className="text-xs text-gray-400 py-2">No subjects found</p>
            )}
          </div>
          
          {/* Show more/less */}
          {hasMore && !searchQuery && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              {isExpanded ? (
                "Show less"
              ) : (
                <>
                  +{filteredSubjects.length - DEFAULT_VISIBLE} more
                  <ChevronRight className="h-3 w-3" />
                </>
              )}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}


function ColumnHeaders({
  sortColumn,
  sortDirection,
  onSort,
  filterOptions,
  filters,
  onFilterChange,
  subjectCounts,
  mode = "all",
}: {
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  filterOptions: FilterOptions | null;
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  subjectCounts: SubjectCount[];
  mode?: ReportsTableMode;
}) {
  const showFeedbackColumn = mode === "all" || mode === "my";
  const showActions = mode === "my" || mode === "suggested";
  const showEntityColumn = mode !== "my";  // Hide entity column in "my" mode
  const gridCols = mode === "all" ? GRID_COLS_ALL : mode === "my" ? GRID_COLS_MY : GRID_COLS_SUGGESTED;
  
  return (
    <div
      className={`grid ${gridCols} items-center gap-x-4 px-4 py-2 text-[10px] font-medium tracking-wider text-gray-400 uppercase bg-gray-50 border-b`}
    >
      {/* Empty column for actions - only for my/suggested */}
      {showActions && <div></div>}
      <div className="flex items-center gap-1">
        <span>Symbol</span>
        <SortArrow column="symbol" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      </div>
      <div className="flex items-center gap-1">
        <span>Title</span>
        <SortArrow column="title" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      </div>
      {showEntityColumn && (
        <div className="flex items-center gap-1">
          <span>Entity</span>
          {filterOptions?.entities && filterOptions.entities.length > 0 && (
            <CountFilterPopover
              options={filterOptions.entities}
              selected={filters.entities}
              onChange={(v) => onFilterChange({ ...filters, entities: v })}
              label="entities"
            />
          )}
          <SortArrow column="entity" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
        </div>
      )}
      <div className="flex items-center gap-1">
        <span>Body</span>
        {filterOptions?.bodies && filterOptions.bodies.length > 0 && (
          <CountFilterPopover
            options={filterOptions.bodies}
            selected={filters.bodies}
            onChange={(v) => onFilterChange({ ...filters, bodies: v })}
            label="bodies"
          />
        )}
        <SortArrow column="body" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      </div>
      <div className="flex items-center gap-1">
        <span>Year</span>
        {filterOptions?.years && filterOptions.years.length > 0 && (
          <YearFilterPopover
            options={filterOptions.years}
            selected={filters.years}
            onChange={(v) => onFilterChange({ ...filters, years: v })}
          />
        )}
        <SortArrow column="year" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      </div>
      <div className="flex items-center gap-1">
        <span>Subjects</span>
        {subjectCounts.length > 0 && (
          <SubjectFilterPopover
            subjects={subjectCounts}
            selectedSubjects={filters.subjects}
            onToggle={(subject) => {
              const newSubjects = filters.subjects.includes(subject)
                ? filters.subjects.filter((s) => s !== subject)
                : [...filters.subjects, subject];
              onFilterChange({ ...filters, subjects: newSubjects });
            }}
          />
        )}
      </div>
      <div className="flex items-center gap-1">
        <span>Frequency</span>
        {filterOptions?.frequencies && filterOptions.frequencies.length > 0 && (
          <FrequencyFilterPopover
            options={filterOptions.frequencies}
            selected={filters.frequencies}
            onChange={(v) => onFilterChange({ ...filters, frequencies: v })}
          />
        )}
        <SortArrow column="frequency" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      </div>
      {showFeedbackColumn && (
        <div className="flex items-center gap-1 justify-end">
          <span>Survey</span>
        </div>
      )}
    </div>
  );
}

// Build ODS PDF link from record number
// Example: N2518639 → https://documents.un.org/doc/undoc/gen/n25/186/39/pdf/n2518639.pdf
function buildODSLink(recordNumber: string | null): string | null {
  if (!recordNumber) return null;
  // Extract numeric part (e.g., "N2518639" → "2518639")
  const num = recordNumber.replace(/\D/g, "");
  if (num.length < 7) return null;
  // Format: first 2 digits, next 3, next 2 → n25/186/39
  const pathFormatted = `n${num.slice(0, 2)}/${num.slice(2, 5)}/${num.slice(5, 7)}`;
  // PDF filename is the full number with 'n' prefix
  const pdfName = `n${num}`;
  return `https://documents.un.org/doc/undoc/gen/${pathFormatted}/pdf/${pdfName}.pdf`;
}

// Build Digital Library search link from symbol
function buildDLLink(symbol: string): string {
  return `https://digitallibrary.un.org/search?ln=en&p=${encodeURIComponent(symbol)}&f=&c=Resource%20Type&c=UN%20Bodies&sf=&so=d&rg=50&fti=0`;
}


function ReportRow({
  report,
  isSelected,
  onSelect,
  subjectCounts,
  surveyResponse,
  mode = "all",
  entity,
  onAdd,
  onRemove,
  isConfirmedByEntity,
}: {
  report: ReportGroup;
  isSelected: boolean;
  onSelect: () => void;
  subjectCounts: SubjectCount[];
  surveyResponse?: { status: string; frequency: string | null; format: string | null };
  mode?: ReportsTableMode;
  entity?: string;
  onAdd?: (report: ReportGroup) => void;
  onRemove?: (report: ReportGroup) => void;
  isConfirmedByEntity?: boolean;
}) {
  const showActions = mode === "my" || mode === "suggested";
  const showEntityColumn = mode !== "my";  // Hide entity column in "my" mode
  const gridCols = mode === "all" ? GRID_COLS_ALL : mode === "my" ? GRID_COLS_MY : GRID_COLS_SUGGESTED;
  
  // Gray out confirmed reports in suggested mode
  const isGrayedOut = mode === "suggested" && isConfirmedByEntity;
  
  // Format title for display (remove trailing colons and trim)
  const displayTitle = report.title?.replace(/\s*:\s*$/, "").trim() || null;
  
  return (
    <div
      className={`grid ${gridCols} items-center gap-x-4 px-4 py-3 text-sm border-b ${
        isSelected ? "bg-blue-50 border-l-2 border-l-un-blue cursor-pointer" : isGrayedOut ? "bg-gray-50/80 opacity-50" : "hover:bg-gray-50 cursor-pointer"
      }`}
      onClick={isGrayedOut ? undefined : onSelect}
    >
      {/* Actions - first column, only for my/suggested modes */}
      {showActions && (
        <div className="flex items-center justify-center">
          {mode === "suggested" && !isConfirmedByEntity && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd?.(report);
                  }}
                  className="inline-flex items-center justify-center w-6 h-6 text-un-blue hover:bg-blue-100 rounded-full border border-un-blue transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <span className="text-xs">Add to {entity}&apos;s reports</span>
              </TooltipContent>
            </Tooltip>
          )}
          {mode === "suggested" && isConfirmedByEntity && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove?.(report);
                  }}
                  className="inline-flex items-center justify-center w-6 h-6 text-green-600 bg-green-50 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <span className="text-xs">Remove from {entity}&apos;s reports</span>
              </TooltipContent>
            </Tooltip>
          )}
          {mode === "my" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove?.(report);
                  }}
                  className="inline-flex items-center justify-center w-6 h-6 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full border border-gray-300 hover:border-red-300 transition-colors"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <span className="text-xs">Remove from {entity}&apos;s reports</span>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {/* Symbol */}
      <div className="flex items-center">
        <span
          className="inline-block rounded bg-blue-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-un-blue truncate max-w-[120px]"
          title={report.symbol}
        >
          {report.symbol.length > 14
            ? `${report.symbol.slice(0, 14)}…`
            : report.symbol}
        </span>
      </div>

      {/* Title */}
      <div className="truncate text-gray-700" title={displayTitle || undefined}>
        {displayTitle || <span className="text-gray-400 italic">No title</span>}
      </div>

      {/* Entity - hidden in "my" mode */}
      {showEntityColumn && (
        <div className="overflow-hidden">
          <EntityBadges
            suggestions={report.confirmedEntities && report.confirmedEntities.length > 0 ? [] : report.suggestions}
            confirmedEntities={report.confirmedEntities}
            maxVisible={2}
            size="xs"
          />
        </div>
      )}

      {/* Body */}
      <div className="text-xs text-gray-500" title={report.body ?? undefined}>
        {abbreviateBody(report.body) ?? "—"}
      </div>

      {/* Year */}
      <div className="text-xs text-gray-600">
        {report.year ?? <span className="text-gray-300">—</span>}
      </div>

      {/* Subjects */}
      <SortedSubjectPills
        subjects={report.subjectTerms || []}
        subjectCounts={subjectCounts}
        maxVisible={2}
        size="xs"
      />

      {/* Frequency */}
      <div>
        <FrequencyBadge
          frequency={report.frequency}
          calculatedFrequency={report.calculatedFrequency}
          confirmedFrequency={report.confirmedFrequency}
          gapHistory={report.gapHistory}
          size="xs"
        />
      </div>

      {/* Survey column - for mode="my" and mode="all" */}
      {(mode === "my" || mode === "all") && (
        <div className="flex items-center justify-end">
          {surveyResponse ? (
            <div className="inline-flex h-7 w-[148px]">
              <span className="inline-flex items-center gap-1.5 rounded-l border border-r-0 border-gray-200 bg-gray-50 px-2.5 text-xs font-medium text-gray-500 flex-1">
                <Check className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">Completed</span>
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-r border flex-shrink-0 ${
                    surveyResponse.status === "continue" && !surveyResponse.frequency && !surveyResponse.format
                      ? "bg-green-50 border-green-200 text-green-600"
                      : surveyResponse.status === "continue"
                      ? "bg-blue-50 border-blue-200 text-blue-600"
                      : surveyResponse.status === "merge"
                      ? "bg-amber-50 border-amber-200 text-amber-600"
                      : "bg-red-50 border-red-200 text-red-600"
                  }`}>
                    {surveyResponse.status === "continue" && !surveyResponse.frequency && !surveyResponse.format ? (
                      <Play className="h-3.5 w-3.5" />
                    ) : surveyResponse.status === "continue" ? (
                      <Pencil className="h-3.5 w-3.5" />
                    ) : surveyResponse.status === "merge" ? (
                      <GitMerge className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {surveyResponse.status === "continue" && !surveyResponse.frequency && !surveyResponse.format
                    ? "Continue as-is"
                    : surveyResponse.status === "continue"
                    ? "Continue with changes"
                    : surveyResponse.status === "merge"
                    ? "Merge with another report"
                    : "Discontinue"}
                </TooltipContent>
              </Tooltip>
            </div>
          ) : isConfirmedByEntity ? (
            <span className="inline-flex items-center justify-center gap-1.5 h-7 w-[148px] rounded border border-blue-200 bg-blue-50 px-3 text-xs font-medium text-un-blue whitespace-nowrap hover:bg-blue-100 transition-colors">
              Go to survey
              <ArrowRight className="h-3 w-3 flex-shrink-0" />
            </span>
          ) : (
            <span className="inline-flex items-center justify-center h-7 w-[148px] rounded border border-gray-200 bg-gray-50 px-3 text-xs text-gray-400 whitespace-nowrap">
              Not completed
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export type ReportsTableMode = "all" | "my" | "suggested";

// =============================================================================
// Add Report Search Component
// =============================================================================

interface SearchResult {
  symbol: string;
  title: string | null;
  body: string | null;
  year: number | null;
}

function AddReportSearch({
  entity,
  onAdd,
  existingTitles,
}: {
  entity: string;
  onAdd: (report: ReportGroup) => void;
  existingTitles: Set<string>;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setResults([]);
      setHighlightedIndex(-1);
      return;
    }

      const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Use /api/reports/search which queries the sg_reports view (SG reports only)
        // not /api/documents/search which queries all documents including resolutions
        const response = await fetch(`/api/reports/search?q=${encodeURIComponent(searchQuery)}`);
        if (response.ok) {
          const data = await response.json();
          // Map properTitle -> title for SearchResult interface
          setResults((data.results || []).map((r: { properTitle: string; symbol: string; body: string | null; year: number | null }) => ({
            symbol: r.symbol,
            title: r.properTitle,
            body: r.body,
            year: r.year,
          })));
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
  }, [searchQuery]);

  // Close results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
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

  const handleAdd = (result: SearchResult) => {
    // Don't add if already exists
    if (result.title && existingTitles.has(result.title)) return;
    
    // Convert SearchResult to ReportGroup format
    const reportGroup: ReportGroup = {
      symbol: result.symbol,
      title: result.title || "",
      body: result.body,
      year: result.year,
      entity: null,
      count: 1,
      latestYear: result.year,
      frequency: null,
      subjectTerms: [],
      suggestions: [],
      confirmedEntities: [],
      versions: [{
        symbol: result.symbol,
        year: result.year,
        publicationDate: null,
        recordNumber: null,
        wordCount: null,
      }],
    };
    onAdd(reportGroup);
    setSearchQuery("");
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
          handleAdd(results[highlightedIndex]);
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
    <div ref={searchRef} className="relative mt-3">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 rounded-lg border border-dashed border-gray-300">
        <Plus className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <input
          type="text"
          placeholder={`Add a report to ${entity}'s list — search by symbol (e.g. A/79/...) or title...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-sm text-gray-600 placeholder:text-gray-400 outline-none"
        />
        {isSearching && (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400 flex-shrink-0" />
        )}
      </div>

      {/* Search Results Dropdown */}
      {showResults && results.length > 0 && (
        <div ref={resultsRef} className="absolute left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {results.map((result, index) => {
            const isAlreadyAdded = result.title && existingTitles.has(result.title);
            const isHighlighted = index === highlightedIndex;
            return (
              <div
                key={result.symbol}
                className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 ${
                  isAlreadyAdded 
                    ? "bg-gray-50" 
                    : isHighlighted 
                    ? "bg-blue-50" 
                    : "hover:bg-blue-50 cursor-pointer"
                }`}
                onClick={() => !isAlreadyAdded && handleAdd(result)}
                onMouseEnter={() => !isAlreadyAdded && setHighlightedIndex(index)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-un-blue">
                      {result.symbol}
                    </span>
                    {result.year && (
                      <span className="text-[10px] text-gray-400">{result.year}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 truncate mt-0.5">
                    {result.title || <span className="italic text-gray-400">No title</span>}
                  </div>
                </div>
                {isAlreadyAdded ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-green-600">
                    <Check className="h-3 w-3" />
                    Added
                  </span>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="inline-flex items-center justify-center w-6 h-6 text-un-blue hover:bg-blue-100 rounded-full border border-un-blue transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdd(result);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <span className="text-xs">Add to {entity}&apos;s reports</span>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showResults && searchQuery.length >= 2 && results.length === 0 && !isSearching && (
        <div className="absolute left-4 right-4 mt-1 bg-white border rounded-lg shadow-lg z-50 p-3 text-sm text-gray-500">
          No reports found
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Reports Table Props
// =============================================================================

interface ReportsTableProps {
  mode?: ReportsTableMode;
  entity?: string;  // Required for mode=my and mode=suggested
  userEntity?: string | null;  // The logged-in user's entity (for permissions)
  userEmail?: string | null;  // The logged-in user's email (for feedback display)
  showAddSearch?: boolean;  // Show inline search row at bottom (for mode=my)
  onDataChanged?: () => void;  // Callback when data changes (report added/removed)
  refetchTrigger?: number;  // Increment to trigger a refetch without remounting
  className?: string;
}

// Backward compatibility alias
export interface SGReportsListProps extends Omit<ReportsTableProps, 'mode'> {}

export function ReportsTable({ 
  mode = "all", 
  entity, 
  userEntity, 
  userEmail,
  showAddSearch,
  onDataChanged,
  refetchTrigger,
  className,
}: ReportsTableProps) {
  const [data, setData] = useState<APIResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportGroup | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    symbol: "",
    title: "",
    bodies: [],
    years: [],
    frequencies: [],
    subjects: [],
    entities: [],
    reportTypes: [],
  });
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [surveyResponses, setSurveyResponses] = useState<Record<string, { status: string; frequency: string | null; format: string | null }>>({});
  
  // Local state for optimistic updates on entity confirmations
  const [locallyConfirmed, setLocallyConfirmed] = useState<Set<string>>(new Set());
  const [addingReport, setAddingReport] = useState<string | null>(null);
  const [removingReport, setRemovingReport] = useState<string | null>(null);

  // Debounced text inputs
  const [searchInput, setSearchInput] = useState("");
  
  // Fetch user's survey responses
  useEffect(() => {
    fetch("/api/survey-responses/my-responses")
      .then((r) => r.json())
      .then((data) => setSurveyResponses(data.responses || {}))
      .catch(() => {});
  }, []);

  const limit = 50;

  // Entity filter from filters
  const effectiveEntityFilters = useMemo(() => {
    return filters.entities;
  }, [filters.entities]);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    // Mode and entity for filtered views
    if (mode !== "all") {
      params.set("mode", mode);
      if (entity) params.set("entity", entity);
    }

    // Unified search
    if (filters.search) params.set("filterSearch", filters.search);
    // Legacy filters (kept for compatibility)
    if (filters.symbol) params.set("filterSymbol", filters.symbol);
    if (filters.title) params.set("filterTitle", filters.title);
    
    filters.bodies.forEach((b) => params.append("filterBody", b));
    filters.years.forEach((y) => params.append("filterYear", String(y)));
    filters.frequencies.forEach((f) => params.append("filterFrequency", f));
    filters.subjects.forEach((s) => params.append("filterSubject", s));
    // Entity filter (supports multiple)
    effectiveEntityFilters.forEach((e) => params.append("filterEntity", e));
    // Report type filter
    filters.reportTypes.forEach((t) => params.append("filterReportType", t));

    fetch(`/api/sg-reports?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setData(data);
        // Clear optimistic state when fresh data arrives
        setLocallyConfirmed(new Set());
      })
      .finally(() => setLoading(false));
  }, [page, filters, effectiveEntityFilters, mode, entity]);

  // The effective entity to use for add/remove operations
  const effectiveEntity = entity || userEntity;

  // Add report to user's confirmed reports
  const handleAddReport = useCallback(async (report: ReportGroup) => {
    if (!effectiveEntity) {
      console.error("Cannot add report: no entity selected");
      return;
    }
    if (addingReport) return;
    
    setAddingReport(report.title);
    // Optimistic update
    setLocallyConfirmed((prev) => new Set(prev).add(report.title));
    
    try {
      const response = await fetch("/api/entity-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          properTitle: report.title,
          entity: effectiveEntity,
        }),
      });
      
      if (response.ok) {
        onDataChanged?.();
        // Refetch to get updated data
        fetchData();
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Failed to add report:", errorData.error || response.statusText);
        // Revert optimistic update on error
        setLocallyConfirmed((prev) => {
          const next = new Set(prev);
          next.delete(report.title);
          return next;
        });
      }
    } catch (error) {
      console.error("Failed to add report:", error);
      // Revert optimistic update
      setLocallyConfirmed((prev) => {
        const next = new Set(prev);
        next.delete(report.title);
        return next;
      });
    } finally {
      setAddingReport(null);
    }
  }, [effectiveEntity, addingReport, fetchData, onDataChanged]);

  // Remove report from user's confirmed reports
  const handleRemoveReport = useCallback(async (report: ReportGroup) => {
    if (!effectiveEntity) {
      console.error("Cannot remove report: no entity selected");
      return;
    }
    if (removingReport) return;
    
    setRemovingReport(report.title);
    
    try {
      const response = await fetch(`/api/entity-confirmations?properTitle=${encodeURIComponent(report.title)}&entity=${encodeURIComponent(effectiveEntity)}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        onDataChanged?.();
        // Refetch to get updated data
        fetchData();
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Failed to remove report:", errorData.error || response.statusText);
      }
    } catch (error) {
      console.error("Failed to remove report:", error);
    } finally {
      setRemovingReport(null);
    }
  }, [effectiveEntity, removingReport, fetchData, onDataChanged]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch when external trigger changes (but not on initial mount)
  const refetchTriggerRef = useRef(refetchTrigger);
  useEffect(() => {
    if (refetchTrigger !== refetchTriggerRef.current) {
      refetchTriggerRef.current = refetchTrigger;
      fetchData();
    }
  }, [refetchTrigger, fetchData]);

  // Debounce text filters
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        setFilters((f) => ({ ...f, search: searchInput }));
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortColumn(null);
        setSortDirection("asc");
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Sort reports client-side
  const sortedReports = useMemo(() => {
    if (!data?.reports || !sortColumn) return data?.reports || [];

    return [...data.reports].sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case "symbol":
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case "title":
          const titleA = a.title || "";
          const titleB = b.title || "";
          if (!titleA && titleB) return sortDirection === "asc" ? 1 : -1;
          if (titleA && !titleB) return sortDirection === "asc" ? -1 : 1;
          comparison = titleA.localeCompare(titleB);
          break;
        case "entity":
          const entityA = a.entity || "";
          const entityB = b.entity || "";
          if (!entityA && entityB) return sortDirection === "asc" ? 1 : -1;
          if (entityA && !entityB) return sortDirection === "asc" ? -1 : 1;
          comparison = entityA.localeCompare(entityB);
          break;
        case "body":
          const bodyA = a.body || "";
          const bodyB = b.body || "";
          if (!bodyA && bodyB) return sortDirection === "asc" ? 1 : -1;
          if (bodyA && !bodyB) return sortDirection === "asc" ? -1 : 1;
          comparison = bodyA.localeCompare(bodyB);
          break;
        case "year":
          if (a.year === null && b.year !== null)
            return sortDirection === "asc" ? 1 : -1;
          if (a.year !== null && b.year === null)
            return sortDirection === "asc" ? -1 : 1;
          if (a.year === null && b.year === null) return 0;
          comparison = (a.year ?? 0) - (b.year ?? 0);
          break;
        case "frequency":
          const freqA = a.frequency || "";
          const freqB = b.frequency || "";
          if (!freqA && freqB) return sortDirection === "asc" ? 1 : -1;
          if (freqA && !freqB) return sortDirection === "asc" ? -1 : 1;
          comparison = freqA.localeCompare(freqB);
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [data?.reports, sortColumn, sortDirection]);

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  const hasActiveFilters =
    filters.search ||
    filters.symbol ||
    filters.title ||
    filters.bodies.length > 0 ||
    filters.years.length > 0 ||
    filters.frequencies.length > 0 ||
    filters.subjects.length > 0 ||
    filters.entities.length > 0 ||
    filters.reportTypes.length > 0;

  if (loading && !data)
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-un-blue" />
      </div>
    );

  return (
    <div className="space-y-4">
      {/* Search filters */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by symbol or title..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 text-sm pl-9 w-96"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput("");
              setFilters({
                search: "",
                symbol: "",
                title: "",
                bodies: [],
                years: [],
                frequencies: [],
                subjects: [],
                entities: [],
                reportTypes: [],
              });
              setPage(1);
            }}
            className="h-8 text-xs text-gray-500"
          >
            Clear all filters
          </Button>
        )}
        
        {/* Right-aligned count */}
        <p className="text-sm text-gray-500 ml-auto">
          {data?.total} report series
          {hasActiveFilters && " (filtered)"}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <ColumnHeaders
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          filterOptions={data?.filterOptions || null}
          filters={filters}
          onFilterChange={(newFilters) => {
            setFilters(newFilters);
            setPage(1);
          }}
          subjectCounts={data?.subjectCounts || []}
          mode={mode}
        />

        <div className="divide-y divide-gray-100">
          {sortedReports.map((r) => (
            <ReportRow
              key={r.symbol}
              report={r}
              isSelected={selectedReport?.symbol === r.symbol}
              onSelect={() => setSelectedReport(r)}
              subjectCounts={data?.subjectCounts || []}
              surveyResponse={surveyResponses[r.title]}
              mode={mode}
              entity={entity || userEntity || undefined}
              onAdd={handleAddReport}
              onRemove={handleRemoveReport}
              isConfirmedByEntity={
                locallyConfirmed.has(r.title) || 
                Boolean((entity || userEntity) && r.confirmedEntities?.includes(entity || userEntity || ''))
              }
            />
          ))}
        </div>

        {sortedReports.length === 0 && (
          <div className="px-4 py-8 text-center">
            {mode === "my" ? (
              <div className="space-y-2">
                <p className="text-gray-500">No reports added yet</p>
                <p className="text-sm text-gray-400">Use the search below to add reports, or add from the suggested reports section.</p>
              </div>
            ) : mode === "suggested" ? (
              <div className="space-y-2">
                <p className="text-gray-500">No additional suggestions</p>
                <p className="text-sm text-gray-400">All suggested reports have been added to your list or there are no more matches.</p>
              </div>
            ) : hasActiveFilters ? (
              <p className="text-gray-400">No reports match your filters</p>
            ) : (
              <p className="text-gray-400">No reports found</p>
            )}
          </div>
        )}
      </div>

      {/* Add Report Search - for entity reports mode */}
      {mode === "my" && showAddSearch && effectiveEntity && (
        <AddReportSearch 
          entity={effectiveEntity} 
          onAdd={handleAddReport}
          existingTitles={new Set(sortedReports.map(r => r.title))}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-600">
            {((page - 1) * limit) + 1}–{Math.min(page * limit, data?.total || 0)} of {data?.total || 0}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
          >
            Next
          </Button>
        </div>
      )}

      {/* Sidebar */}
      <ReportSidebar
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        subjectCounts={data?.subjectCounts || []}
        userEntity={userEntity}
        userEmail={userEmail}
        onDataChanged={onDataChanged}
        onSave={() => {
          // Refetch survey responses after save
          fetch("/api/survey-responses/my-responses")
            .then((r) => r.json())
            .then((data) => setSurveyResponses(data.responses || {}))
            .catch(() => {});
        }}
      />
    </div>
  );
}

// Backward compatibility alias for SGReportsList
export function SGReportsList(props: SGReportsListProps) {
  return <ReportsTable mode="all" {...props} />;
}
