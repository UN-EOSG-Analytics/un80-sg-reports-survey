"use client";

import { useEffect, useState } from "react";
import type { SurveyProgressData } from "@/app/api/stats/progress/route";

export function ProgressBar() {
  const [data, setData] = useState<SurveyProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats/progress")
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((json) => {
        if (json && !json.error) setData(json as SurveyProgressData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data || data.totalReports === 0) return null;

  const { completedTotal, totalReports, percentage, completedSurveys, oneTimeConfirmations } = data;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">Survey Progress</span>
        <span className="text-sm font-semibold text-gray-900">
          {completedTotal} / {totalReports} reports completed
          <span className="ml-2 text-xs font-normal text-gray-500">({percentage}%)</span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor: "var(--color-un-blue, #009edb)",
          }}
        />
      </div>

      {/* Breakdown */}
      {(completedSurveys > 0 || oneTimeConfirmations > 0) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          {completedSurveys > 0 && (
            <span>
              <span className="font-medium text-gray-700">{completedSurveys}</span> survey{completedSurveys !== 1 ? "s" : ""} submitted
            </span>
          )}
          {oneTimeConfirmations > 0 && (
            <span>
              <span className="font-medium text-gray-700">{oneTimeConfirmations}</span> confirmed one-time
            </span>
          )}
          {totalReports - completedTotal > 0 && (
            <span>
              <span className="font-medium text-gray-700">{totalReports - completedTotal}</span> remaining
            </span>
          )}
        </div>
      )}
    </div>
  );
}
