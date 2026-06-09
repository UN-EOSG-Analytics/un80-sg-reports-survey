"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, GitMerge, TrendingDown } from "lucide-react";

interface EntityCount {
  entity: string;
  count: number;
}

interface AggregateData {
  responseCount: number;
  entityResponseCounts: EntityCount[];
  // Distribution of statuses across all responses (anonymised)
  statusDistribution: {
    continue: number;
    continueWithChanges: number;
    merge: number;
    discontinue: number;
  } | null;
}

interface Props {
  properTitle: string;
  normalizedBody: string;
  /** When true, only the entity count badge is shown (compact mode for table rows) */
  compact?: boolean;
}

const STATUS_CONFIG = {
  continue: {
    label: "Continue",
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    ring: "ring-emerald-200",
    bar: "bg-emerald-400",
  },
  continueWithChanges: {
    label: "Continue w/ changes",
    icon: CheckCircle2,
    color: "text-sky-600",
    bg: "bg-sky-50",
    ring: "ring-sky-200",
    bar: "bg-sky-400",
  },
  merge: {
    label: "Merge",
    icon: GitMerge,
    color: "text-slate-600",
    bg: "bg-slate-50",
    ring: "ring-slate-200",
    bar: "bg-slate-400",
  },
  discontinue: {
    label: "Discontinue",
    icon: XCircle,
    color: "text-rose-600",
    bg: "bg-rose-50",
    ring: "ring-rose-200",
    bar: "bg-rose-400",
  },
} as const;

/**
 * Shows how many entities have responded to a given report and an anonymised
 * breakdown of their recommendations. Visible to all authenticated users —
 * individual entity names and response details remain hidden (admins use the
 * full admin view for that).
 */
export function AggregateResponseSummary({
  properTitle,
  normalizedBody,
  compact = false,
}: Props) {
  const [data, setData] = useState<AggregateData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({
      properTitle,
      normalizedBody,
    });
    fetch(`/api/survey-responses/aggregate?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [properTitle, normalizedBody]);

  if (loading || !data || data.responseCount === 0) {
    if (compact) return null;
    return (
      <p className="text-xs text-gray-400">No responses yet from other entities.</p>
    );
  }

  const { responseCount, entityResponseCounts, statusDistribution } = data;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
        {responseCount} response{responseCount !== 1 ? "s" : ""}
      </span>
    );
  }

  const entityCount = entityResponseCounts.length;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">
          {entityCount} {entityCount === 1 ? "entity has" : "entities have"} responded
        </p>
        <span className="text-xs text-gray-400">
          {responseCount} total response{responseCount !== 1 ? "s" : ""}
        </span>
      </div>

      {statusDistribution && responseCount > 0 && (
        <>
          {/* Stacked proportion bar */}
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
            {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map(
              (key) => {
                const count = statusDistribution[key as keyof typeof statusDistribution] ?? 0;
                const pct = Math.round((count / responseCount) * 100);
                if (pct === 0) return null;
                return (
                  <div
                    key={key}
                    className={`h-full ${STATUS_CONFIG[key].bar}`}
                    style={{ width: `${pct}%` }}
                    title={`${STATUS_CONFIG[key].label}: ${count} (${pct}%)`}
                  />
                );
              }
            )}
          </div>

          {/* Legend pills */}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map(
              (key) => {
                const count = statusDistribution[key as keyof typeof statusDistribution] ?? 0;
                if (count === 0) return null;
                const cfg = STATUS_CONFIG[key];
                const Icon = cfg.icon;
                return (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium ring-1 ${cfg.bg} ${cfg.color} ${cfg.ring}`}
                  >
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                    <span className="font-bold">{count}</span>
                  </span>
                );
              }
            )}
          </div>
        </>
      )}

      <p className="text-[10px] text-gray-400">
        Individual entity names and details are visible to admins only.
      </p>
    </div>
  );
}
