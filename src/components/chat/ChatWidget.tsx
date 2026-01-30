"use client";

import { useRef, useEffect, useState } from "react";
import { Sparkles, X, Trash2, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "./ChatContext";
import { ChatPanelWidget } from "./ChatPanelWidget";

export function ChatWidget() {
  const { isOpen, setIsOpen, messages, clearMessages, isStreaming } = useChatContext();
  const panelRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (target.closest('[data-chat-toggle]')) return;
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, setIsOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, setIsOpen]);

  return (
    <>
      {/* Chat popup panel - LEFT side, larger size, expandable */}
      {isOpen && (
        <div
          ref={panelRef}
          className={`fixed z-50 animate-in slide-in-from-bottom-4 fade-in duration-200 ${
            isExpanded 
              ? "top-4 left-4 right-4 bottom-16" // Expanded: padding on top/left/right, keep bottom-16
              : "bottom-16 left-4 w-[440px] h-[600px]" // Normal size
          }`}
        >
          <div className="flex flex-col h-full overflow-hidden rounded-xl shadow-2xl border border-gray-200 bg-white">
            {/* Compact header with expand, clear, and close buttons */}
            <div className="flex-shrink-0 border-b border-gray-100 py-2.5 px-3 flex items-center justify-between bg-gray-50/80">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-un-blue" />
                <span className="text-sm font-medium text-gray-700">AI Assistant</span>
              </div>
              <div className="flex items-center gap-1">
                {/* Clear button in header - always visible when there are messages */}
                {messages.length > 0 && (
                  <button
                    onClick={clearMessages}
                    className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Clear chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Expand/unexpand button */}
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                  title={isExpanded ? "Restore size" : "Expand"}
                >
                  {isExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Chat content */}
            <div className="flex-1 flex flex-col min-h-0">
              <ChatPanelWidget />
            </div>
          </div>
        </div>
      )}

      {/* Floating toggle button - LEFT side */}
      <Button
        data-chat-toggle
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-4 left-4 z-50 h-11 w-11 rounded-full shadow-lg transition-all ${
          isOpen
            ? "bg-gray-500 hover:bg-gray-600"
            : "bg-un-blue hover:bg-un-blue/90"
        }`}
        size="icon"
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Sparkles className="h-5 w-5" />
        )}
        <span className="sr-only">{isOpen ? "Close AI" : "Open AI"}</span>
      </Button>
    </>
  );
}
