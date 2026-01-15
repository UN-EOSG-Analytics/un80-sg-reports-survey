"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, FileText, Loader2 } from "lucide-react";

interface Version {
  symbol: string;
  year: number | null;
}

interface ReportGroup {
  title: string;
  versions: Version[];
  count: number;
  latestYear: number | null;
}

interface APIResponse {
  reports: ReportGroup[];
  total: number;
  page: number;
  limit: number;
}

export function SGReportsList() {
  const [data, setData] = useState<APIResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sg-reports?page=${page}&limit=${limit}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [page]);

  const toggle = (title: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  if (loading && !data)
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-un-blue" />
      </div>
    );

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600 mb-4">
        {data?.total} report series found
      </p>

      {data?.reports.map((r) => (
        <div key={r.title} className="border border-gray-200 rounded-lg">
          <button
            onClick={() => r.count > 1 && toggle(r.title)}
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
          >
            {r.count > 1 ? (
              expanded.has(r.title) ? (
                <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
              )
            ) : (
              <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {r.title}
              </p>
              <p className="text-xs text-gray-500">
                {r.versions[0].symbol}
                {r.count > 1 && ` · ${r.count} versions`}
                {" · "}
                {[...new Set(r.versions.map((v) => v.year).filter(Boolean))].join(", ")}
              </p>
            </div>
          </button>

          {expanded.has(r.title) && r.count > 1 && (
            <div className="border-t border-gray-100 bg-gray-50 px-3 py-2">
              {r.versions.slice(1).map((v) => (
                <div
                  key={v.symbol}
                  className="flex items-center gap-2 py-1.5 text-xs text-gray-600"
                >
                  <FileText className="h-3 w-3 text-gray-400" />
                  <span className="font-mono">{v.symbol}</span>
                  {v.year && <span className="text-gray-400">· {v.year}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
