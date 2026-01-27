"use client";

import { useEffect, useState } from "react";
import Treemap from "@/components/Treemap";

interface TreemapItem {
  name: string;
  value?: number;
  children?: TreemapItem[];
}

export default function StatsPage() {
  const [data, setData] = useState<TreemapItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats/treemap")
      .then((r) => r.json())
      .then((d) => { setData(d.data); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-2 h-8 w-8 animate-spin rounded-full border-4 border-un-blue border-r-transparent mx-auto" />
          <p className="text-sm text-gray-600">Loading stats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Reports by Type</h1>
        <p className="text-sm text-gray-600 mb-8">
          Hierarchy: Resource Type (989__b) → Document Type (989__c) → Subject Terms
        </p>
        
        <div className="bg-white rounded-lg shadow p-4 pt-8">
          <Treemap data={data} />
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-4 text-xs text-gray-600">
          <div><strong>Level 1:</strong> Resource Type (989__b)</div>
          <div><strong>Level 2:</strong> Document Type (989__c)</div>
          <div><strong>Level 3:</strong> Subject Terms (top 10 per type)</div>
        </div>
      </div>
    </div>
  );
}
