"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage as ChatMessageType } from "./ChatContext";
import { ChatToolCallCompact } from "./ChatToolCallCompact";
import { User, Bot } from "lucide-react";

interface ChatMessageCompactProps {
  message: ChatMessageType;
}

export function ChatMessageCompact({ message }: ChatMessageCompactProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-1.5 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Small avatar */}
      <div
        className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
          isUser ? "bg-un-blue text-white" : "bg-gray-100 text-gray-500"
        }`}
      >
        {isUser ? <User className="h-2.5 w-2.5" /> : <Bot className="h-2.5 w-2.5" />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        {/* Tool calls */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1 mb-1.5">
            {message.toolCalls.map((toolCall, index) => (
              <ChatToolCallCompact key={index} toolCall={toolCall} />
            ))}
          </div>
        )}

        {/* Message content */}
        {message.content && (
          <div
            className={`inline-block rounded-lg px-2.5 py-1.5 max-w-[95%] text-left ${
              isUser
                ? "bg-un-blue text-white rounded-br-sm"
                : "bg-gray-100 text-gray-800 rounded-bl-sm"
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap text-xs leading-relaxed">{message.content}</p>
            ) : (
              <div className="markdown-content text-xs leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Headings
                    h1: ({ children }) => <h1 className="text-sm font-bold mt-2 mb-1 text-gray-900">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xs font-bold mt-2 mb-1 text-gray-900">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-xs font-semibold mt-1.5 mb-0.5 text-gray-800">{children}</h3>,
                    
                    // Paragraphs
                    p: ({ children }) => <p className="my-1 text-xs leading-relaxed">{children}</p>,
                    
                    // Lists
                    ul: ({ children }) => <ul className="my-1 ml-3 list-disc text-xs space-y-0.5">{children}</ul>,
                    ol: ({ children }) => <ol className="my-1 ml-3 list-decimal text-xs space-y-0.5">{children}</ol>,
                    li: ({ children }) => <li className="text-xs leading-relaxed">{children}</li>,
                    
                    // Code
                    code: ({ className, children }) => {
                      const isBlock = className?.includes("language-");
                      if (isBlock) {
                        return (
                          <code className="block bg-gray-800 text-gray-100 p-2 rounded text-[10px] overflow-x-auto my-1">
                            {children}
                          </code>
                        );
                      }
                      return (
                        <code className="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-[10px]">
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children }) => <pre className="my-1">{children}</pre>,
                    
                    // Tables
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-2">
                        <table className="min-w-full text-[10px] border-collapse">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-gray-200">{children}</thead>,
                    tbody: ({ children }) => <tbody>{children}</tbody>,
                    tr: ({ children }) => <tr className="border-b border-gray-200">{children}</tr>,
                    th: ({ children }) => <th className="px-2 py-1 text-left font-semibold text-gray-700">{children}</th>,
                    td: ({ children }) => <td className="px-2 py-1 text-gray-600">{children}</td>,
                    
                    // Links
                    a: ({ href, children }) => (
                      <a href={href} className="text-un-blue hover:underline" target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                    
                    // Strong/Bold
                    strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                    
                    // Emphasis/Italic
                    em: ({ children }) => <em className="italic">{children}</em>,
                    
                    // Blockquote
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-gray-300 pl-2 my-1 text-gray-600 italic">
                        {children}
                      </blockquote>
                    ),
                    
                    // Horizontal rule
                    hr: () => <hr className="my-2 border-gray-200" />,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
