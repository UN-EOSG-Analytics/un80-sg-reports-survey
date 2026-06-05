"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, ChevronUp, ChevronDown, Filter, X, Search, ChevronRight, ArrowRight, Download, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ReportSidebar, ReportGroup, SubjectCount } from "@/components/ReportSidebar";
import { EntityBadges } from "@/components/EntityBadges";
import { FrequencyBadge } from "@/components/FrequencyBadge";
import { DocumentSymbolBadge } from "@/components/DocumentSymbolBadge";

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
  search: string;
  bodies: string[];
  years: number[];
  frequencies: string[];
  subjects: string[];
  entities: string[];
  reportTypes: string[];
}

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

type SortColumn = "symbol" | "title" | "entity" | "body" | "year" | "frequency" | "downloads";
type SortDirection = "asc" | "desc";

// Columns: Symbol, Title, Body, Year, Entity, Subjects, Frequency, Downloads, Details
const GRID_COLS = "grid-cols-[95px_1fr_65px_65px_100px_115px_105px_125px_70px]";

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
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      )}
    </button>
  );
}

function ColumnInfo({
  label,
  text,
  contentClassName,
}: {
  label: string;
  text: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 uppercase cursor-help hover:text-black transition-colors"
        >
          <span>{label}</span>
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        className={`normal-case tracking-normal font-normal ${contentClassName ?? ""}`}
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

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
              : "text-gray-400 hover:bg-gray-200 hover:text-gray-700"
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
              : "text-gray-400 hover:bg-gray-200 hover:text-gray-700"
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
              : "text-gray-400 hover:bg-gray-200 hover:text-gray-700"
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
              : "text-gray-400 hover:bg-gray-200 hover:text-gray-700"
          }`}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search subjects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-sm pl-7"
            />
          </div>

          {selectedSubjects.length > 0 && (
            <button
              onClick={() => selectedSubjects.forEach((s) => onToggle(s))}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <X className="h-3 w-3" /> Clear {selectedSubjects.length} selected
            </button>
          )}

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
  onExport,
}: {
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  filterOptions: FilterOptions | null;
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  subjectCounts: SubjectCount[];
  onExport: (format: "csv" | "xlsx") => void;
}) {
  return (
    <div
      className={`grid ${GRID_COLS} items-start gap-x-4 px-4 py-2 text-[11px] font-semibold tracking-wider text-gray-700 uppercase bg-gray-50 border-b`}
    >
      <div className="flex flex-col items-start gap-0.5">
        <ColumnInfo label="Symbol" text="Taken directly from United Nations Digital Library metadata." />
        <div className="flex items-center gap-1 -ml-0.5">
          <SortArrow column="symbol" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
        </div>
      </div>
      <div className="flex flex-col items-start gap-0.5">
        <ColumnInfo label="Title" text="Taken directly from United Nations Digital Library metadata." />
        <div className="flex items-center gap-1 -ml-0.5">
          <SortArrow column="title" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
        </div>
      </div>
      <div className="flex flex-col items-start gap-0.5">
        <ColumnInfo label="Body" text="Taken directly from United Nations Digital Library metadata." />
        <div className="flex items-center gap-1 -ml-0.5">
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
      </div>
      <div className="flex flex-col items-start gap-0.5">
        <ColumnInfo label="Year" text="The year shown reflects the publication date recorded in the United Nations Digital Library metadata." />
        <div className="flex items-center gap-1 -ml-0.5">
          {filterOptions?.years && filterOptions.years.length > 0 && (
            <YearFilterPopover
              options={filterOptions.years}
              selected={filters.years}
              onChange={(v) => onFilterChange({ ...filters, years: v })}
            />
          )}
          <SortArrow column="year" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
        </div>
      </div>
      <div className="flex flex-col items-start gap-0.5">
        <span>Entity</span>
        <div className="flex items-center gap-1 -ml-0.5">
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
      </div>
      <div className="flex flex-col items-start gap-0.5">
        <ColumnInfo label="Subjects" text="Subjects are extracted directly from United Nations Digital Library metadata." />
        <div className="flex items-center gap-1 -ml-0.5">
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
      </div>
      <div className="flex flex-col items-start gap-0.5">
        <ColumnInfo
          label="Frequency"
          contentClassName="max-w-[min(60ch,calc(100vw-2rem))] max-h-[calc(100vh-4rem)] overflow-y-auto"
          text={
            <div className="space-y-2">
              <p>
                This reference to frequency of reporting includes
                Secretary-General&rsquo;s reports submitted pursuant to the
                following types of decisions of intergovernmental organs:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  a decision which contains a standing request for a
                  Secretary-General&rsquo;s report on an annual (or biennial,
                  triennial, etc.) basis, and
                </li>
                <li>
                  a decision which requests the Secretary-General to submit a
                  report at a specific session (e.g. 80th session) but, as a
                  matter of practice, the intergovernmental organ concerned
                  has, in the past, requested a Secretary-General&rsquo;s
                  report on the same subject recurrently at specific intervals.
                </li>
              </ul>
              <p>
                The reference to &ldquo;annual&rdquo;, &ldquo;biennial&rdquo;
                or &ldquo;triennial&rdquo; in this table is not intended to
                prejudge that the intergovernmental organ concerned would, in
                the future, request the relevant reports on an annual,
                biennial, or triennial basis.
              </p>
            </div>
          }
        />
        <div className="flex items-center gap-1 -ml-0.5">
          {filterOptions?.frequencies && filterOptions.frequencies.length > 0 && (
            <FrequencyFilterPopover
              options={filterOptions.frequencies}
              selected={filters.frequencies}
              onChange={(v) => onFilterChange({ ...filters, frequencies: v })}
            />
          )}
          <SortArrow column="frequency" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <ColumnInfo label="DL Downloads" text="Total downloads of the report in all six official languages from the UN Digital Library; does not include downloads via the UN Official Document System." />
        <div className="flex items-center gap-1 -mr-0.5">
          <SortArrow column="downloads" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
        </div>
      </div>
      <div className="flex items-start justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title="Export filtered data"
              className="inline-flex h-5 items-center gap-0.5 rounded px-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
            >
              <Download className="h-3 w-3" />
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onExport("xlsx")}>
              Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("csv")}>
              CSV (.csv)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ReportRow({
  report,
  isSelected,
  onSelect,
  subjectCounts,
}: {
  report: ReportGroup;
  isSelected: boolean;
  onSelect: () => void;
  subjectCounts: SubjectCount[];
}) {
  const displayTitle = report.title?.replace(/\s*:\s*$/, "").trim() || null;

  return (
    <div
      className={`grid ${GRID_COLS} items-center gap-x-4 px-4 py-3 text-sm border-b cursor-pointer ${
        isSelected ? "bg-blue-50 border-l-2 border-l-un-blue" : "hover:bg-gray-50"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center">
        <DocumentSymbolBadge
          symbol={report.symbol}
          size="xs"
          maxLength={14}
          className="max-w-[120px]"
        />
      </div>

      <div className="truncate text-gray-700" title={displayTitle || undefined}>
        {displayTitle || <span className="text-gray-400 italic">No title</span>}
      </div>

      <div className="text-xs text-gray-500" title={report.body ?? undefined}>
        {abbreviateBody(report.body) ?? "—"}
      </div>

      <div className="text-xs text-gray-600">
        {report.year ?? <span className="text-gray-300">—</span>}
      </div>

      <div className="overflow-hidden">
        <EntityBadges
          suggestions={report.suggestions}
          confirmedEntities={report.confirmedEntities}
          leadEntities={report.leadEntities}
          contributingEntities={report.contributingEntities}
          maxVisible={2}
          size="xs"
        />
      </div>

      <SortedSubjectPills
        subjects={report.subjectTerms || []}
        subjectCounts={subjectCounts}
        maxVisible={2}
        size="xs"
      />

      <div>
        <FrequencyBadge
          frequency={report.frequency}
          calculatedFrequency={report.calculatedFrequency}
          confirmedFrequency={report.confirmedFrequency}
          gapHistory={report.gapHistory}
          size="xs"
        />
      </div>

      <div className="text-right text-xs tabular-nums text-gray-600">
        {report.downloadCount
          ? report.downloadCount.toLocaleString()
          : <span className="text-gray-300">—</span>}
      </div>

      <div className="flex items-center justify-end">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-un-blue transition-colors hover:bg-blue-50"
        >
          Details
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function ReportsTable() {
  const [data, setData] = useState<APIResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportGroup | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    bodies: [],
    years: [],
    frequencies: [],
    subjects: [],
    entities: [],
    reportTypes: [],
  });
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [searchInput, setSearchInput] = useState("");

  const limit = 50;

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (sortColumn) {
      params.set("sortColumn", sortColumn);
      params.set("sortDirection", sortDirection);
    }
    if (filters.search) params.set("filterSearch", filters.search);
    filters.bodies.forEach((b) => params.append("filterBody", b));
    filters.years.forEach((y) => params.append("filterYear", String(y)));
    filters.frequencies.forEach((f) => params.append("filterFrequency", f));
    filters.subjects.forEach((s) => params.append("filterSubject", s));
    filters.entities.forEach((e) => params.append("filterEntity", e));
    filters.reportTypes.forEach((t) => params.append("filterReportType", t));
    return params;
  }, [filters, sortColumn, sortDirection]);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = buildFilterParams();
    params.set("page", String(page));
    params.set("limit", String(limit));

    fetch(`/api/sg-reports?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [page, buildFilterParams]);

  const handleExport = (format: "csv" | "xlsx") => {
    const params = buildFilterParams();
    params.set("format", format);
    window.location.href = `/api/sg-reports?${params.toString()}`;
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    setPage(1);
  };

  const sortedReports = data?.reports || [];
  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  const hasActiveFilters =
    filters.search ||
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

        <p className="text-sm text-gray-500 hidden md:block">
          Hover column headers for explanations.
        </p>

        <p className="text-sm text-gray-500 ml-auto">
          {data?.total} report series
          {hasActiveFilters && " (filtered)"}
        </p>
      </div>

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
          onExport={handleExport}
        />

        <div className="divide-y divide-gray-100">
          {sortedReports.map((r) => (
            <ReportRow
              key={r.symbol}
              report={r}
              isSelected={selectedReport?.symbol === r.symbol}
              onSelect={() => setSelectedReport(r)}
              subjectCounts={data?.subjectCounts || []}
            />
          ))}
        </div>

        {sortedReports.length === 0 && (
          <div className="px-4 py-8 text-center">
            {hasActiveFilters ? (
              <p className="text-gray-400">No reports match your filters</p>
            ) : (
              <p className="text-gray-400">No reports found</p>
            )}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="relative flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            Previous
          </Button>
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-gray-600">
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

      <ReportSidebar
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        subjectCounts={data?.subjectCounts || []}
        onSelectSymbol={async (symbol) => {
          try {
            const resp = await fetch(
              `/api/sg-reports?filterSearch=${encodeURIComponent(symbol)}&limit=20`
            );
            const json = await resp.json();
            const found = (json.reports || []).find(
              (r: ReportGroup) =>
                r.symbol === symbol ||
                r.versions?.some((v) => v.symbol === symbol)
            );
            if (found) setSelectedReport(found);
          } catch (e) {
            console.error("Failed to load report:", e);
          }
        }}
      />
    </div>
  );
}
