"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, ChevronUp, ChevronDown, Filter, X, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface Version {
  symbol: string;
  year: number | null;
  publicationDate: string | null;
  recordNumber: string | null;
}

interface ReportGroup {
  title: string;
  symbol: string;
  body: string | null;
  year: number | null;
  versions: Version[];
  count: number;
  latestYear: number | null;
  frequency: string | null;
}

interface FilterOptions {
  bodies: string[];
  years: number[];
  frequencies: string[];
}

interface APIResponse {
  reports: ReportGroup[];
  total: number;
  page: number;
  limit: number;
  filterOptions: FilterOptions;
}

interface Filters {
  symbol: string;
  title: string;
  bodies: string[];
  years: number[];
  frequencies: string[];
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

type SortColumn = "symbol" | "title" | "body" | "year" | "frequency";
type SortDirection = "asc" | "desc";

const GRID_COLS = "grid-cols-[160px_1fr_100px_70px_100px]";

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

function ColumnHeaders({
  sortColumn,
  sortDirection,
  onSort,
  filterOptions,
  filters,
  onFilterChange,
}: {
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  filterOptions: FilterOptions | null;
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
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

// Sidebar component
function ReportSidebar({
  report,
  onClose,
}: {
  report: ReportGroup | null;
  onClose: () => void;
}) {
  if (!report) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
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

        <div className="p-4 space-y-6">
          {/* Header info */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <span className="inline-block rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-un-blue">
                {report.symbol}
              </span>
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
            <p className="text-sm text-gray-500">
              {report.count} version{report.count !== 1 ? "s" : ""} • Latest: {report.latestYear ?? "—"}
            </p>
          </div>

          {/* Pattern visualization */}
          <div className="bg-gray-50 rounded-lg p-4">
            <PublicationPattern versions={report.versions} />
          </div>

          {/* Versions list */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              All Versions
            </div>
            <div className="divide-y divide-gray-100">
              {report.versions.map((v) => {
                // Format date nicely: "Jul 11, 2025" or just year
                const formattedDate = v.publicationDate
                  ? new Date(v.publicationDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : v.year?.toString() ?? "—";

                return (
                  <div
                    key={v.symbol}
                    className="flex items-center gap-3 py-2"
                  >
                    <span className="text-xs text-gray-500 w-24 flex-shrink-0">
                      {formattedDate}
                    </span>
                    <span className="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">
                      {v.symbol}
                    </span>
                    <div className="flex gap-1.5 flex-shrink-0">
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
              })}
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
}: {
  report: ReportGroup;
  isSelected: boolean;
  onSelect: () => void;
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

      {/* Body */}
      <div className="text-xs text-gray-500" title={report.body ?? undefined}>
        {abbreviateBody(report.body) ?? "—"}
      </div>

      {/* Year */}
      <div className="text-sm font-medium text-un-blue">
        {report.year ?? <span className="text-gray-300">—</span>}
      </div>

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
    </div>
  );
}

export function SGReportsList() {
  const [data, setData] = useState<APIResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportGroup | null>(null);
  const [filters, setFilters] = useState<Filters>({
    symbol: "",
    title: "",
    bodies: [],
    years: [],
    frequencies: [],
  });
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Debounced text inputs
  const [symbolInput, setSymbolInput] = useState("");
  const [titleInput, setTitleInput] = useState("");

  const limit = 20;

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    if (filters.symbol) params.set("filterSymbol", filters.symbol);
    if (filters.title) params.set("filterTitle", filters.title);
    filters.bodies.forEach((b) => params.append("filterBody", b));
    filters.years.forEach((y) => params.append("filterYear", String(y)));
    filters.frequencies.forEach((f) => params.append("filterFrequency", f));

    fetch(`/api/sg-reports?${params.toString()}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [page, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounce text filters
  useEffect(() => {
    const timer = setTimeout(() => {
      if (symbolInput !== filters.symbol || titleInput !== filters.title) {
        setFilters((f) => ({ ...f, symbol: symbolInput, title: titleInput }));
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [symbolInput, titleInput, filters.symbol, filters.title]);

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
    filters.symbol ||
    filters.title ||
    filters.bodies.length > 0 ||
    filters.years.length > 0 ||
    filters.frequencies.length > 0;

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
        <div className="relative flex-1 max-w-xs">
          <Input
            placeholder="Filter by symbol..."
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            className="h-8 text-sm pl-3"
          />
          {symbolInput && (
            <button
              onClick={() => setSymbolInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Filter by title..."
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            className="h-8 text-sm pl-3"
          />
          {titleInput && (
            <button
              onClick={() => setTitleInput("")}
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
              setSymbolInput("");
              setTitleInput("");
              setFilters({
                symbol: "",
                title: "",
                bodies: [],
                years: [],
                frequencies: [],
              });
              setPage(1);
            }}
            className="h-8 text-xs text-gray-500"
          >
            Clear all filters
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {data?.total} report series
          {hasActiveFilters && " (filtered)"}
        </p>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
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
        />

        <div className="divide-y divide-gray-100">
          {sortedReports.map((r) => (
            <ReportRow
              key={r.symbol}
              report={r}
              isSelected={selectedReport?.symbol === r.symbol}
              onSelect={() => setSelectedReport(r)}
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
            Page {page} of {totalPages}
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
      />
    </div>
  );
}
