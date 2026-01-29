"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Loader2, Plus } from "lucide-react";

interface SearchResult {
  symbol: string;
  title: string | null;
  properTitle?: string | null;
  body: string | null;
  year: number | null;
}

interface Props {
  onSelect?: (doc: SearchResult) => void;
  placeholder?: string;
  mode?: "documents" | "reports";
  variant?: "default" | "tableRow";
}

export function DocumentSearch({ 
  onSelect, 
  placeholder,
  mode = "documents",
  variant = "default",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const defaultPlaceholder = mode === "reports" 
    ? "Add report — search by symbol or title..." 
    : "Search documents...";

  const search = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setSearching(true);
    
    const endpoint = mode === "reports" 
      ? `/api/reports/search?q=${encodeURIComponent(q)}`
      : `/api/documents/search?q=${encodeURIComponent(q)}`;
    
    fetch(endpoint)
      .then((r) => r.json())
      .then((data) => { 
        // Handle different response formats
        const items = mode === "reports" ? data.results : data;
        // Normalize the results
        const normalized = items.map((item: Record<string, unknown>) => ({
          symbol: item.symbol as string,
          title: (item.properTitle || item.title) as string | null,
          properTitle: item.properTitle as string | null,
          body: item.body as string | null,
          year: item.year as number | null,
        }));
        setResults(normalized); 
        setOpen(true); 
        setHighlighted(normalized.length > 0 ? 0 : -1); 
      })
      .finally(() => setSearching(false));
  }, [mode]);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 200);
  };

  const handleSelect = (doc: SearchResult) => {
    onSelect?.(doc);
    setQuery("");
    setOpen(false);
    setHighlighted(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setHighlighted((i) => (i + 1) % results.length); break;
      case "ArrowUp": e.preventDefault(); setHighlighted((i) => (i - 1 + results.length) % results.length); break;
      case "Enter": e.preventDefault(); if (highlighted >= 0) handleSelect(results[highlighted]); break;
      case "Escape": setOpen(false); setHighlighted(-1); break;
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Styling based on variant
  const isTableRow = variant === "tableRow";
  
  const containerClasses = isTableRow
    ? `relative w-full rounded border border-dashed transition-colors ${
        isFocused ? "border-un-blue" : "border-gray-300"
      }`
    : "relative w-full";

  const inputClasses = isTableRow
    ? "w-full bg-transparent py-3 pl-10 pr-10 text-sm placeholder:text-gray-400 focus:outline-none"
    : "w-full rounded-lg border border-gray-300 py-2 pl-10 pr-10 text-sm focus:border-un-blue focus:outline-none focus:ring-1 focus:ring-un-blue";

  return (
    <div ref={containerRef} className={containerClasses}>
      <div className="relative">
        {isTableRow ? (
          <Plus className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${isFocused ? "text-un-blue" : "text-gray-400"}`} />
        ) : (
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { setIsFocused(true); results.length > 0 && setOpen(true); }}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder || defaultPlaceholder}
          className={inputClasses}
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-80 overflow-y-auto">
          {results.map((doc, i) => (
            <button
              key={doc.symbol}
              onClick={() => handleSelect(doc)}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full px-3 py-2 text-left ${highlighted === i ? "bg-gray-100" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-un-blue">{doc.symbol}</span>
                <span className="text-xs text-gray-400">{doc.year}</span>
              </div>
              {doc.title && <p className="text-xs text-gray-600 truncate">{doc.title}</p>}
              {doc.body && <p className="text-xs text-gray-400">{doc.body}</p>}
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !searching && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="text-sm text-gray-500">
            No {mode === "reports" ? "reports" : "documents"} found for &quot;{query}&quot;
          </p>
        </div>
      )}
    </div>
  );
}
