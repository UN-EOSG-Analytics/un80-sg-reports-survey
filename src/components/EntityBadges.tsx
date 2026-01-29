"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// =============================================================================
// Types
// =============================================================================

export interface EntitySuggestion {
  entity: string;
  source: string;
  confidence_score?: number | null;
}

export interface EntityBadgesProps {
  suggestions?: EntitySuggestion[];
  confirmedEntities?: string[];
  maxVisible?: number;
  size?: "xs" | "sm";
}

// =============================================================================
// Helper Functions
// =============================================================================

// Get styling based on source reliability
// Confirmed: solid gray border with light gray background
// Suggested: dotted blue border with blue tinted backgrounds (dark/mid/light based on reliability)
function getEntityStyle(source: string, isConfirmed: boolean): string {
  if (isConfirmed) {
    // Confirmed entities - solid gray border with light gray background
    return "bg-gray-100 text-gray-800 border border-gray-400";
  }
  
  switch (source.toLowerCase()) {
    case "dgacm":
      // Most reliable - dark blue dotted border with blue background
      return "bg-blue-50 text-blue-800 border border-dashed border-blue-600";
    case "dri":
      // Medium reliability - medium blue dotted border
      return "bg-blue-50/70 text-blue-600 border border-dashed border-blue-400";
    case "ai":
      // Least reliable - light blue dotted border
      return "bg-blue-50/50 text-blue-500 border border-dashed border-blue-300";
    default:
      return "bg-gray-50 text-gray-600 border border-dashed border-gray-300";
  }
}


// Source priority for sorting (lower is better/more reliable)
const SOURCE_PRIORITY: Record<string, number> = {
  confirmed: 0,
  dgacm: 1,
  dri: 2,
  ai: 3,
};

// Deduplicate and sort entities by reliability
// Sort order: confirmed > dgacm > dri > ai
function deduplicateEntities(
  suggestions: EntitySuggestion[],
  confirmedEntities: string[]
): Array<{ entity: string; source: string; isConfirmed: boolean; confidence?: number | null }> {
  const confirmedSet = new Set(confirmedEntities.map(e => e.toLowerCase()));
  const entityMap = new Map<string, { entity: string; source: string; confidence?: number | null }>();
  
  // Process suggestions and keep highest priority source for each entity
  for (const suggestion of suggestions) {
    const key = suggestion.entity.toLowerCase();
    const existing = entityMap.get(key);
    const currentPriority = SOURCE_PRIORITY[suggestion.source.toLowerCase()] ?? 99;
    const existingPriority = existing 
      ? SOURCE_PRIORITY[existing.source.toLowerCase()] ?? 99 
      : Infinity;
    
    if (currentPriority < existingPriority) {
      entityMap.set(key, { 
        entity: suggestion.entity,
        source: suggestion.source, 
        confidence: suggestion.confidence_score 
      });
    }
  }
  
  // Build result array
  const result: Array<{ entity: string; source: string; isConfirmed: boolean; confidence?: number | null }> = [];
  const addedEntities = new Set<string>();
  
  // Add confirmed entities first
  for (const entity of confirmedEntities) {
    const key = entity.toLowerCase();
    if (!addedEntities.has(key)) {
      addedEntities.add(key);
      const suggestionInfo = entityMap.get(key);
      result.push({
        entity,
        source: suggestionInfo?.source || "confirmed",
        isConfirmed: true,
        confidence: suggestionInfo?.confidence,
      });
    }
  }
  
  // Add suggested entities that aren't confirmed
  for (const [key, info] of entityMap) {
    if (!addedEntities.has(key)) {
      addedEntities.add(key);
      result.push({
        entity: info.entity,
        source: info.source,
        isConfirmed: false,
        confidence: info.confidence,
      });
    }
  }
  
  // Sort by reliability: confirmed first, then dgacm, dri, ai
  result.sort((a, b) => {
    // Confirmed always comes first
    if (a.isConfirmed && !b.isConfirmed) return -1;
    if (!a.isConfirmed && b.isConfirmed) return 1;
    
    // Then sort by source priority
    const priorityA = SOURCE_PRIORITY[a.source.toLowerCase()] ?? 99;
    const priorityB = SOURCE_PRIORITY[b.source.toLowerCase()] ?? 99;
    return priorityA - priorityB;
  });
  
  return result;
}

// =============================================================================
// Components
// =============================================================================

// Single entity badge
function EntityBadge({
  entity,
  source,
  isConfirmed,
  confidence,
  size = "sm",
}: {
  entity: string;
  source: string;
  isConfirmed: boolean;
  confidence?: number | null;
  size?: "xs" | "sm";
}) {
  const sizeClasses = size === "xs" 
    ? "px-1.5 py-0.5 text-[10px]" 
    : "px-2 py-0.5 text-xs";
  
  const style = getEntityStyle(source, isConfirmed);
  
  // Build tooltip content
  const getTooltipContent = () => {
    if (isConfirmed) {
      return `Confirmed report by ${entity}`;
    }
    
    switch (source.toLowerCase()) {
      case "dgacm":
        return `DGACM data indicates ${entity} report`;
      case "dri":
        return `DRI data indicates ${entity} report`;
      case "ai":
        return `AI suggests ${entity} report`;
      default:
        return `${entity} report`;
    }
  };
  
  const tooltipContent = getTooltipContent();
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center rounded-full font-medium whitespace-nowrap cursor-default ${sizeClasses} ${style}`}
        >
          {entity}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="text-xs">{tooltipContent}</span>
      </TooltipContent>
    </Tooltip>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function EntityBadges({
  suggestions = [],
  confirmedEntities = [],
  maxVisible = 3,
  size = "sm",
}: EntityBadgesProps) {
  // Deduplicate entities keeping highest priority source
  const entities = deduplicateEntities(suggestions, confirmedEntities);
  
  if (entities.length === 0) {
    return <span className="text-gray-300 text-xs">—</span>;
  }
  
  const visible = entities.slice(0, maxVisible);
  const remaining = entities.length - maxVisible;
  
  // If we have overflow, show tooltip with all entities
  if (remaining > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 cursor-default">
            {visible.map((e) => (
              <EntityBadge
                key={e.entity}
                entity={e.entity}
                source={e.source}
                isConfirmed={e.isConfirmed}
                confidence={e.confidence}
                size={size}
              />
            ))}
            <span className="text-[10px] text-gray-400">+{remaining}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs p-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-700 mb-1">All entities:</p>
            <div className="flex flex-wrap gap-1">
              {entities.map((e) => (
                <EntityBadge
                  key={e.entity}
                  entity={e.entity}
                  source={e.source}
                  isConfirmed={e.isConfirmed}
                  confidence={e.confidence}
                  size="xs"
                />
              ))}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  // Show all badges inline
  return (
    <div className="flex items-center gap-1">
      {visible.map((e) => (
        <EntityBadge
          key={e.entity}
          entity={e.entity}
          source={e.source}
          isConfirmed={e.isConfirmed}
          confidence={e.confidence}
          size={size}
        />
      ))}
    </div>
  );
}
