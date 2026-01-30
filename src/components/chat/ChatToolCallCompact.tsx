"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { ToolCall } from "./ChatContext";

interface ChatToolCallCompactProps {
  toolCall: ToolCall;
}

export function ChatToolCallCompact({ toolCall }: ChatToolCallCompactProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQuery, setShowQuery] = useState(false);

  // User-friendly action names
  const getTitle = () => {
    if (toolCall.name === "read_document") {
      const symbol = toolCall.args.symbol || "document";
      if (toolCall.status === "running") return `Reading ${symbol}...`;
      if (toolCall.status === "error") return `Failed to read ${symbol}`;
      return `Read ${symbol}`;
    }
    if (toolCall.name === "query_database") {
      if (toolCall.status === "running") return "Searching reports...";
      if (toolCall.status === "error") return "Search failed";
      return "Searched reports";
    }
    return toolCall.name;
  };

  const formatResult = () => {
    if (!toolCall.result) return null;
    const result = toolCall.result as Record<string, unknown>;

    if (toolCall.name === "read_document" && toolCall.success) {
      const doc = result as { symbol?: string; title?: string; wordCount?: number };
      return (
        <div className="text-xs text-gray-500 space-y-0.5 mt-1">
          <p><span className="text-gray-400">Title:</span> {doc.title || "—"}</p>
          <p><span className="text-gray-400">Length:</span> {doc.wordCount?.toLocaleString() || "—"} words</p>
        </div>
      );
    }

    if (toolCall.name === "query_database" && toolCall.success) {
      const data = result as { rowCount?: number; rows?: Record<string, unknown>[] };
      return (
        <div className="text-xs text-gray-500 mt-1">
          <p className="text-gray-400 mb-1">Found {data.rowCount} result{data.rowCount !== 1 ? "s" : ""}</p>
          {data.rows && data.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="text-[11px] w-full">
                <thead>
                  <tr className="bg-gray-100">
                    {Object.keys(data.rows[0]).slice(0, 4).map((k) => (
                      <th key={k} className="px-1.5 py-0.5 text-left font-medium text-gray-500 truncate max-w-[90px]">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      {Object.values(row).slice(0, 4).map((v, j) => (
                        <td key={j} className="px-1.5 py-0.5 text-gray-600 truncate max-w-[90px]">{String(v ?? "—")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.rows.length > 5 && <p className="text-[10px] text-gray-400 mt-0.5">+{data.rows.length - 5} more</p>}
            </div>
          )}
        </div>
      );
    }

    if (!toolCall.success) {
      const err = result as { error?: string } | string;
      return <p className="text-xs text-red-500 mt-1">{typeof err === "string" ? err : err.error}</p>;
    }

    return <pre className="text-[10px] text-gray-500 overflow-x-auto mt-1">{JSON.stringify(result, null, 1)}</pre>;
  };

  const hasResult = toolCall.result !== undefined;
  const isRunning = toolCall.status === "running";

  return (
    <div className="text-xs">
      {/* Simple inline action indicator */}
      <button
        onClick={() => hasResult && setIsExpanded(!isExpanded)}
        disabled={!hasResult}
        className={`flex items-center gap-1 text-gray-400 ${hasResult ? "hover:text-gray-600 cursor-pointer" : ""}`}
      >
        {isRunning && <Loader2 className="h-3 w-3 animate-spin" />}
        <span className={toolCall.status === "error" ? "text-red-400" : ""}>{getTitle()}</span>
        {hasResult && (
          isExpanded 
            ? <ChevronDown className="h-3 w-3" /> 
            : <ChevronRight className="h-3 w-3" />
        )}
      </button>
      
      {/* Expanded details */}
      {isExpanded && hasResult && (
        <div className="ml-3 pl-2 border-l border-gray-200 mt-1">
          {formatResult()}
          
          {/* Query details for power users */}
          {toolCall.name === "query_database" && typeof toolCall.args.query === "string" && (
            <div className="mt-2">
              <button
                onClick={() => setShowQuery(!showQuery)}
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-500"
              >
                {showQuery ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                Show query
              </button>
              {showQuery && (
                <p className="mt-1 text-[10px] text-gray-400 font-mono whitespace-pre-wrap break-all">
                  {toolCall.args.query}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
