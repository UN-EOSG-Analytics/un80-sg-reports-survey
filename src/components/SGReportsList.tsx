"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, ChevronUp, ChevronDown, Filter, X, FileText, Search, ChevronRight, Check, ChevronsUpDown, Clock, Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Version {
  symbol: string;
  year: number | null;
  publicationDate: string | null;
  recordNumber: string | null;
  wordCount: number | null;
}

interface ReportGroup {
  title: string;
  symbol: string;
  body: string | null;
  year: number | null;
  entity: string | null;
  entityManual: string | null;
  entityDri: string | null;
  versions: Version[];
  count: number;
  latestYear: number | null;
  frequency: string | null;
  subjectTerms: string[];
}

interface SubjectCount {
  subject: string;
  count: number;
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
}

interface APIResponse {
  reports: ReportGroup[];
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

// Columns: Symbol, Title, Entity, Body, Year, Subjects, Frequency, Decision
const GRID_COLS = "grid-cols-[120px_1fr_90px_75px_65px_120px_115px_95px]";

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
}: {
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  filterOptions: FilterOptions | null;
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  subjectCounts: SubjectCount[];
}) {
  return (
    <div
      className={`grid ${GRID_COLS} items-center gap-x-4 px-4 py-2 text-[10px] font-medium tracking-wider text-gray-400 uppercase bg-gray-50 border-b`}
    >
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
      <div className="flex items-center gap-1">
        <span>Decision</span>
      </div>
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

// Recommendation types
type RecommendationStatus = "continue" | "merge" | "discontinue" | null;
type FrequencyRecommendation = "annual" | "biennial" | "triennial" | "quadrennial" | "one-time" | null;
type FormatRecommendation = "shorter" | "oral" | "dashboard" | "other" | null;

interface Recommendation {
  status: RecommendationStatus;
  mergeTargets: string[]; // symbols of reports to merge with
  discontinueReason: string;
  frequency: FrequencyRecommendation;
  format: FormatRecommendation;
  formatOther: string;
  comments: string;
}

const FREQUENCY_OPTIONS = [
  { value: "one-time", label: "One-time only" },
  { value: "annual", label: "Annual" },
  { value: "biennial", label: "Biennial (every 2 years)" },
  { value: "triennial", label: "Triennial (every 3 years)" },
  { value: "quadrennial", label: "Quadrennial (every 4 years)" },
];

const FORMAT_OPTIONS = [
  { value: "shorter", label: "Shorter written report" },
  { value: "oral", label: "Oral update only" },
  { value: "dashboard", label: "Dashboard / data format" },
  { value: "other", label: "Other (specify)" },
];

function SelectItemWithCurrent({ value, label, currentValue }: { value: string; label: string; currentValue?: string | null }) {
  const isCurrent = currentValue?.toLowerCase() === value;
  return (
    <SelectItem value={value}>
      <span className="flex justify-between w-full">
        <span>{label}</span>
        {isCurrent && <span className="text-gray-400">current</span>}
      </span>
    </SelectItem>
  );
}

// Compact recommendation form with progressive disclosure
function CompactRecommendationForm({
  report,
  mergeTargets,
  onMergeTargetsChange,
  onSave,
  userEntity,
  loadingExisting,
  recommendation,
  onRecommendationChange,
  saving,
  saveSuccess,
  onSaveClick,
}: {
  report: ReportGroup;
  mergeTargets: string[];
  onMergeTargetsChange: (targets: string[]) => void;
  onSave?: () => void;
  userEntity?: string | null;
  loadingExisting: boolean;
  recommendation: Omit<Recommendation, 'mergeTargets'>;
  onRecommendationChange: <K extends keyof Omit<Recommendation, 'mergeTargets'>>(key: K, value: Omit<Recommendation, 'mergeTargets'>[K]) => void;
  saving: boolean;
  saveSuccess: boolean;
  onSaveClick: () => void;
}) {
  const canEdit = userEntity && report.entity === userEntity;
  
  // Validation logic
  const isFormValid = useMemo(() => {
    if (!recommendation.status) return false;
    
    if (recommendation.status === "continue" || recommendation.status === "merge") {
      if (!recommendation.frequency) return false;
      if (!recommendation.format) return false;
      if (recommendation.format === "other" && !recommendation.formatOther?.trim()) return false;
    }
    
    if (recommendation.status === "merge") {
      if (mergeTargets.length === 0) return false;
    }
    
    if (recommendation.status === "discontinue") {
      if (!recommendation.discontinueReason?.trim()) return false;
    }
    
    return true;
  }, [recommendation, mergeTargets]);

  // Show disabled message if user can't edit
  if (!canEdit) {
    return (
      <div className={`rounded-lg p-3 text-center border text-sm ${!userEntity ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
        {!userEntity ? (
          <p className="text-amber-700">
            <a href="/login" className="font-medium underline hover:text-amber-900">Log in</a> to submit a recommendation.
          </p>
        ) : (
          <p className="text-gray-500">
            {!report.entity ? (
              "No assigned entity."
            ) : (
              <>Only <span className="font-medium text-gray-700">{report.entity}</span> can submit.</>
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main decision dropdown */}
      <Select
        value={recommendation.status ?? undefined}
        onValueChange={(v) => onRecommendationChange("status", v as RecommendationStatus)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="What should happen to this report?" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="continue">Continue reporting</SelectItem>
          <SelectItem value="merge">Merge with another report</SelectItem>
          <SelectItem value="discontinue">Discontinue</SelectItem>
        </SelectContent>
      </Select>

      {/* Progressive disclosure - only show when status is selected */}
      {recommendation.status && (
        <div className="space-y-3 pt-1">
          {/* Merge targets - shown inline as chips when merge selected */}
          {recommendation.status === "merge" && mergeTargets.length > 0 && (
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
          )}

          {/* Discontinue reason */}
          {recommendation.status === "discontinue" && (
            <textarea
              value={recommendation.discontinueReason}
              onChange={(e) => onRecommendationChange("discontinueReason", e.target.value)}
              placeholder="Reason for discontinuation..."
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-un-blue focus:ring-1 focus:ring-un-blue resize-none"
              rows={2}
            />
          )}

          {/* Frequency and format for continue/merge */}
          {(recommendation.status === "continue" || recommendation.status === "merge") && (
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={recommendation.frequency ?? undefined}
                onValueChange={(v) => onRecommendationChange("frequency", v as FrequencyRecommendation)}
              >
                <SelectTrigger className="w-full text-sm h-9">
                  <SelectValue placeholder="Frequency..." />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <SelectItemWithCurrent key={opt.value} value={opt.value} label={opt.label} currentValue={report.frequency} />
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={recommendation.format ?? undefined}
                onValueChange={(v) => onRecommendationChange("format", v as FormatRecommendation)}
              >
                <SelectTrigger className="w-full text-sm h-9">
                  <SelectValue placeholder="Format..." />
                </SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map((opt) => (
                    <SelectItemWithCurrent key={opt.value} value={opt.value} label={opt.label} />
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {recommendation.format === "other" && (
            <Input
              value={recommendation.formatOther}
              onChange={(e) => onRecommendationChange("formatOther", e.target.value)}
              placeholder="Describe the format..."
              className="h-9 text-sm"
            />
          )}

          {/* Comments - compact */}
          <textarea
            value={recommendation.comments}
            onChange={(e) => onRecommendationChange("comments", e.target.value)}
            placeholder="Additional comments (optional)..."
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-un-blue focus:ring-1 focus:ring-un-blue resize-none"
            rows={2}
          />
        </div>
      )}

      {/* Save button - only show when form has content */}
      {recommendation.status && (
        <Button 
          className="w-full h-9" 
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
            "Save Recommendation"
          )}
        </Button>
      )}
    </div>
  );
}

// Resolution info interface
interface ResolutionInfo {
  symbol: string;
  title: string | null;
  date_year: number | null;
}

// Similar reports interface
interface SimilarReport {
  symbol: string;
  title: string;
  year: number | null;
  similarity: number;
  entity: string | null;
}

// Similar reports grid component - cleaner layout
function SimilarReportsGrid({
  similar,
  loading,
  error,
  onMerge,
  mergeTargets,
  showMergeActions,
  defaultVisible = 4,
}: {
  similar: SimilarReport[];
  loading: boolean;
  error: string | null;
  onMerge?: (symbol: string) => void;
  mergeTargets?: string[];
  showMergeActions?: boolean;
  defaultVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Finding similar...
      </div>
    );
  }

  if (error || similar.length === 0) {
    return (
      <p className="text-xs text-gray-400 py-2">
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
            className={`grid grid-cols-[1fr_auto] gap-2 p-2 rounded border transition-colors ${
              isInMerge 
                ? "bg-blue-50 border-blue-200" 
                : "bg-gray-50 border-transparent hover:border-gray-200"
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm text-gray-800 truncate" title={r.title}>
                {r.title}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-gray-500 font-medium">
                  {r.symbol}
                </span>
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
            {showMergeActions && onMerge && (
              <button
                onClick={() => onMerge(r.symbol)}
                className={`self-center flex-shrink-0 w-7 h-7 flex items-center justify-center rounded transition-colors ${
                  isInMerge
                    ? "bg-un-blue text-white"
                    : "bg-white border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300"
                }`}
                title={isInMerge ? "Remove from merge" : "Add to merge"}
              >
                {isInMerge ? <Check className="h-3.5 w-3.5" /> : <span className="text-lg leading-none">+</span>}
              </button>
            )}
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

// Version row component for reuse
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
        {buildODSLink(v.recordNumber) && (
          <a
            href={buildODSLink(v.recordNumber)!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-un-blue bg-blue-50 rounded hover:bg-blue-100 transition-colors"
          >
            <FileText className="h-2.5 w-2.5" />
            PDF
          </a>
        )}
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

// Interactive publication pattern with expandable versions
function InteractivePublicationPattern({ 
  versions, 
  expanded, 
  onToggle 
}: { 
  versions: Version[]; 
  expanded: boolean;
  onToggle: () => void;
}) {
  // Get year range (last 6 years from most recent)
  const years = versions
    .map((v) => v.year)
    .filter((y): y is number => y !== null);
  
  if (years.length === 0) return null;

  const maxYear = Math.max(...years);
  const minDisplayYear = maxYear - 5;
  const displayYears = Array.from({ length: 6 }, (_, i) => minDisplayYear + i);

  // Map versions to year/quarter
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
      {/* Clickable pattern */}
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

      {/* Expandable versions list */}
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

// Get quarter helper (moved outside for reuse)
function getQuarter(publicationDate: string | null): number | null {
  if (!publicationDate) return null;
  const match = publicationDate.match(/^\d{4}-(\d{2})/);
  if (!match) return null;
  const month = parseInt(match[1], 10);
  return Math.ceil(month / 3);
}

// Consolidated sidebar component - single scrollable view
function ReportSidebar({
  report,
  onClose,
  subjectCounts,
  onSave,
  userEntity,
}: {
  report: ReportGroup | null;
  onClose: () => void;
  subjectCounts: SubjectCount[];
  onSave?: () => void;
  userEntity?: string | null;
}) {
  const [similar, setSimilar] = useState<SimilarReport[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [mergeTargets, setMergeTargets] = useState<string[]>([]);
  const [versionsExpanded, setVersionsExpanded] = useState(false);
  const [resolutions, setResolutions] = useState<ResolutionInfo[]>([]);
  const [resolutionsLoading, setResolutionsLoading] = useState(false);
  
  // Form state
  const [recommendation, setRecommendation] = useState<Omit<Recommendation, 'mergeTargets'>>({
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
          // If resolutions not found in DB, show symbols only
          setResolutions(data.based_on_resolution_symbols.map((s: string) => ({ symbol: s, title: null, date_year: null })));
        }
      })
      .catch(() => {})
      .finally(() => setResolutionsLoading(false));
  }, [report?.symbol]);

  // Load existing response when report changes
  useEffect(() => {
    if (!report) return;
    setLoadingExisting(true);
    setSaveSuccess(false);
    fetch(`/api/survey-responses?properTitle=${encodeURIComponent(report.title)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.response) {
          setRecommendation({
            status: data.response.status as RecommendationStatus,
            discontinueReason: data.response.discontinueReason || "",
            frequency: data.response.frequency as FrequencyRecommendation,
            format: data.response.format as FormatRecommendation,
            formatOther: data.response.formatOther || "",
            comments: data.response.comments || "",
          });
          setMergeTargets(data.response.mergeTargets || []);
        } else {
          setRecommendation({
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
  }, [report?.title]);

  const updateRecommendation = useCallback(<K extends keyof Omit<Recommendation, 'mergeTargets'>>(
    key: K,
    value: Omit<Recommendation, 'mergeTargets'>[K]
  ) => {
    setRecommendation((prev) => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
  }, []);

  const toggleMergeTarget = useCallback((symbol: string) => {
    setMergeTargets((prev) => {
      const newTargets = prev.includes(symbol) 
        ? prev.filter((s) => s !== symbol) 
        : [...prev, symbol];
      // Auto-select merge status when adding first target
      if (newTargets.length > 0 && !recommendation.status) {
        setRecommendation((r) => ({ ...r, status: "merge" }));
      }
      return newTargets;
    });
    setSaveSuccess(false);
  }, [recommendation.status]);

  const handleSave = async () => {
    if (!report) return;
    setSaving(true);
    setSaveSuccess(false);
    
    try {
      const response = await fetch("/api/survey-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          properTitle: report.title,
          latestSymbol: report.symbol,
          status: recommendation.status,
          frequency: recommendation.frequency,
          format: recommendation.format,
          formatOther: recommendation.formatOther,
          mergeTargets: mergeTargets,
          discontinueReason: recommendation.discontinueReason,
          comments: recommendation.comments,
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

  const showMergeActions = recommendation.status === "merge" || mergeTargets.length > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-xl z-50 flex flex-col">
        {/* Header - title only */}
        <div className="flex-shrink-0 border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="flex-1 min-w-0 text-sm font-medium text-gray-900 leading-snug line-clamp-2" title={report.title}>
              {report.title}
            </h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-5">
            {/* Metadata pills */}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-block rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-un-blue">
                  {report.symbol}
                </span>
                {report.entity && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 cursor-default">
                        {report.entity}
                      </span>
                    </TooltipTrigger>
                    {(report.entityManual || report.entityDri) && (
                      <TooltipContent>
                        Source: {report.entityManual ? "Manual list" : "DRI"}
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
                {report.body && (
                  <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {abbreviateBody(report.body)}
                  </span>
                )}
                {report.frequency && (
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                    report.frequency === "One-time"
                      ? "bg-gray-100 text-gray-600"
                      : "bg-blue-100 text-blue-700"
                  }`}>
                    {report.frequency}
                  </span>
                )}
              </div>
              {/* Subjects */}
              {report.subjectTerms && report.subjectTerms.length > 0 && (
                <SortedSubjectPills
                  subjects={report.subjectTerms}
                  subjectCounts={subjectCounts}
                  maxVisible={4}
                  size="xs"
                />
              )}
            </div>
            {/* Mandating Resolutions */}
            {(resolutions.length > 0 || resolutionsLoading) && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Based on Resolution{resolutions.length !== 1 ? "s" : ""}
                </h3>
                {resolutionsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {resolutions.map((res) => (
                      <a
                        key={res.symbol}
                        href={buildDLLink(res.symbol)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2 rounded border border-gray-100 bg-gray-50 hover:border-blue-200 hover:bg-blue-50 transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 flex-shrink-0">
                            {res.symbol}
                          </span>
                          {res.date_year && (
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {res.date_year}
                            </span>
                          )}
                        </div>
                        {res.title && (
                          <p className="mt-1 text-sm text-gray-600 line-clamp-2 group-hover:text-gray-800">
                            {res.title}
                          </p>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Publication Pattern - interactive */}
            <div className="bg-gray-50 rounded-lg p-3">
              <InteractivePublicationPattern
                versions={report.versions}
                expanded={versionsExpanded}
                onToggle={() => setVersionsExpanded(!versionsExpanded)}
              />
            </div>

            {/* Decision Form - progressive disclosure */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Your Recommendation
              </h3>
              <CompactRecommendationForm
                report={report}
                mergeTargets={mergeTargets}
                onMergeTargetsChange={setMergeTargets}
                onSave={onSave}
                userEntity={userEntity}
                loadingExisting={loadingExisting}
                recommendation={recommendation}
                onRecommendationChange={updateRecommendation}
                saving={saving}
                saveSuccess={saveSuccess}
                onSaveClick={handleSave}
              />
            </div>

            {/* Similar Reports - structured grid */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Similar Reports {!similarLoading && similar.length > 0 && `(${similar.length})`}
              </h3>
              <SimilarReportsGrid
                similar={similar}
                loading={similarLoading}
                error={similarError}
                onMerge={toggleMergeTarget}
                mergeTargets={mergeTargets}
                showMergeActions={showMergeActions}
                defaultVisible={4}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ReportRow({
  report,
  isSelected,
  onSelect,
  subjectCounts,
  surveyResponse,
}: {
  report: ReportGroup;
  isSelected: boolean;
  onSelect: () => void;
  subjectCounts: SubjectCount[];
  surveyResponse?: { status: string; frequency: string | null; format: string | null };
}) {
  return (
    <div
      className={`grid ${GRID_COLS} items-center gap-x-4 px-4 py-3 text-sm border-b transition-colors cursor-pointer ${
        isSelected ? "bg-blue-50 border-l-2 border-l-un-blue" : "hover:bg-gray-50"
      }`}
      onClick={onSelect}
    >
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
      <div 
        className="text-xs text-gray-600 truncate" 
        title={report.entity ? `${report.entity}${report.entityManual ? ' (manual)' : report.entityDri ? ' (DRI)' : ''}` : undefined}
      >
        {report.entity || <span className="text-gray-300">—</span>}
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

      {/* Decision */}
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
               surveyResponse.status === "merge" ? "Merge" : "Discontinue"}
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
    </div>
  );
}

interface SGReportsListProps {
  userEntity?: string | null;
}

export function SGReportsList({ userEntity }: SGReportsListProps) {
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
  });
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showMyEntityOnly, setShowMyEntityOnly] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("showMyEntityOnly") === "true";
    }
    return false;
  });
  const [surveyResponses, setSurveyResponses] = useState<Record<string, { status: string; frequency: string | null; format: string | null }>>({});

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

  // Determine entity filter: toggle overrides, or use manual filter
  // Memoize to prevent infinite re-fetches
  const effectiveEntityFilters = useMemo(() => {
    return showMyEntityOnly && userEntity ? [userEntity] : filters.entities;
  }, [showMyEntityOnly, userEntity, filters.entities]);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

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

    fetch(`/api/sg-reports?${params.toString()}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [page, filters, effectiveEntityFilters]);

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
    showMyEntityOnly;

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
        
        {/* Entity toggle - next to search */}
        {userEntity && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
            <Switch
              id="my-entity-toggle"
              checked={showMyEntityOnly}
              onCheckedChange={(checked) => {
                setShowMyEntityOnly(checked);
                localStorage.setItem("showMyEntityOnly", String(checked));
                setPage(1);
              }}
            />
            <label 
              htmlFor="my-entity-toggle" 
              className="text-sm text-gray-600 cursor-pointer select-none whitespace-nowrap"
            >
              {userEntity} only
            </label>
          </div>
        )}
        
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput("");
              setShowMyEntityOnly(false);
              localStorage.setItem("showMyEntityOnly", "false");
              setFilters({
                search: "",
                symbol: "",
                title: "",
                bodies: [],
                yearRange: null,
                frequencies: [],
                subjects: [],
                entities: [],
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
            />
          ))}
        </div>

        {sortedReports.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-400">
            No reports found
          </div>
        )}
      </div>

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
