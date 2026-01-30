"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage as ChatMessageType } from "./useChatStream";
import { ChatToolCall } from "./ChatToolCall";
import { User, Bot, Copy, Check } from "lucide-react";
import { useState } from "react";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} group`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? "bg-un-blue text-white" : "bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        {/* Role label */}
        <p className={`text-xs font-medium mb-1 ${isUser ? "text-un-blue" : "text-gray-500"}`}>
          {isUser ? "You" : "Assistant"}
        </p>

        {/* Tool calls (for assistant messages) */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-2 mb-3">
            {message.toolCalls.map((toolCall, index) => (
              <ChatToolCall key={index} toolCall={toolCall} />
            ))}
          </div>
        )}

        {/* Message content */}
        {message.content && (
          <div className="relative group/message">
            <div
              className={`inline-block rounded-2xl px-4 py-3 max-w-[90%] ${
                isUser
                  ? "bg-un-blue text-white rounded-br-md"
                  : "bg-gray-100 text-gray-900 rounded-bl-md"
              }`}
            >
              {isUser ? (
                <p className="whitespace-pre-wrap text-sm">{message.content}</p>
              ) : (
                <div className="prose prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-headings:font-semibold prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-gray-800 prose-pre:text-gray-100 prose-code:bg-gray-200 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-gray-800 prose-code:before:content-[''] prose-code:after:content-['']">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {/* Copy button - appears on hover for assistant messages */}
            {!isUser && message.content && (
              <button
                onClick={handleCopy}
                className="absolute -bottom-6 left-2 opacity-0 group-hover/message:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 p-1 rounded"
                title="Copy message"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        )}

        {/* Timestamp */}
        <p className={`text-xs text-gray-400 mt-1.5 ${isUser ? "text-right" : ""}`}>
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
