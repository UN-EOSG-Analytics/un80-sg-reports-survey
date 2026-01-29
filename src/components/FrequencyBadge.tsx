"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// =============================================================================
// Types
// =============================================================================

export interface FrequencyBadgeProps {
  frequency: string | null;
  calculatedFrequency?: string | null;
  confirmedFrequency?: string | null;
  gapHistory?: number[] | null;
  size?: "xs" | "sm";
}

// =============================================================================
// Helper Functions
// =============================================================================

// Get styling based on confirmation status
// Confirmed: solid gray border with light gray background (same as confirmed entities)
// Calculated: dotted blue border with blue tinted background (auto-derived, might be flawed)
function getFrequencyStyle(isConfirmed: boolean, isOneTime: boolean): string {
  if (isConfirmed) {
    // Confirmed frequency - solid border
    if (isOneTime) {
      return "bg-gray-100 text-gray-500 border border-gray-300";
    }
    return "bg-gray-100 text-gray-800 border border-gray-400";
  }
  
  // Calculated/auto-derived - dotted border (might be flawed)
  if (isOneTime) {
    return "bg-gray-50 text-gray-400 border border-dashed border-gray-300";
  }
  return "bg-blue-50 text-blue-700 border border-dashed border-blue-400";
}

// =============================================================================
// Main Component
// =============================================================================

export function FrequencyBadge({
  frequency,
  calculatedFrequency,
  confirmedFrequency,
  gapHistory,
  size = "sm",
}: FrequencyBadgeProps) {
  // No frequency to display
  if (!frequency) {
    return <span className="text-gray-300 text-xs">—</span>;
  }
  
  const isConfirmed = !!confirmedFrequency;
  const isOneTime = frequency.toLowerCase() === "one-time";
  const style = getFrequencyStyle(isConfirmed, isOneTime);
  
  const sizeClasses = size === "xs" 
    ? "px-1.5 py-0.5 text-[10px]" 
    : "px-2 py-0.5 text-xs";
  
  // Build tooltip content
  const getTooltipContent = () => {
    const lines: string[] = [];
    
    if (isConfirmed) {
      lines.push("✓ Confirmed frequency");
    } else if (calculatedFrequency) {
      lines.push("Auto-calculated from publication history (may need verification)");
    }
    
    // Show gap history for calculated frequencies
    if (!isConfirmed && gapHistory && gapHistory.length > 0) {
      const gapsToShow = gapHistory.slice(0, 4);
      const hasMore = gapHistory.length > 4;
      lines.push(`Year gaps: ${gapsToShow.join(', ')}${hasMore ? '...' : ''}`);
    }
    
    return lines.length > 0 ? lines : ["Reporting frequency"];
  };
  
  const tooltipLines = getTooltipContent();
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center rounded-full font-medium whitespace-nowrap cursor-default ${sizeClasses} ${style}`}
        >
          {frequency}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-0.5">
          {tooltipLines.map((line, i) => (
            <p key={i} className="text-xs">{line}</p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
