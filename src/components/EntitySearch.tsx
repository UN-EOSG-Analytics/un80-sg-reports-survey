"use client";
import { useState, useRef, useEffect } from "react";
import { Loader2, Building2 } from "lucide-react";

interface Entity {
  short: string;
  long: string | null;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
}

export function EntitySearch({ value, onChange, placeholder = "Search entities...", allowCustom = true }: Props) {
  const [query, setQuery] = useState(value);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [filtered, setFiltered] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/entities").then(r => r.json()).then(d => { setEntities(d.entities || []); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!query) { setFiltered(entities); return; }
    const q = query.toLowerCase();
    setFiltered(entities.filter(e => e.short.toLowerCase().includes(q) || e.long?.toLowerCase().includes(q)));
  }, [query, entities]);

  const handleChange = (val: string) => {
    setQuery(val);
    setOpen(true);
    setHighlighted(0);
  };

  const handleSelect = (entity: Entity | string) => {
    const val = typeof entity === "string" ? entity : entity.short;
    setQuery(val);
    onChange(val);
    setOpen(false);
    setHighlighted(-1);
  };

  const showCustomOption = allowCustom && query && !entities.some(e => e.short.toLowerCase() === query.toLowerCase());
  const totalItems = filtered.length + (showCustomOption ? 1 : 0);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || totalItems === 0) return;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setHighlighted((i) => (i + 1) % totalItems); break;
      case "ArrowUp": e.preventDefault(); setHighlighted((i) => (i - 1 + totalItems) % totalItems); break;
      case "Enter":
        e.preventDefault();
        if (highlighted >= 0 && highlighted < filtered.length) handleSelect(filtered[highlighted]);
        else if (showCustomOption && highlighted === filtered.length) handleSelect(query);
        break;
      case "Escape": setOpen(false); setHighlighted(-1); break;
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (query && query !== value) onChange(query);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [query, value, onChange]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-10 text-sm focus:border-un-blue focus:outline-none focus:ring-1 focus:ring-un-blue"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
      </div>

      {open && (filtered.length > 0 || showCustomOption) && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto">
          {filtered.map((entity, i) => (
            <button
              key={entity.short}
              onClick={() => handleSelect(entity)}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full px-3 py-2 text-left ${highlighted === i ? "bg-gray-100" : ""}`}
            >
              <span className="text-sm font-medium text-un-blue">{entity.short}</span>
              {entity.long && <p className="text-xs text-gray-500 truncate">{entity.long}</p>}
            </button>
          ))}
          {showCustomOption && (
            <button
              onClick={() => handleSelect(query)}
              onMouseEnter={() => setHighlighted(filtered.length)}
              className={`w-full px-3 py-2 text-left text-sm border-t border-gray-100 ${highlighted === filtered.length ? "bg-gray-100" : ""}`}
            >
              <span className="text-gray-500">Other: </span>
              <span className="font-medium">{query}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
