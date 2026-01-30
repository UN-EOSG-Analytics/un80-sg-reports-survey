"use client";

import { useEffect, useRef } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import { useChatStream } from "./useChatStream";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { Trash2, ArrowDown, Loader2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatPanelProps {
  initialPrompt?: string;
  suggestions?: string[];
  className?: string;
}

export function ChatPanel({
  initialPrompt,
  suggestions = [
    "List all SG reports from 2024",
    "What are the most common report topics?",
    "How many reports are published annually?",
  ],
  className = "",
}: ChatPanelProps) {
  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
  } = useChatStream();

  const initialPromptSent = useRef(false);

  // Use stick-to-bottom for proper chat scroll behavior
  // This sticks to bottom during streaming but respects user scroll-up
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } = useStickToBottom({
    initial: "smooth",
    resize: "smooth",
  });

  // Send initial prompt if provided
  useEffect(() => {
    if (initialPrompt && !initialPromptSent.current && messages.length === 0) {
      initialPromptSent.current = true;
      sendMessage(initialPrompt);
    }
  }, [initialPrompt, messages.length, sendMessage]);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Messages area with stick-to-bottom scroll */}
      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto relative"
      >
        <div ref={contentRef} className="p-4 space-y-4 min-h-full">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <p className="text-sm text-gray-500 max-w-sm">
                Ask questions about Secretary-General reports. I can read document
                contents, run database queries, and help you analyze report details.
              </p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              
              {/* Streaming/thinking indicator */}
              {isStreaming && messages.length > 0 && !messages[messages.length - 1]?.content && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin text-un-blue" />
                    <span className="text-sm text-gray-500">Thinking...</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Scroll to bottom button - appears when user scrolls up */}
        {!isAtBottom && messages.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => scrollToBottom()}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 shadow-lg rounded-full px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50"
          >
            <ArrowDown className="h-4 w-4 mr-1" />
            Scroll to bottom
          </Button>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50/50 p-4">
        {messages.length > 0 && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearMessages}
              className="text-gray-500 hover:text-gray-700"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear chat
            </Button>
          </div>
        )}
        <ChatInput
          onSend={sendMessage}
          onStop={stopStreaming}
          isStreaming={isStreaming}
          suggestions={messages.length === 0 ? suggestions : []}
        />
      </div>
    </div>
  );
}
