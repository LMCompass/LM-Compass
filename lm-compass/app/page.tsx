"use client"

import { ThemeToggleButton } from "@/components/theme/theme-toggle-button";
import { PromptInputComponent } from "./prompt-input";
import { Message as MessageType } from "@/lib/types";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import { Loader } from "@/components/ui/loader";
import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="font-sans h-screen flex flex-col">
      <header className="flex-shrink-0 flex justify-between items-center p-4 sm:p-6 border-b">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          LM Compass
        </h1>
        <ThemeToggleButton />
      </header>

      {/* Messages display area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Start a conversation by typing a message below.</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <Message 
                key={message.id} 
                className={`max-w-4xl mx-auto flex ${
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                <MessageAvatar
                  src={message.role === "user" ? "/user-avatar.png" : "/ai-avatar.png"}
                  alt={message.role === "user" ? "User" : "AI Assistant"}
                  fallback={message.role === "user" ? "U" : "AI"}
                  className="mt-1"
                />
                <MessageContent 
                  markdown={message.role === "assistant"}
                  className={`max-w-none ${
                    message.role === "user" 
                      ? "bg-orange-500 text-white" 
                      : "bg-gray-300 text-gray-900"
                  }`}
                >
                  {message.content}
                </MessageContent>
              </Message>
            ))}
            {isLoading && (
              <Message className="max-w-4xl mx-auto flex flex-row">
                <MessageAvatar
                  src="/ai-avatar.png"
                  alt="AI Assistant"
                  fallback="AI"
                  className="mt-1"
                />
                <div className="rounded-lg p-2 bg-gray-300 text-gray-900 break-words whitespace-normal">
                  <Loader variant="typing" size="md" />
                </div>
              </Message>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 flex justify-center p-4 border-t bg-background">
        <PromptInputComponent 
          messages={messages} 
          setMessages={setMessages} 
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />
      </div>
    </div>
  );
}
