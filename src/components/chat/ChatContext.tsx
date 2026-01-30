"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";

// =============================================================================
// Types
// =============================================================================

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  success?: boolean;
  status: "pending" | "running" | "complete" | "error";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  timestamp: Date;
}

type SSEEvent =
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: unknown; success: boolean }
  | { type: "text_delta"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };

interface ChatContextValue {
  // Widget visibility
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  
  // Pre-fill input (opens widget, sets text, doesn't send)
  prefillPrompt: (text: string) => void;
  prefillValue: string;
  clearPrefill: () => void;
  
  // Chat state
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  
  // Actions
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  clearMessages: () => void;
}

// =============================================================================
// Context
// =============================================================================

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}

// =============================================================================
// Provider
// =============================================================================

export function ChatProvider({ children }: { children: ReactNode }) {
  // Widget visibility
  const [isOpen, setIsOpen] = useState(false);
  
  // Pre-fill value for input
  const [prefillValue, setPrefillValue] = useState("");
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Generate unique ID
  const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Pre-fill prompt: opens widget and sets input text
  const prefillPrompt = useCallback((text: string) => {
    setPrefillValue(text);
    setIsOpen(true);
  }, []);

  // Clear pre-fill after it's been used
  const clearPrefill = useCallback(() => {
    setPrefillValue("");
  }, []);

  // Send a message and stream the response
  const sendMessage = useCallback(async (content: string) => {
    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setError(null);

    // Create assistant message placeholder
    const assistantId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      toolCalls: [],
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);

    // Prepare request - get current messages for API call
    const currentMessages = [...messages, userMessage];
    const apiMessages = currentMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete events
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          try {
            const event: SSEEvent = JSON.parse(line.slice(6));

            switch (event.type) {
              case "tool_start":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          toolCalls: [
                            ...(m.toolCalls || []),
                            {
                              name: event.name,
                              args: event.args,
                              status: "running",
                            },
                          ],
                        }
                      : m
                  )
                );
                break;

              case "tool_result":
                // Find the FIRST running tool with matching name and update it (FIFO order)
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
                    
                    const toolCalls = m.toolCalls || [];
                    let targetIndex = -1;
                    
                    // Find the first (oldest) tool with matching name that is still running
                    for (let i = 0; i < toolCalls.length; i++) {
                      if (toolCalls[i].name === event.name && toolCalls[i].status === "running") {
                        targetIndex = i;
                        break;
                      }
                    }
                    
                    if (targetIndex === -1) return m;
                    
                    return {
                      ...m,
                      toolCalls: toolCalls.map((tc, i) =>
                        i === targetIndex
                          ? {
                              ...tc,
                              result: event.result,
                              success: event.success,
                              status: event.success ? "complete" : "error",
                            }
                          : tc
                      ),
                    };
                  })
                );
                break;

              case "text_delta":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + event.content }
                      : m
                  )
                );
                break;

              case "error":
                setError(event.message);
                break;

              case "done":
                // Stream complete
                break;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [messages]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Clear conversation
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const value: ChatContextValue = {
    isOpen,
    setIsOpen,
    prefillPrompt,
    prefillValue,
    clearPrefill,
    messages,
    isStreaming,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}
