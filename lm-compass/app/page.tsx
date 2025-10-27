"use client"

import { ThemeToggleButton } from "@/components/theme/theme-toggle-button";
import { PromptInputComponent } from "./prompt-input";
import { MessagesDisplay } from "@/components/messages-display";
import { Message as MessageType } from "@/lib/types";
import { useState, useEffect, useRef } from "react";
import { ModelSelector } from "@/components/ui/model-selector";

export default function Home() {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [selectedModel, setSelectedModel] = useState("openai/gpt-4o-mini")

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="font-sans h-screen flex flex-col">
      <header className="flex-shrink-0 flex justify-between items-center p-4 sm:p-6 border-b">
        <ModelSelector value={selectedModel} onChange={setSelectedModel} />
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          LM Compass
        </h1>
        <ThemeToggleButton />
      </header>

      <MessagesDisplay 
        messages={messages}
        isLoading={isLoading}
        messagesEndRef={messagesEndRef}
      />

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
