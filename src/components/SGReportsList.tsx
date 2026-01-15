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

interface FilterOptions {
  bodies: string[];
  years: number[];
  frequencies: string[];
  entities: string[];
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
  years: number[];
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
const GRID_COLS = "grid-cols-[150px_1fr_80px_70px_50px_140px_80px_100px]";

// Convert string to Title Case
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function SortableHeader({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
}: {
  column: SortColumn;
  label: string;
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}) {
  const isActive = sortColumn === column;
  return (
    <button
      onClick={() => onSort(column)}
      className="flex items-center gap-0.5 uppercase hover:text-gray-600 transition-colors"
    >
      <span>{label}</span>
      {isActive ? (
        sortDirection === "asc" ? (
          <ChevronUp className="h-2.5 w-2.5" />
        ) : (
          <ChevronDown className="h-2.5 w-2.5" />
        )
      ) : (
        <ChevronDown className="h-2.5 w-2.5 opacity-30 hover:opacity-60" />
      )}
    </button>
  );
}

function FilterPopover({
  options,
  selected,
  onChange,
}: {
  options: (string | number)[];
  selected: (string | number)[];
  onChange: (values: (string | number)[]) => void;
}) {
  const toggleOption = (option: string | number) => {
    if (selected.includes(option)) {
      onChange(selected.filter((v) => v !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
            selected.length > 0
              ? "bg-un-blue text-white"
              : "text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          }`}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 max-h-64 overflow-y-auto" align="start">
        <div className="space-y-1">
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="mb-2 flex w-full items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <X className="h-3 w-3" /> Clear filter
            </button>
          )}
          {options.slice(0, 30).map((option) => (
            <label
              key={String(option)}
              className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 rounded cursor-pointer text-sm"
            >
              <Checkbox
                checked={selected.includes(option)}
                onCheckedChange={() => toggleOption(option)}
              />
              <span className="truncate">{String(option)}</span>
            </label>
          ))}
          {options.length > 30 && (
            <p className="text-xs text-gray-500 px-2">
              +{options.length - 30} more...
            </p>
          )}
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
          className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
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

// Searchable filter popover (for entities, etc.)
function SearchableFilterPopover({
  options,
  selected,
  onChange,
  placeholder = "Search...",
}: {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  
  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const query = searchQuery.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(query));
  }, [options, searchQuery]);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((v) => v !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
            selected.length > 0
              ? "bg-un-blue text-white"
              : "text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          }`}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder={placeholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-sm pl-7"
            />
          </div>
          
          {/* Clear button */}
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <X className="h-3 w-3" /> Clear {selected.length} selected
            </button>
          )}
          
          {/* Options list */}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filteredOptions.map((option) => (
              <label
                key={option}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 rounded cursor-pointer text-sm"
              >
                <Checkbox
                  checked={selected.includes(option)}
                  onCheckedChange={() => toggleOption(option)}
                />
                <span>{option}</span>
              </label>
            ))}
            {filteredOptions.length === 0 && (
              <p className="text-xs text-gray-400 py-2 px-2">No results found</p>
            )}
          </div>
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
      className={`grid ${GRID_COLS} items-center gap-x-3 px-4 py-2 text-[10px] font-medium tracking-wider text-gray-400 uppercase bg-gray-50 border-b`}
    >
      <div className="flex items-center">
        <SortableHeader
          column="symbol"
          label="Symbol"
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={onSort}
        />
      </div>
      <div className="flex items-center">
        <SortableHeader
          column="title"
          label="Title"
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={onSort}
        />
      </div>
      <div className="flex items-center">
        <SortableHeader
          column="entity"
          label="Entity"
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={onSort}
        />
        {filterOptions?.entities && filterOptions.entities.length > 0 && (
          <SearchableFilterPopover
            options={filterOptions.entities}
            selected={filters.entities}
            onChange={(v) => onFilterChange({ ...filters, entities: v })}
            placeholder="Search entities..."
          />
        )}
      </div>
      <div className="flex items-center">
        <SortableHeader
          column="body"
          label="Body"
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={onSort}
        />
        {filterOptions?.bodies && filterOptions.bodies.length > 0 && (
          <FilterPopover
            options={filterOptions.bodies}
            selected={filters.bodies}
            onChange={(v) =>
              onFilterChange({ ...filters, bodies: v as string[] })
            }
          />
        )}
      </div>
      <div className="flex items-center">
        <SortableHeader
          column="year"
          label="Year"
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={onSort}
        />
        {filterOptions?.years && filterOptions.years.length > 0 && (
          <FilterPopover
            options={filterOptions.years}
            selected={filters.years}
            onChange={(v) =>
              onFilterChange({ ...filters, years: v as number[] })
            }
          />
        )}
      </div>
      <div className="flex items-center">
        <span className="uppercase">Subjects</span>
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
      <div className="flex items-center">
        <SortableHeader
          column="frequency"
          label="Frequency"
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={onSort}
        />
        {filterOptions?.frequencies && filterOptions.frequencies.length > 0 && (
          <FilterPopover
            options={filterOptions.frequencies}
            selected={filters.frequencies}
            onChange={(v) =>
              onFilterChange({ ...filters, frequencies: v as string[] })
            }
          />
        )}
      </div>
      <div className="flex items-center">
        <span className="uppercase">Decision</span>
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

// Get quarter from publication date (format: YYYY-MM-DD or similar)
function getQuarter(publicationDate: string | null): number | null {
  if (!publicationDate) return null;
  const match = publicationDate.match(/^\d{4}-(\d{2})/);
  if (!match) return null;
  const month = parseInt(match[1], 10);
  return Math.ceil(month / 3);
}

// Publication pattern visualization
function PublicationPattern({ versions }: { versions: Version[] }) {
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
    else versionMap.get(v.year)!.add(0); // Unknown quarter
  });

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
        Publication Pattern
      </div>
      <div className="flex gap-2">
        {displayYears.map((year) => {
          const quarters = versionMap.get(year);
          const hasPublication = !!quarters;
          const hasUnknownQuarter = quarters?.has(0);

          return (
            <div key={year} className="flex-1 min-w-0">
              {/* Quarter blocks */}
              <div className="flex gap-[1px] mb-1.5">
                {[1, 2, 3, 4].map((q) => {
                  // Only fill if this specific quarter has a publication
                  const isFilled = quarters?.has(q) || (hasUnknownQuarter && q === 1);
                  return (
                    <div
                      key={q}
                      className={`h-5 flex-1 transition-colors ${
                        isFilled ? "bg-un-blue" : "bg-gray-100"
                      }`}
                      title={isFilled ? `Published Q${q} ${year}` : `${year} Q${q}`}
                    />
                  );
                })}
              </div>
              {/* Year label */}
              <div
                className={`text-[10px] text-center ${
                  hasPublication ? "text-gray-700 font-medium" : "text-gray-300"
                }`}
              >
                {year}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-un-blue" />
          <span>Published</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-gray-100" />
          <span>No publication</span>
        </div>
      </div>
    </div>
  );
}

// Recommendation types
type RecommendationStatus = "continue" | "merge" | "discontinue" | null;
type FrequencyRecommendation = "keep" | "annual" | "biennial" | "triennial" | "quadrennial" | "one-time" | null;
type FormatRecommendation = "keep" | "shorter" | "oral" | "dashboard" | "other" | null;

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
  { value: "keep", label: "Keep current frequency" },
  { value: "annual", label: "Annual" },
  { value: "biennial", label: "Biennial (every 2 years)" },
  { value: "triennial", label: "Triennial (every 3 years)" },
  { value: "quadrennial", label: "Quadrennial (every 4 years)" },
  { value: "one-time", label: "One-time only" },
];

const FORMAT_OPTIONS = [
  { value: "keep", label: "Keep current format" },
  { value: "shorter", label: "Shorter written report" },
  { value: "oral", label: "Oral update only" },
  { value: "dashboard", label: "Dashboard / data format" },
  { value: "other", label: "Other (specify)" },
];

// Recommendation form component
function RecommendationForm({
  report,
  allReports,
  onSave,
}: {
  report: ReportGroup;
  allReports: ReportGroup[];
  onSave?: () => void;
}) {
  const [recommendation, setRecommendation] = useState<Recommendation>({
    status: null,
    mergeTargets: [],
    discontinueReason: "",
    frequency: null,
    format: null,
    formatOther: "",
    comments: "",
  });
  
  const [mergePickerOpen, setMergePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  
  // Load existing response when report changes
  useEffect(() => {
    setLoadingExisting(true);
    setSaveSuccess(false);
    fetch(`/api/survey-responses?properTitle=${encodeURIComponent(report.title)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.response) {
          setRecommendation({
            status: data.response.status as RecommendationStatus,
            mergeTargets: data.response.mergeTargets || [],
            discontinueReason: data.response.discontinueReason || "",
            frequency: data.response.frequency as FrequencyRecommendation,
            format: data.response.format as FormatRecommendation,
            formatOther: data.response.formatOther || "",
            comments: data.response.comments || "",
          });
        } else {
          // Reset form for new report
          setRecommendation({
            status: null,
            mergeTargets: [],
            discontinueReason: "",
            frequency: null,
            format: null,
            formatOther: "",
            comments: "",
          });
        }
      })
      .catch(() => {
        // Silently fail - user can still fill form
      })
      .finally(() => setLoadingExisting(false));
  }, [report.title]);
  
  // Filter out current report from merge options
  const mergeOptions = useMemo(() => 
    allReports.filter((r) => r.symbol !== report.symbol),
    [allReports, report.symbol]
  );
  
  const updateRecommendation = <K extends keyof Recommendation>(
    key: K,
    value: Recommendation[K]
  ) => {
    setRecommendation((prev) => ({ ...prev, [key]: value }));
    setSaveSuccess(false); // Clear success state on any change
  };

  const toggleMergeTarget = (symbol: string) => {
    setRecommendation((prev) => ({
      ...prev,
      mergeTargets: prev.mergeTargets.includes(symbol)
        ? prev.mergeTargets.filter((s) => s !== symbol)
        : [...prev.mergeTargets, symbol],
    }));
    setSaveSuccess(false);
  };
  
  // Validation logic
  const isFormValid = useMemo(() => {
    if (!recommendation.status) return false;
    
    if (recommendation.status === "continue" || recommendation.status === "merge") {
      if (!recommendation.frequency) return false;
      if (!recommendation.format) return false;
      if (recommendation.format === "other" && !recommendation.formatOther?.trim()) return false;
    }
    
    if (recommendation.status === "merge") {
      if (recommendation.mergeTargets.length === 0) return false;
    }
    
    if (recommendation.status === "discontinue") {
      if (!recommendation.discontinueReason?.trim()) return false;
    }
    
    return true;
  }, [recommendation]);

  const handleSave = async () => {
    if (!isFormValid) return;
    
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
          mergeTargets: recommendation.mergeTargets,
          discontinueReason: recommendation.discontinueReason,
          comments: recommendation.comments,
        }),
      });
      
      if (response.ok) {
        setSaveSuccess(true);
        onSave?.();
      } else {
        const data = await response.json();
        console.error("Failed to save:", data.error);
      }
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status - segmented control style */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          What should happen to this report? <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "continue", label: "Continue" },
            { value: "merge", label: "Merge" },
            { value: "discontinue", label: "Discontinue" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => updateRecommendation("status", option.value as RecommendationStatus)}
              className={`px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                recommendation.status === option.value
                  ? "bg-un-blue text-white border-un-blue"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conditional content wrapper */}
      <div className="space-y-4">
        {/* Merge target picker - shown when merge is selected */}
        {recommendation.status === "merge" && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Merge with which report(s)? <span className="text-red-500">*</span>
            </label>
            <Popover open={mergePickerOpen} onOpenChange={setMergePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={mergePickerOpen}
                  className="w-full justify-between h-auto min-h-9 py-2"
                >
                  {recommendation.mergeTargets.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {recommendation.mergeTargets.map((symbol) => (
                        <span
                          key={symbol}
                          className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs"
                        >
                          {symbol}
                          <X
                            className="h-3 w-3 cursor-pointer hover:text-blue-900"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMergeTarget(symbol);
                            }}
                          />
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-500">Select reports to merge with...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[350px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search reports..." />
                  <CommandList>
                    <CommandEmpty>No reports found.</CommandEmpty>
                    <CommandGroup>
                      {mergeOptions.slice(0, 50).map((r) => (
                        <CommandItem
                          key={r.symbol}
                          value={`${r.symbol} ${r.title}`}
                          onSelect={() => toggleMergeTarget(r.symbol)}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${
                              recommendation.mergeTargets.includes(r.symbol)
                                ? "opacity-100"
                                : "opacity-0"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{r.title}</p>
                            <p className="text-xs text-gray-500">{r.symbol}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Discontinue reason - shown when discontinue is selected */}
        {recommendation.status === "discontinue" && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Why should this report be discontinued? <span className="text-red-500">*</span>
            </label>
            <textarea
              value={recommendation.discontinueReason}
              onChange={(e) => updateRecommendation("discontinueReason", e.target.value)}
              placeholder="Please provide a reason..."
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-un-blue focus:ring-1 focus:ring-un-blue resize-none"
              rows={2}
            />
          </div>
        )}

        {/* Continue/Merge options - frequency and format */}
        {(recommendation.status === "continue" || recommendation.status === "merge") && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Recommended frequency <span className="text-red-500">*</span>
                {report.frequency && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    (currently: {report.frequency})
                  </span>
                )}
              </label>
              <Select
                value={recommendation.frequency ?? undefined}
                onValueChange={(v) => updateRecommendation("frequency", v as FrequencyRecommendation)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select frequency..." />
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
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Recommended format <span className="text-red-500">*</span>
              </label>
              <Select
                value={recommendation.format ?? undefined}
                onValueChange={(v) => updateRecommendation("format", v as FormatRecommendation)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select format..." />
                </SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {recommendation.format === "other" && (
                <Input
                  value={recommendation.formatOther}
                  onChange={(e) => updateRecommendation("formatOther", e.target.value)}
                  placeholder="Describe the format..."
                  className="mt-2"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Additional comments <span className="text-gray-400 text-xs font-normal">(optional)</span>
        </label>
        <textarea
          value={recommendation.comments}
          onChange={(e) => updateRecommendation("comments", e.target.value)}
          placeholder="Any other suggestions or notes..."
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-un-blue focus:ring-1 focus:ring-un-blue resize-none"
          rows={3}
        />
      </div>

      {/* Save button */}
      <Button 
        className="w-full" 
        disabled={!isFormValid || saving || loadingExisting}
        onClick={handleSave}
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
    </div>
  );
}

// Similar reports interface
interface SimilarReport {
  symbol: string;
  title: string;
  year: number | null;
  similarity: number;
  entity: string | null;
}

// Similar reports component
function SimilarReports({ symbol }: { symbol: string }) {
  const [similar, setSimilar] = useState<SimilarReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    
    fetch(`/api/similar-reports?symbol=${encodeURIComponent(symbol)}&limit=5`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setSimilar(data.similar || []);
        }
      })
      .catch(() => setError("Failed to load similar reports"))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Finding similar reports...
      </div>
    );
  }

  if (error || similar.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4">
        {error || "No similar reports found"}
      </p>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {similar.map((r) => (
        <a
          key={r.symbol}
          href={buildDLLink(r.symbol)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 py-3 hover:bg-gray-50 rounded -mx-2 px-2 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900" title={r.title}>
              {r.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-500">
                {r.symbol} • {r.year ?? "—"}
              </span>
              {r.entity && (
                <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                  {r.entity}
                </span>
              )}
            </div>
          </div>
        </a>
      ))}
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

// Info tab content
function InfoTabContent({ report, subjectCounts }: { report: ReportGroup; subjectCounts: SubjectCount[] }) {
  const [showAllVersions, setShowAllVersions] = useState(false);
  const MAX_VERSIONS = 3;
  const hasMoreVersions = report.versions.length > MAX_VERSIONS;
  const visibleVersions = showAllVersions
    ? report.versions
    : report.versions.slice(0, MAX_VERSIONS);

  return (
    <div className="space-y-4">
      {/* Full title */}
      <p className="text-sm text-gray-800 leading-relaxed">
        {report.title}
      </p>
      
      {/* Metadata pills */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
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
              {report.body}
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
        
        {report.subjectTerms && report.subjectTerms.length > 0 && (
          <div className="pt-1">
            <SortedSubjectPills
              subjects={report.subjectTerms}
              subjectCounts={subjectCounts}
              size="xs"
            />
          </div>
        )}
      </div>

      {/* Pattern visualization */}
      <div className="bg-gray-50 rounded-lg p-4">
        <PublicationPattern versions={report.versions} />
      </div>

      {/* Versions list */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Versions ({report.count})
        </div>
        <div className="divide-y divide-gray-100">
          {visibleVersions.map((v) => (
            <VersionRow key={v.symbol} v={v} />
          ))}
        </div>
        {hasMoreVersions && (
          <button
            onClick={() => setShowAllVersions(!showAllVersions)}
            className="text-sm text-un-blue hover:text-blue-700 font-medium flex items-center gap-1"
          >
            {showAllVersions ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Show {report.versions.length - MAX_VERSIONS} more versions
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// Sidebar component
function ReportSidebar({
  report,
  onClose,
  allReports,
  subjectCounts,
  onSave,
}: {
  report: ReportGroup | null;
  onClose: () => void;
  allReports: ReportGroup[];
  subjectCounts: SubjectCount[];
  onSave?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"info" | "similar">("info");

  if (!report) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 border-b px-4 py-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 truncate pr-4">
            {report.title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Survey form - at top */}
        <div className="flex-shrink-0 border-b px-4 py-4">
          <RecommendationForm report={report} allReports={allReports} onSave={onSave} />
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 border-b px-4">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab("info")}
              className={`py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "info"
                  ? "border-un-blue text-un-blue"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Info
            </button>
            <button
              onClick={() => setActiveTab("similar")}
              className={`py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "similar"
                  ? "border-un-blue text-un-blue"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Similar Reports
            </button>
          </div>
        </div>

        {/* Tab content - scrollable */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "info" ? (
            <InfoTabContent report={report} subjectCounts={subjectCounts} />
          ) : (
            <SimilarReports symbol={report.symbol} />
          )}
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
      className={`grid ${GRID_COLS} items-center gap-x-3 px-4 py-3 text-sm border-b transition-colors cursor-pointer ${
        isSelected ? "bg-blue-50 border-l-2 border-l-un-blue" : "hover:bg-gray-50"
      }`}
      onClick={onSelect}
    >
      {/* Symbol */}
      <div className="flex items-center">
        <span
          className="inline-block rounded bg-blue-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-un-blue truncate max-w-[150px]"
          title={report.symbol}
        >
          {report.symbol.length > 18
            ? `${report.symbol.slice(0, 18)}…`
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
    years: [],
    frequencies: [],
    subjects: [],
    entities: [],
  });
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showMyEntityOnly, setShowMyEntityOnly] = useState(false);
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
    filters.years.forEach((y) => params.append("filterYear", String(y)));
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
    filters.years.length > 0 ||
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
              setFilters({
                search: "",
                symbol: "",
                title: "",
                bodies: [],
                years: [],
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
        allReports={data?.reports || []}
        subjectCounts={data?.subjectCounts || []}
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
