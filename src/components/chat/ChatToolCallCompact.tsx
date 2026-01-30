"use client";

import { useState } from "react";
import { FileText, Database, ChevronDown, ChevronRight, Loader2, Check, AlertCircle } from "lucide-react";
import { ToolCall } from "./ChatContext";

interface ChatToolCallCompactProps {
  toolCall: ToolCall;
}

export function ChatToolCallCompact({ toolCall }: ChatToolCallCompactProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const Icon = toolCall.name === "read_document" ? FileText : Database;

  const getTitle = () => {
    if (toolCall.name === "read_document") {
      return `Read ${toolCall.args.symbol || "..."}`;
    }
    if (toolCall.name === "query_database") {
      return "SQL Query";
    }
    return toolCall.name;
  };

  const formatResult = () => {
    if (!toolCall.result) return null;
    const result = toolCall.result as Record<string, unknown>;

    if (toolCall.name === "read_document" && toolCall.success) {
      const doc = result as { symbol?: string; title?: string; wordCount?: number };
      return (
        <div className="text-[9px] text-gray-500 space-y-0.5">
          <p><span className="text-gray-400">Title:</span> {doc.title || "—"}</p>
          <p><span className="text-gray-400">Words:</span> {doc.wordCount?.toLocaleString() || "—"}</p>
        </div>
      );
    }

    if (toolCall.name === "query_database" && toolCall.success) {
      const data = result as { rowCount?: number; rows?: Record<string, unknown>[] };
      return (
        <div className="text-[9px] text-gray-500">
          <p>{data.rowCount} row{data.rowCount !== 1 ? "s" : ""}</p>
          {data.rows && data.rows.length > 0 && (
            <div className="overflow-x-auto mt-1 -mx-1">
              <table className="text-[9px] w-full">
                <thead>
                  <tr className="bg-gray-100">
                    {Object.keys(data.rows[0]).slice(0, 4).map((k) => (
                      <th key={k} className="px-1 py-0.5 text-left font-medium text-gray-500 truncate max-w-[60px]">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      {Object.values(row).slice(0, 4).map((v, j) => (
                        <td key={j} className="px-1 py-0.5 text-gray-600 truncate max-w-[60px]">{String(v ?? "—")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.rows.length > 5 && <p className="text-[8px] text-gray-400 mt-0.5">+{data.rows.length - 5} more</p>}
            </div>
          )}
        </div>
      );
    }

    if (!toolCall.success) {
      const err = result as { error?: string } | string;
      return <p className="text-[9px] text-red-500">{typeof err === "string" ? err : err.error}</p>;
    }

    return <pre className="text-[8px] text-gray-500 overflow-x-auto">{JSON.stringify(result, null, 1)}</pre>;
  };

  return (
    <div className={`rounded border text-[10px] ${toolCall.status === "error" ? "border-red-200 bg-red-50/50" : "border-gray-200 bg-white"}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-gray-50/50"
      >
        <Icon className="h-3 w-3 text-gray-400 flex-shrink-0" />
        <span className="flex-1 text-gray-600 truncate">{getTitle()}</span>
        {toolCall.status === "running" && <Loader2 className="h-2.5 w-2.5 animate-spin text-un-blue" />}
        {toolCall.status === "complete" && <Check className="h-2.5 w-2.5 text-green-500" />}
        {toolCall.status === "error" && <AlertCircle className="h-2.5 w-2.5 text-red-500" />}
        {toolCall.result !== undefined && (
          isExpanded ? <ChevronDown className="h-2.5 w-2.5 text-gray-400" /> : <ChevronRight className="h-2.5 w-2.5 text-gray-400" />
        )}
      </button>
      {isExpanded && toolCall.result !== undefined && (
        <div className="px-2 pb-1.5 border-t border-gray-100">
          {toolCall.name === "query_database" && typeof toolCall.args.query === "string" && (
            <pre className="mt-1 p-1 bg-gray-800 rounded text-[8px] text-gray-200 overflow-x-auto max-h-[60px]">{toolCall.args.query}</pre>
          )}
          <div className="mt-1">{formatResult()}</div>
        </div>
      )}
    </div>
  );
}
