"use client";

import { useState } from "react";
import {
  FileText,
  Database,
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";
import { ToolCall } from "./useChatStream";

interface ChatToolCallProps {
  toolCall: ToolCall;
}

export function ChatToolCall({ toolCall }: ChatToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get icon based on tool name
  const Icon = toolCall.name === "read_document" ? FileText : Database;

  // Status badge configuration
  const statusConfig = {
    pending: { label: "Pending", className: "bg-gray-100 text-gray-600" },
    running: { label: "Running", className: "bg-blue-100 text-blue-700" },
    complete: { label: "Complete", className: "bg-green-100 text-green-700" },
    error: { label: "Error", className: "bg-red-100 text-red-700" },
  };

  const status = statusConfig[toolCall.status];

  // Format the tool call for display
  const getTitle = () => {
    if (toolCall.name === "read_document") {
      return `Reading document ${toolCall.args.symbol || "..."}`;
    }
    if (toolCall.name === "query_database") {
      return `SQL Query`;
    }
    return toolCall.name;
  };

  // Get tool description
  const getDescription = () => {
    if (toolCall.name === "query_database" && toolCall.args.explanation) {
      return String(toolCall.args.explanation);
    }
    return null;
  };

  // Format result for display
  const formatResult = () => {
    if (!toolCall.result) return null;

    const result = toolCall.result as Record<string, unknown>;

    if (toolCall.name === "read_document" && toolCall.success) {
      const doc = result as {
        symbol?: string;
        title?: string;
        year?: number;
        wordCount?: number;
        text?: string;
      };
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="text-gray-400 uppercase tracking-wide text-[10px]">Symbol</span>
              <p className="font-medium text-gray-900">{doc.symbol}</p>
            </div>
            <div>
              <span className="text-gray-400 uppercase tracking-wide text-[10px]">Year</span>
              <p className="font-medium text-gray-900">{doc.year || "—"}</p>
            </div>
            <div className="col-span-2">
              <span className="text-gray-400 uppercase tracking-wide text-[10px]">Title</span>
              <p className="font-medium text-gray-900">{doc.title || "—"}</p>
            </div>
            <div>
              <span className="text-gray-400 uppercase tracking-wide text-[10px]">Words</span>
              <p className="font-medium text-gray-900">
                {doc.wordCount?.toLocaleString() || "—"}
              </p>
            </div>
          </div>
          {doc.text && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-gray-400 uppercase tracking-wide text-[10px] mb-1">Content Preview</p>
              <p className="text-xs text-gray-600 line-clamp-5 whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded">
                {doc.text.slice(0, 500)}
                {doc.text.length > 500 ? "..." : ""}
              </p>
            </div>
          )}
        </div>
      );
    }

    if (toolCall.name === "query_database" && toolCall.success) {
      const data = result as {
        explanation?: string;
        rowCount?: number;
        rows?: Record<string, unknown>[];
      };
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-medium">{data.rowCount}</span> row{data.rowCount !== 1 ? "s" : ""} returned
          </div>
          {data.rows && data.rows.length > 0 && (
            <div className="overflow-x-auto -mx-3">
              <table className="text-xs w-full min-w-full">
                <thead>
                  <tr className="bg-gray-50 border-y border-gray-100">
                    {Object.keys(data.rows[0]).map((key) => (
                      <th
                        key={key}
                        className="text-left px-3 py-2 font-medium text-gray-500 uppercase tracking-wide text-[10px]"
                      >
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-3 py-2 text-gray-700 font-mono">
                          {formatValue(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.rows.length > 10 && (
                <p className="text-xs text-gray-400 mt-2 px-3">
                  Showing 10 of {data.rows.length} rows
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    // Error or unknown result
    if (!toolCall.success) {
      const errorResult = result as { error?: string } | string;
      const errorMessage =
        typeof errorResult === "string"
          ? errorResult
          : errorResult.error || "Unknown error";
      return (
        <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 p-2 rounded">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>{errorMessage}</p>
        </div>
      );
    }

    // Fallback: show JSON
    return (
      <pre className="text-xs text-gray-600 overflow-x-auto font-mono bg-gray-50 p-2 rounded">
        {JSON.stringify(result, null, 2)}
      </pre>
    );
  };

  const description = getDescription();

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-all ${
        toolCall.status === "error"
          ? "border-red-200 bg-red-50/50"
          : "border-gray-200 bg-white shadow-sm"
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50/50 transition-colors"
      >
        {/* Tool icon */}
        <div className={`p-1.5 rounded-lg ${
          toolCall.status === "error" ? "bg-red-100" : "bg-gray-100"
        }`}>
          <Icon className={`h-4 w-4 ${
            toolCall.status === "error" ? "text-red-600" : "text-gray-600"
          }`} />
        </div>

        {/* Title and description */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{getTitle()}</p>
          {description && (
            <p className="text-xs text-gray-500 truncate">{description}</p>
          )}
        </div>

        {/* Status badge */}
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${status.className}`}>
          {toolCall.status === "running" && (
            <Loader2 className="h-3 w-3 animate-spin" />
          )}
          {toolCall.status === "complete" && (
            <Check className="h-3 w-3" />
          )}
          {toolCall.status === "error" && (
            <AlertCircle className="h-3 w-3" />
          )}
          <span>{status.label}</span>
        </div>

        {/* Expand chevron */}
        {toolCall.result !== undefined && (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          )
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && toolCall.result !== undefined && (
        <div className="px-3 pb-3 border-t border-gray-100">
          {/* Query preview for database queries */}
          {toolCall.name === "query_database" && typeof toolCall.args.query === "string" && (
            <div className="mt-3 mb-3">
              <p className="text-gray-400 uppercase tracking-wide text-[10px] mb-1.5">SQL Query</p>
              <pre className="p-3 bg-gray-900 rounded-lg text-xs font-mono text-gray-100 overflow-x-auto">
                {toolCall.args.query}
              </pre>
            </div>
          )}
          <div className="mt-3">{formatResult()}</div>
        </div>
      )}
    </div>
  );
}

// Helper to format cell values
function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}
