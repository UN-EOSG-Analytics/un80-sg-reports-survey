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

// Format frequency for display (replace hyphens with spaces for readability)
function formatFrequency(frequency: string): string {
  // Special case: "one-time" keeps hyphen, others get spaces
  if (frequency.toLowerCase() === "one-time") {
    return frequency;
  }
  return frequency.replace(/-/g, " ");
}

function getFrequencyStyle(isConfirmed: boolean): string {
  if (isConfirmed) {
    return "bg-gray-100 text-gray-800 border border-gray-400";
  }
  return "bg-gray-100 text-gray-800 border border-dashed border-gray-400";
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
  const style = getFrequencyStyle(isConfirmed);
  
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
          {formatFrequency(frequency)}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5">
          {tooltipLines.map((line, i) => (
            <p key={i} className="text-xs">{line}</p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
