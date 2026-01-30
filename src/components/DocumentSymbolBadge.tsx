"use client";

import { FileText } from "lucide-react";

// =============================================================================
// Helper Functions
// =============================================================================

// Build ODS link from document symbol
// Uses undocs.org which is the official UN shortlink service
function buildODSLink(symbol: string): string {
  return `https://undocs.org/en/${encodeURIComponent(symbol)}`;
}

// =============================================================================
// Types
// =============================================================================

export interface DocumentSymbolBadgeProps {
  symbol: string;
  size?: "xs" | "sm" | "md";
  maxLength?: number;
  showIcon?: boolean;
  linkToODS?: boolean;
  className?: string;
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * Reusable document symbol badge
 * Can optionally link to ODS (Official Document System)
 * Provides consistent styling across the app
 */
export function DocumentSymbolBadge({
  symbol,
  size = "sm",
  maxLength,
  showIcon = false,
  linkToODS = false,
  className = "",
}: DocumentSymbolBadgeProps) {
  const sizeClasses = {
    xs: "px-1.5 py-0.5 text-[10px]",
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
  }[size];

  // Truncate symbol if maxLength is provided
  const displaySymbol =
    maxLength && symbol.length > maxLength
      ? `${symbol.slice(0, maxLength)}…`
      : symbol;

  const baseClasses = `inline-flex items-center gap-1 rounded bg-blue-50 font-medium text-un-blue whitespace-nowrap ${sizeClasses} ${className}`;

  const content = (
    <>
      {showIcon && <FileText className="h-2.5 w-2.5 flex-shrink-0" />}
      <span className={maxLength ? "truncate" : ""}>{displaySymbol}</span>
    </>
  );

  if (linkToODS) {
    return (
      <a
        href={buildODSLink(symbol)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`${baseClasses} hover:bg-blue-100 transition-colors`}
        title={symbol}
      >
        {content}
      </a>
    );
  }

  return (
    <span className={baseClasses} title={symbol}>
      {content}
    </span>
  );
}

/**
 * Helper to export the buildODSLink function for use in other components
 */
export { buildODSLink };
