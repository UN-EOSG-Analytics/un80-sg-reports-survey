"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Loader2, ChevronUp, ChevronDown, Filter, X, Search, ChevronRight, Clock, Layers, Plus, Check, Minus } from "lucide-react";
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
  yearRange: { min: number; max: number };
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
  yearRange: [number, number] | null; // [min, max] or null for no filter
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
// All: Symbol, Title, Entity, Body, Year, Subjects, Frequency, Feedback (no actions)
// My: Actions(36px), Symbol, Title, Entity, Body, Year, Subjects, Frequency, Feedback
// Suggested: Actions(36px), Symbol, Title, Entity, Body, Year, Subjects, Frequency (no feedback)
const GRID_COLS_ALL = "grid-cols-[120px_1fr_100px_75px_65px_120px_100px_85px]";
const GRID_COLS_MY = "grid-cols-[36px_120px_1fr_100px_75px_65px_120px_100px_85px]";
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

// Year range slider filter (dual-handle)
function YearRangeFilter({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: [number, number] | null;
  onChange: (range: [number, number] | null) => void;
}) {
  const [localRange, setLocalRange] = useState<[number, number]>(value || [min, max]);
  const isActive = value !== null;
  
  useEffect(() => {
    if (value) setLocalRange(value);
    else setLocalRange([min, max]);
  }, [value, min, max]);

  const handleApply = () => {
    if (localRange[0] === min && localRange[1] === max) onChange(null);
    else onChange(localRange);
  };

  const leftPercent = ((localRange[0] - min) / (max - min)) * 100;
  const rightPercent = ((localRange[1] - min) / (max - min)) * 100;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
            isActive ? "bg-un-blue text-white" : "text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          }`}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">{localRange[0]}</span>
            <span className="text-gray-400">–</span>
            <span className="font-medium text-gray-700">{localRange[1]}</span>
          </div>
          <div className="relative h-6 flex items-center">
            {/* Track background */}
            <div className="absolute h-1.5 w-full bg-gray-200 rounded" />
            {/* Active track */}
            <div
              className="absolute h-1.5 bg-un-blue rounded"
              style={{ left: `${leftPercent}%`, right: `${100 - rightPercent}%` }}
            />
            {/* Min slider */}
            <input
              type="range"
              min={min}
              max={max}
              value={localRange[0]}
              onChange={(e) => setLocalRange([Math.min(Number(e.target.value), localRange[1] - 1), localRange[1]])}
              className="absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-un-blue [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-un-blue [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:cursor-pointer"
            />
            {/* Max slider */}
            <input
              type="range"
              min={min}
              max={max}
              value={localRange[1]}
              onChange={(e) => setLocalRange([localRange[0], Math.max(Number(e.target.value), localRange[0] + 1)])}
              className="absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-un-blue [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-un-blue [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:cursor-pointer"
            />
          </div>
          <div className="flex gap-2">
            {isActive && (
              <Button variant="ghost" size="sm" className="flex-1 h-8" onClick={() => onChange(null)}>
                Clear
              </Button>
            )}
            <Button size="sm" className="flex-1 h-8" onClick={handleApply}>
              Apply
            </Button>
          </div>
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
  const showFeedback = mode === "all" || mode === "my";
  const showActions = mode === "my" || mode === "suggested";
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
        {filterOptions?.yearRange && (
          <YearRangeFilter
            min={filterOptions.yearRange.min}
            max={filterOptions.yearRange.max}
            value={filters.yearRange}
            onChange={(v) => onFilterChange({ ...filters, yearRange: v })}
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
      {showFeedback && (
        <div className="flex items-center gap-1">
          <span>Feedback</span>
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
  const showFeedback = mode === "all" || mode === "my";
  const showActions = mode === "my" || mode === "suggested";
  const gridCols = mode === "all" ? GRID_COLS_ALL : mode === "my" ? GRID_COLS_MY : GRID_COLS_SUGGESTED;
  
  return (
    <div
      className={`grid ${gridCols} items-center gap-x-4 px-4 py-3 text-sm border-b transition-colors cursor-pointer ${
        isSelected ? "bg-blue-50 border-l-2 border-l-un-blue" : "hover:bg-gray-50"
      }`}
      onClick={onSelect}
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
                <span className="inline-flex items-center justify-center w-6 h-6 text-green-600 bg-green-50 rounded-full">
                  <Check className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <span className="text-xs">Already in {entity}&apos;s reports</span>
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
      <div className="truncate text-gray-700" title={report.title}>
        {report.title || <span className="text-gray-400 italic">No title</span>}
      </div>

      {/* Entity */}
      <div className="overflow-hidden">
        <EntityBadges
          suggestions={report.suggestions}
          confirmedEntities={report.confirmedEntities}
          maxVisible={2}
          size="xs"
        />
      </div>

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
        {report.frequency ? (
          <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
            report.frequency === "One-time"
              ? "bg-gray-100 text-gray-500"
              : "bg-blue-100 text-blue-700"
          }`}>
            {report.frequency}
          </span>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </div>

      {/* Feedback - only shown for mode="all" or mode="my" */}
      {showFeedback && (
        <div className="flex items-center gap-1">
          {surveyResponse ? (
            <>
              <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                surveyResponse.status === "continue"
                  ? "bg-green-100 text-green-700"
                  : surveyResponse.status === "merge"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"
              }`}>
                {surveyResponse.status === "continue" ? "Continue" : 
                 surveyResponse.status === "merge" ? "Merge" : "Disc."}
              </span>
              {surveyResponse.frequency && surveyResponse.frequency !== "keep" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 cursor-default">
                      <Clock className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Frequency: {surveyResponse.frequency}
                  </TooltipContent>
                </Tooltip>
              )}
              {surveyResponse.format && surveyResponse.format !== "keep" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-100 text-purple-600 cursor-default">
                      <Layers className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Format: {surveyResponse.format}
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          ) : (
            <span className="text-gray-300 text-xs">—</span>
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
        const response = await fetch(`/api/documents/search?q=${encodeURIComponent(searchQuery)}`);
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
          placeholder="Search by symbol or title to add a report..."
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
        <div className="absolute left-4 right-4 mt-1 bg-white border rounded-lg shadow-lg z-50 p-3 text-center text-sm text-gray-500">
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
  showAddSearch?: boolean;  // Show inline search row at bottom (for mode=my)
  onReportAdded?: (report: ReportGroup) => void;  // Callback when report added (for mode=suggested)
  onReportRemoved?: (report: ReportGroup) => void;  // Callback when report removed (for mode=my)
  className?: string;
}

// Backward compatibility alias
export interface SGReportsListProps extends Omit<ReportsTableProps, 'mode'> {}

export function ReportsTable({ 
  mode = "all", 
  entity, 
  userEntity, 
  showAddSearch,
  onReportAdded,
  onReportRemoved,
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
    yearRange: null,
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
    if (filters.yearRange) {
      params.set("filterYearMin", String(filters.yearRange[0]));
      params.set("filterYearMax", String(filters.yearRange[1]));
    }
    filters.frequencies.forEach((f) => params.append("filterFrequency", f));
    filters.subjects.forEach((s) => params.append("filterSubject", s));
    // Entity filter (supports multiple)
    effectiveEntityFilters.forEach((e) => params.append("filterEntity", e));
    // Report type filter
    filters.reportTypes.forEach((t) => params.append("filterReportType", t));

    fetch(`/api/sg-reports?${params.toString()}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [page, filters, effectiveEntityFilters, mode, entity]);

  // The effective entity to use for add/remove operations
  const effectiveEntity = entity || userEntity;

  // Add report to user's confirmed reports
  const handleAddReport = useCallback(async (report: ReportGroup) => {
    if (!effectiveEntity || addingReport) return;
    
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
        onReportAdded?.(report);
        // Refetch to get updated data
        fetchData();
      } else {
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
  }, [effectiveEntity, addingReport, fetchData, onReportAdded]);

  // Remove report from user's confirmed reports
  const handleRemoveReport = useCallback(async (report: ReportGroup) => {
    if (!effectiveEntity || removingReport) return;
    
    setRemovingReport(report.title);
    
    try {
      const response = await fetch(`/api/entity-confirmations?properTitle=${encodeURIComponent(report.title)}&entity=${encodeURIComponent(effectiveEntity)}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        onReportRemoved?.(report);
        // Refetch to get updated data
        fetchData();
      }
    } catch (error) {
      console.error("Failed to remove report:", error);
    } finally {
      setRemovingReport(null);
    }
  }, [effectiveEntity, removingReport, fetchData, onReportRemoved]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    filters.yearRange !== null ||
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

        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        
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
                yearRange: null,
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
          <div className="px-4 py-8 text-center text-gray-400">
            No reports found
          </div>
        )}
      </div>

      {/* Add Report Search - for My Reports mode */}
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
