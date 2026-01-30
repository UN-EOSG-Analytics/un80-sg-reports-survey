"use client";

import { useEffect, useState, useRef } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import { useChatContext } from "./ChatContext";
import { ChatMessageCompact } from "./ChatMessageCompact";
import { Trash2, ArrowDown, Loader2, Bot, ArrowUp } from "lucide-react";

const DEFAULT_SUGGESTIONS = [
  "Summarize report A/79/XXX",
  "Compare A/78/123 with A/79/456",
  "Find resolutions mandating climate reports",
];

export function ChatPanelWidget() {
  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
    prefillValue,
    clearPrefill,
  } = useChatContext();

  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Use stick-to-bottom for proper chat scroll behavior
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } = useStickToBottom({
    initial: "smooth",
    resize: "smooth",
  });

  // Handle prefill from context
  useEffect(() => {
    if (prefillValue) {
      setInputValue(prefillValue);
      clearPrefill();
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = textareaRef.current.value.length;
        }
      }, 50);
    }
  }, [prefillValue, clearPrefill]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto relative"
      >
        <div ref={contentRef} className="p-3 space-y-2.5 min-h-full">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8 px-4">
              <p className="text-xs text-gray-400 leading-relaxed mb-4">
                Ask about reports, compare documents, or find mandating resolutions.
              </p>
              {/* Suggestions */}
              <div className="flex flex-wrap justify-center gap-1.5">
                {DEFAULT_SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInputValue(s)}
                    className="px-2.5 py-1 text-[10px] text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessageCompact key={message.id} message={message} />
              ))}
              
              {/* Thinking indicator */}
              {isStreaming && messages.length > 0 && !messages[messages.length - 1]?.content && (
                <div className="flex gap-1.5 items-center">
                  <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                    <Bot className="h-2.5 w-2.5 text-gray-500" />
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded text-[10px] text-gray-500">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    Thinking...
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-[10px] text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Scroll button */}
        {!isAtBottom && messages.length > 0 && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[9px] bg-white border border-gray-200 rounded-full shadow-sm hover:bg-gray-50 text-gray-500"
          >
            <ArrowDown className="h-2.5 w-2.5 inline mr-0.5" />
            New
          </button>
        )}
      </div>

      {/* Input area - full width */}
      <div className="flex-shrink-0 border-t border-gray-100 bg-gray-50/50 p-2">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about reports..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 resize-none bg-white border border-gray-200 rounded-lg text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-un-blue focus:ring-1 focus:ring-un-blue py-2 px-2.5 min-h-[36px] max-h-[120px] leading-relaxed"
          />
          
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="flex-shrink-0 h-9 w-9 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
            >
              <div className="h-2.5 w-2.5 bg-gray-600 rounded-sm" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="flex-shrink-0 h-9 w-9 rounded-lg bg-un-blue hover:bg-un-blue/90 disabled:bg-gray-200 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <ArrowUp className="h-4 w-4 text-white" />
            </button>
          )}

          {/* Clear button - next to send */}
          {messages.length > 0 && !isStreaming && (
            <button
              onClick={clearMessages}
              className="flex-shrink-0 h-9 w-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors text-gray-400 hover:text-gray-600"
              title="Clear chat"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
