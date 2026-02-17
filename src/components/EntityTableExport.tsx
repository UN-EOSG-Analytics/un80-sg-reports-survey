"use client";

import { Download } from "lucide-react";
import * as XLSX from "xlsx";

interface EntityRow {
  entity: string;
  userCount: number;
  suggestedReports: number;
  confirmedReports: number;
  reportsWithResponse: number;
  respondingUsers: number;
}

function getStatus(e: EntityRow): string {
  if (e.reportsWithResponse > 0) return "Responded";
  if (e.confirmedReports > 0) return "In Progress";
  if (e.suggestedReports > 0) return "Not Started";
  return "";
}

function toRows(entities: EntityRow[]) {
  return entities.map((e) => ({
    Entity: e.entity,
    Status: getStatus(e),
    "Users Signed In": e.userCount,
    "Users Active": e.respondingUsers,
    "Reports Suggested": e.suggestedReports,
    "Reports Confirmed": e.confirmedReports,
    "Reports with Response": e.reportsWithResponse,
  }));
}

export function EntityTableExport({ entities }: { entities: EntityRow[] }) {
  function downloadCSV() {
    const rows = toRows(entities);
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers
          .map((h) => {
            const val = String(r[h as keyof typeof r] ?? "");
            return val.includes(",") ? `"${val}"` : val;
          })
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "entity-progress.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadExcel() {
    const rows = toRows(entities);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Entity Progress");
    XLSX.writeFile(wb, "entity-progress.xlsx");
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={downloadCSV}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
      >
        <Download className="h-3.5 w-3.5" />
        CSV
      </button>
      <button
        onClick={downloadExcel}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
      >
        <Download className="h-3.5 w-3.5" />
        Excel
      </button>
    </div>
  );
}
