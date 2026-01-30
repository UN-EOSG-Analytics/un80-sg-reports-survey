"use client";

import { useRef, useEffect } from "react";
import { MessageSquare, X, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "./ChatContext";
import { ChatPanelWidget } from "./ChatPanelWidget";

export function ChatWidget() {
  const { isOpen, setIsOpen } = useChatContext();
  const panelRef = useRef<HTMLDivElement>(null);

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
      {/* Chat popup panel - LEFT side, larger size */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed bottom-16 left-4 z-50 w-[380px] h-[520px] animate-in slide-in-from-bottom-4 fade-in duration-200"
        >
          <div className="flex flex-col h-full overflow-hidden rounded-xl shadow-2xl border border-gray-200 bg-white">
            {/* Compact header */}
            <div className="flex-shrink-0 border-b border-gray-100 py-2 px-3 flex items-center justify-between bg-gray-50/80">
              <div className="flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5 text-un-blue" />
                <span className="text-xs font-medium text-gray-700">AI Assistant</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
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
          <MessageSquare className="h-5 w-5" />
        )}
        <span className="sr-only">{isOpen ? "Close chat" : "Open chat"}</span>
      </Button>
    </>
  );
}
