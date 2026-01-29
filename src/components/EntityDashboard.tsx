"use client";

import { useState, useCallback } from "react";
import { ReportsTable } from "./SGReportsList";
import { FileText } from "lucide-react";
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

      {/* Entity Reports Section */}
      <section className="transition-all duration-300 ease-in-out">
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
      <section className="transition-all duration-300 ease-in-out">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Suggested Reports
          <span className="ml-2 text-sm font-normal text-gray-500">
            Reports that may belong to your entity
          </span>
        </h2>
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
