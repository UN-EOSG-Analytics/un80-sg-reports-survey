"use client";

import { useState, useMemo } from "react";

interface TreemapItem {
  name: string;
  value?: number;
  children?: TreemapItem[];
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Report {
  symbol: string;
  title: string;
  date_year: number | null;
}

const COLORS = [
  "#009edb", "#4a7c7e", "#7d8471", "#9b8b7a", "#a0665c",
  "#6c5b7b", "#5a6c7d", "#495057", "#969696", "#33b8e8",
];

const GAP = 0.4; // Gap between items in %

const toTitleCase = (s: string) => 
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function squarify<T>(
  items: { value: number; data: T }[],
  x: number, y: number, width: number, height: number
): (Rect & { data: T })[] {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total === 0 || items.length === 0) return [];

  const normalized = items.map((item) => ({
    ...item,
    normalizedValue: (item.value / total) * width * height,
  }));

  return slice(normalized, x, y, width, height);
}

function slice<T>(
  items: { value: number; data: T; normalizedValue: number }[],
  x: number, y: number, width: number, height: number
): (Rect & { data: T })[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x, y, width, height, data: items[0].data }];

  const total = items.reduce((sum, item) => sum + item.normalizedValue, 0);
  let sum = 0, splitIndex = 0;
  for (let i = 0; i < items.length; i++) {
    sum += items[i].normalizedValue;
    if (sum >= total / 2) { splitIndex = i + 1; break; }
  }
  splitIndex = Math.max(1, Math.min(splitIndex, items.length - 1));

  const left = items.slice(0, splitIndex);
  const right = items.slice(splitIndex);
  const leftSum = left.reduce((s, item) => s + item.normalizedValue, 0);

  if (width > height) {
    const leftWidth = width * (leftSum / total);
    return [
      ...slice(left, x, y, leftWidth, height),
      ...slice(right, x + leftWidth, y, width - leftWidth, height),
    ];
  } else {
    const leftHeight = height * (leftSum / total);
    return [
      ...slice(left, x, y, width, leftHeight),
      ...slice(right, x, y + leftHeight, width, height - leftHeight),
    ];
  }
}

function getTotal(item: TreemapItem): number {
  if (item.value !== undefined) return item.value;
  return item.children?.reduce((s, c) => s + getTotal(c), 0) || 0;
}

interface TooltipData {
  name: string;
  value: number;
  path: string[];
  x: number;
  y: number;
}

interface SidebarData {
  path: string[];
  reports: Report[];
  loading: boolean;
}

export default function Treemap({ data }: { data: TreemapItem[] }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState<SidebarData | null>(null);

  const handleClick = async (path: string[]) => {
    setSidebar({ path, reports: [], loading: true });
    const [level2, level3, subject] = path;
    const params = new URLSearchParams({ level2, level3, subject });
    const res = await fetch(`/api/stats/treemap?${params}`);
    const data = await res.json();
    setSidebar({ path, reports: data.reports || [], loading: false });
  };

  const level1Rects = useMemo(() => {
    const items = data.map((d) => ({ value: getTotal(d), data: d }));
    return squarify(items, 0, 0, 100, 100);
  }, [data]);

  const handleMouseMove = (e: React.MouseEvent, name: string, value: number, path: string[]) => {
    setTooltip({ name, value, path, x: e.clientX, y: e.clientY });
    setHovered(path.join("/"));
  };

  return (
    <div className="relative w-full bg-white" style={{ paddingBottom: "60%" }}>
      <div className="absolute inset-0 pt-6">
        {level1Rects.map((l1Rect, i) => {
          const color = COLORS[i % COLORS.length];
          const l1 = l1Rect.data;
          const l2Items = (l1.children || []).map((c) => ({ value: getTotal(c), data: c }));
          const l2Rects = squarify(l2Items, 0, 0, 100, 100);

          return (
            <div
              key={l1.name}
              className="absolute"
              style={{
                left: `calc(${l1Rect.x}% + 3px)`,
                top: `calc(${l1Rect.y}% + 3px)`,
                width: `calc(${l1Rect.width}% - 6px)`,
                height: `calc(${l1Rect.height}% - 6px)`,
              }}
            >
              {/* Level 1 label - above the box */}
              <div 
                className="absolute -top-5 left-0 text-sm font-bold truncate max-w-full" 
                style={{ color }}
              >
                {l1.name}
              </div>

              {l2Rects.map((l2Rect, j) => {
                const l2 = l2Rect.data;
                const l3Items = (l2.children || []).map((c) => ({ value: c.value || 0, data: c }));
                const l3Rects = squarify(l3Items, 0, 0, 100, 100);

                return (
                  <div
                    key={l2.name}
                    className="absolute"
                    style={{
                      left: `calc(${l2Rect.x}% + 2px)`,
                      top: `calc(${l2Rect.y}% + 2px)`,
                      width: `calc(${l2Rect.width}% - 4px)`,
                      height: `calc(${l2Rect.height}% - 4px)`,
                      backgroundColor: color,
                      opacity: 0.75 + (j % 3) * 0.08,
                    }}
                  >
                    {/* Level 2 label - bottom left corner */}
                    {l2Rect.width > 12 && l2Rect.height > 10 && (
                      <div 
                        className="absolute bottom-1 left-1.5 text-xs font-semibold text-white/90 truncate"
                        style={{ 
                          textShadow: "0 1px 3px rgba(0,0,0,0.7)",
                          maxWidth: "calc(100% - 12px)",
                        }}
                      >
                        {l2.name}
                      </div>
                    )}

                    {l3Rects.map((l3Rect) => {
                      const l3 = l3Rect.data;
                      const path = [l1.name, l2.name, l3.name];
                      const isHovered = hovered === path.join("/");

                      return (
                        <div
                          key={l3.name}
                          className="absolute cursor-pointer transition-all duration-100"
                          style={{
                            left: `calc(${l3Rect.x}% + 1px)`,
                            top: `calc(${l3Rect.y}% + 1px)`,
                            width: `calc(${l3Rect.width}% - 2px)`,
                            height: `calc(${l3Rect.height}% - 2px)`,
                            backgroundColor: isHovered ? "rgba(255,255,255,0.25)" : "transparent",
                            border: "1px solid rgba(255,255,255,0.15)",
                          }}
                          onClick={() => handleClick(path)}
                          onMouseMove={(e) => handleMouseMove(e, l3.name, l3.value || 0, path)}
                          onMouseLeave={() => { setTooltip(null); setHovered(null); }}
                        >
                          {/* Level 3 label - center of cell, no top-left to avoid overlap */}
                          {l3Rect.width > 15 && l3Rect.height > 12 && (
                            <div className="absolute inset-0 flex items-center justify-center p-1 overflow-hidden">
                              <div 
                                className="text-[10px] text-white text-center leading-tight line-clamp-2"
                                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                              >
                                {toTitleCase(l3.name)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 border border-gray-200 bg-white px-4 py-3 shadow-xl max-w-xs"
          style={{ left: tooltip.x + 16, top: tooltip.y + 16 }}
        >
          <div className="text-xs text-gray-500 mb-1">{tooltip.path.slice(0, 2).join(" → ")}</div>
          <div className="font-semibold text-gray-900">{toTitleCase(tooltip.name)}</div>
          <div className="text-sm text-gray-600 mt-1">{tooltip.value.toLocaleString()} reports</div>
        </div>
      )}

      {/* Sidebar */}
      {sidebar && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col">
          <div className="p-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-gray-500">{sidebar.path[0]} → {sidebar.path[1]}</div>
                <div className="font-semibold text-gray-900 mt-1">{toTitleCase(sidebar.path[2])}</div>
              </div>
              <button
                onClick={() => setSidebar(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {sidebar.loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-un-blue border-r-transparent" />
              </div>
            ) : sidebar.reports.length === 0 ? (
              <div className="text-gray-500 text-sm">No reports found</div>
            ) : (
              <div className="space-y-3">
                {sidebar.reports.map((r) => (
                  <a
                    key={r.symbol}
                    href={`/?symbol=${encodeURIComponent(r.symbol)}`}
                    className="block p-3 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-xs font-mono text-gray-500">{r.symbol}</div>
                    <div className="text-sm text-gray-900 mt-1 line-clamp-2">{r.title}</div>
                    {r.date_year && (
                      <div className="text-xs text-gray-400 mt-1">{r.date_year}</div>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
