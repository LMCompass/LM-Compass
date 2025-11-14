"use client"

import { PromptInputComponent } from "./prompt-input";
import { MessagesDisplay } from "@/components/messages-display";
import { Message as MessageType } from "@/lib/types";
import { useState, useEffect, useRef } from "react";
import { MultiModelSelector } from "@/components/ui/multi-model-selector";
import { EvaluationMethodSelector } from "@/components/ui/evaluation-method-selector";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
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
  const { open } = useSidebar();
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"querying" | "evaluating">("querying");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedRubric, setSelectedRubric] = useState("prompt-based");
  const [chatStarted, setChatStarted] = useState(false);
  const [showModelChangeDialog, setShowModelChangeDialog] = useState(false);
  const [pendingModels, setPendingModels] = useState<string[] | null>(null);
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

  const handleMultiModelChange = (newModels: string[]) => {
    if (chatStarted && messages.length > 0) {
      setPendingModels(newModels);
      setShowModelChangeDialog(true);
      return;
    }
    setSelectedModels(newModels);
  };

  const confirmModelChange = () => {
    // Reset to only the newly selected models (models that were added, not previously selected)
    if (pendingModels && pendingModels.length > 0) {
      // Find models that were newly added (in pendingModels but not in current selectedModels)
      const newlySelected = pendingModels.filter(model => !selectedModels.includes(model));
      
      // If there are newly selected models, use only those. Otherwise use pendingModels as-is
      if (newlySelected.length > 0) {
        setSelectedModels(newlySelected);
      } else {
        // If no new models (all were deselected), use pendingModels (which should be empty or minimal)
        setSelectedModels(pendingModels);
      }
    } else {
      // If no pending models, set to empty array (user must select)
      setSelectedModels([]);
    }
    setMessages([]);
    setChatStarted(false);
    setShowModelChangeDialog(false);
    setPendingModels(null);
  };

  const cancelModelChange = () => {
    setShowModelChangeDialog(false);
    setPendingModels(null);
  };

  const handleNewChat = () => {
    setMessages([]);
    setChatStarted(false);
    setChatId(generateChatId());
  };

  return (
    <SidebarInset>
      <div className="h-screen flex flex-col">
        <header className="flex-shrink-0 flex items-center p-4 sm:p-6 border-b">
          <div className="flex items-center gap-4 flex-1">
            {!open && <SidebarTrigger />}
            <MultiModelSelector values={selectedModels} onChange={handleMultiModelChange} />
            <EvaluationMethodSelector value={selectedRubric} onChange={setSelectedRubric} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            LM Compass
          </h1>
          <div className="flex-1 flex justify-end">
            <Button variant="outline" onClick={handleNewChat} disabled={isLoading}>
              <Plus className="size-4 text-muted-foreground" />
              New Chat
            </Button>
          </div>
        </header>

        <MessagesDisplay 
          messages={messages}
          isLoading={isLoading}
          loadingPhase={loadingPhase}
          messagesEndRef={messagesEndRef}
          setMessages={setMessages}
          selectedModels={selectedModels}
        />

        <div className="flex-shrink-0 flex justify-center p-4 border-t bg-background">
          <PromptInputComponent 
          key={chatId}
            messages={messages} 
            setMessages={setMessages} 
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            setLoadingPhase={setLoadingPhase}
            selectedModels={selectedModels}
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
    </SidebarInset>
  );
}
