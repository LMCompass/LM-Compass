"use client"

import { PromptInputComponent } from "./prompt-input";
import { MessagesDisplay } from "@/components/messages-display";
import { Message as MessageType } from "@/lib/types";
import { useState, useEffect, useRef } from "react";
import { ModelSelector } from "@/components/ui/model-selector";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Generate a random chat ID
const generateChatId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export default function Home() {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [selectedModel, setSelectedModel] = useState("tngtech/deepseek-r1t2-chimera:free");
  const [chatStarted, setChatStarted] = useState(false);
  const [showModelChangeDialog, setShowModelChangeDialog] = useState(false);
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [chatId, setChatId] = useState(generateChatId());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Track when chat has started
  useEffect(() => {
    if (messages.length > 0 && !chatStarted) {
      setChatStarted(true);
    }
  }, [messages.length, chatStarted]);

  const handleModelChange = (newModel: string) => {
    if (chatStarted && messages.length > 0) {
      // Show confirmation dialog
      setPendingModel(newModel);
      setShowModelChangeDialog(true);
    } else {
      // No messages yet, change directly
      setSelectedModel(newModel);
    }
  };

  const confirmModelChange = () => {
    if (pendingModel) {
      setSelectedModel(pendingModel);
      setMessages([]);
      setChatStarted(false);
    }
    setShowModelChangeDialog(false);
    setPendingModel(null);
  };

  const cancelModelChange = () => {
    setShowModelChangeDialog(false);
    setPendingModel(null);
  };

  const handleNewChat = () => {
    setMessages([]);
    setChatStarted(false);
    setChatId(generateChatId());
  };

  return (
    <div className="font-sans h-screen flex flex-col">
      <header className="flex-shrink-0 flex justify-between items-center p-4 sm:p-6 border-b">
        <ModelSelector value={selectedModel} onChange={handleModelChange} />
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          LM Compass
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleNewChat} disabled={isLoading}>
            <Plus className="size-4 mr-2" />
            New Chat
          </Button>
        </div>
      </header>

      <MessagesDisplay 
        messages={messages}
        isLoading={isLoading}
        messagesEndRef={messagesEndRef}
      />

      <div className="flex-shrink-0 flex justify-center p-4 border-t bg-background">
        <PromptInputComponent 
          key={chatId}
          messages={messages} 
          setMessages={setMessages} 
          isLoading={isLoading}
          setIsLoading={setIsLoading}
          selectedModel={selectedModel}
        />
      </div>

      <AlertDialog open={showModelChangeDialog} onOpenChange={setShowModelChangeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Model</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the model will clear your conversation. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelModelChange}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmModelChange}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
