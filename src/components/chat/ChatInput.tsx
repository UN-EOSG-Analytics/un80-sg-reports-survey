"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Send, Square, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  placeholder?: string;
  initialValue?: string;
  suggestions?: string[];
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  placeholder = "Ask about UN reports...",
  initialValue = "",
  suggestions = [],
}: ChatInputProps) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Focus on mount if initial value provided
  useEffect(() => {
    if (initialValue) {
      textareaRef.current?.focus();
    }
  }, [initialValue]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onSend(suggestion);
  };

  return (
    <div className="space-y-3">
      {/* Horizontal scrolling suggestion pills */}
      {suggestions.length > 0 && !value && (
        <div className="relative -mx-4 px-4">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="flex-shrink-0 px-4 py-2 text-sm bg-white hover:bg-gray-100 text-gray-700 rounded-full border border-gray-200 transition-colors whitespace-nowrap shadow-sm hover:shadow"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area - ChatGPT style */}
      <div className="relative bg-white border border-gray-200 rounded-2xl shadow-sm focus-within:border-un-blue focus-within:ring-1 focus-within:ring-un-blue transition-all">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isStreaming}
          rows={1}
          className="w-full resize-none bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-none min-h-[48px] max-h-[200px] py-3 pl-4 pr-12"
        />

        {/* Submit/Stop button */}
        <div className="absolute right-2 bottom-2">
          {isStreaming ? (
            <Button
              variant="outline"
              size="icon"
              onClick={onStop}
              className="h-8 w-8 rounded-lg bg-gray-100 hover:bg-gray-200 border-0"
            >
              <Square className="h-4 w-4" />
              <span className="sr-only">Stop generating</span>
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!value.trim()}
              className="h-8 w-8 rounded-lg bg-un-blue hover:bg-un-blue/90 disabled:bg-gray-200 disabled:text-gray-400"
            >
              <ArrowUp className="h-4 w-4" />
              <span className="sr-only">Send message</span>
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}
