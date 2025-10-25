"use client"

import { ThemeToggleButton } from "@/components/theme/theme-toggle-button";
import { PromptInputComponent } from "./prompt-input";
import { Message } from "@/lib/types";
import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
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
      <div className="flex-shrink-0 flex justify-center p-4 border-t bg-background">
        <PromptInputComponent messages={messages} setMessages={setMessages} />
      </div>
    </div>
  );
}
