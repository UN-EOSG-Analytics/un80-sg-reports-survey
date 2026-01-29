"use client";

import { useState, useCallback } from "react";
import { ReportsTable } from "./SGReportsList";
import { FileText } from "lucide-react";
import Link from "next/link";

interface Props {
  entity: string;
  userName?: string | null;
}

export function EntityDashboard({ entity, userName }: Props) {
  const [myReportsKey, setMyReportsKey] = useState(0);
  const [suggestedReportsKey, setSuggestedReportsKey] = useState(0);

  // When a report is added from suggestions, refresh both sections
  const handleReportAdded = useCallback(() => {
    setMyReportsKey((prev) => prev + 1);
    setSuggestedReportsKey((prev) => prev + 1);
  }, []);

  // When a report is removed from my reports, refresh both sections
  const handleReportRemoved = useCallback(() => {
    setMyReportsKey((prev) => prev + 1);
    setSuggestedReportsKey((prev) => prev + 1);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            SG Reports by {entity}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your entity&apos;s Secretary-General reports and complete surveys
          </p>
        </div>
        <Link
          href="/reports"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <FileText className="h-4 w-4" />
          Browse All Reports
        </Link>
      </div>

      {/* My Reports Section */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          My Reports
        </h2>
        <ReportsTable
          key={`my-${myReportsKey}`}
          mode="my"
          entity={entity}
          userEntity={entity}
          showAddSearch={true}
          onReportRemoved={handleReportRemoved}
        />
      </section>

      {/* Suggested Reports Section */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Suggested Reports
          <span className="ml-2 text-sm font-normal text-gray-500">
            Reports that may belong to your entity
          </span>
        </h2>
        <ReportsTable
          key={`suggested-${suggestedReportsKey}`}
          mode="suggested"
          entity={entity}
          userEntity={entity}
          onReportAdded={handleReportAdded}
        />
      </section>
    </div>
  );
}
