"use client";

import { useState, useCallback } from "react";
import { ReportsTable } from "./SGReportsList";
import { FileText, Info } from "lucide-react";
import Link from "next/link";

interface Props {
  entity: string;
  userName?: string | null;  // Actually the user's email
}

export function EntityDashboard({ entity, userName }: Props) {
  const userEmail = userName;  // userName is actually the email
  
  // Single version counter - any data change triggers refetch of both tables
  const [dataVersion, setDataVersion] = useState(0);

  // Called when any report is added or removed from either table
  const handleDataChanged = useCallback(() => {
    setDataVersion((v) => v + 1);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {entity} Reports
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your entity&apos;s SG reports and provide feedback
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

      {/* Instructions Banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-un-blue flex-shrink-0 mt-0.5" />
          <div className="space-y-3 text-sm text-gray-700">
            <p className="font-medium text-gray-900">How to provide feedback:</p>
            <ol className="space-y-2 list-none">
              <li className="flex items-start gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-un-blue text-white text-xs font-medium flex-shrink-0">1</span>
                <span><strong>Build your reports list:</strong> Add all recurring SG reports that {entity} is responsible for. Use the search below or add from the suggestions.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-un-blue text-white text-xs font-medium flex-shrink-0">2</span>
                <span><strong>Provide feedback on each report:</strong> Click on a report to open the survey panel and share your perspective.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-un-blue text-white text-xs font-medium flex-shrink-0">3</span>
                <span><strong>Track your progress:</strong> The &quot;Survey&quot; column shows which reports you&apos;ve provided feedback on.</span>
              </li>
            </ol>
          </div>
        </div>
      </div>

      {/* Entity Reports Section */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {entity} Reports
        </h2>
        <ReportsTable
          mode="my"
          entity={entity}
          userEntity={entity}
          userEmail={userEmail}
          showAddSearch={true}
          onDataChanged={handleDataChanged}
          refetchTrigger={dataVersion}
        />
      </section>

      {/* Suggested Reports Section */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Suggested Reports
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            These reports may belong to {entity} based on their content. Click the <span className="inline-flex items-center justify-center w-4 h-4 text-un-blue border border-un-blue rounded-full align-text-bottom mx-0.5 text-[10px]">+</span> button to add any that are yours, or ignore those that aren&apos;t.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Reports are from 2023 to present, sourced from the{" "}
            <a
              href="https://digitallibrary.un.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-un-blue hover:underline"
            >
              UN Digital Library
            </a>
            . Entity assignments are based on official metadata and/or AI identification. Report details (body, year, subjects) come from official data; reporting frequency is estimated from past publication dates.
          </p>
        </div>
        <ReportsTable
          mode="suggested"
          entity={entity}
          userEntity={entity}
          userEmail={userEmail}
          onDataChanged={handleDataChanged}
          refetchTrigger={dataVersion}
        />
      </section>
    </div>
  );
}
