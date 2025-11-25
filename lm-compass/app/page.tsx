"use client";

import { PromptInputComponent } from "./prompt-input";
import { MessagesDisplay } from "@/components/messages-display";
import { Message as MessageType } from "@/lib/types";
import { useState, useEffect, useRef } from "react";
import { MultiModelSelector } from "@/components/ui/multi-model-selector";
import { EvaluationMethodSelector } from "@/components/ui/evaluation-method-selector";
import { Button } from "@/components/ui/button";
import { Plus, Sun, Moon } from "lucide-react";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { useTheme } from "@/hooks/use-theme";
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
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};

export default function Home() {
  const { open } = useSidebar();
  const { theme, toggleTheme, mounted } = useTheme();
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"querying" | "evaluating">(
    "querying"
  );
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedRubric, setSelectedRubric] = useState("prompt-based");
  const [chatStarted, setChatStarted] = useState(false);
  const [showModelChangeDialog, setShowModelChangeDialog] = useState(false);
  const [pendingModels, setPendingModels] = useState<string[] | null>(null);
  const [chatId, setChatId] = useState(generateChatId());

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
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
    if (pendingModels && pendingModels.length > 0) {
      setSelectedModels(pendingModels);
    } else {
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
    <SidebarInset className="overflow-hidden">
      <div className="h-screen flex flex-col overflow-hidden">
        <header className="flex-shrink-0 flex items-center gap-4 p-4 sm:p-6 border-b border-border">
          {!open && <CustomSidebarTrigger />}
          <MultiModelSelector
            values={selectedModels}
            onChange={handleMultiModelChange}
          />
          <EvaluationMethodSelector
            value={selectedRubric}
            onChange={setSelectedRubric}
          />
          <div className="flex-1" />
          <Button
            variant="outline"
            onClick={handleNewChat}
            disabled={isLoading}
          >
            <Plus className="size-4 text-muted-foreground" />
            New Chat
          </Button>
          <Button
            variant="outline"
            onClick={toggleTheme}
            disabled={!mounted}
            size="icon"
          >
            {mounted && theme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>
        </header>

        <MessagesDisplay
          messages={messages}
          isLoading={isLoading}
          loadingPhase={loadingPhase}
          messagesContainerRef={messagesContainerRef}
          setMessages={setMessages}
          selectedModels={selectedModels}
        />

        <div className="flex-shrink-0 flex justify-center p-4 bg-background">
          <PromptInputComponent
            key={chatId}
            messages={messages}
            setMessages={setMessages}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            setLoadingPhase={setLoadingPhase}
            selectedModels={selectedModels}
            evaluationMethod={selectedRubric}
          />
        </div>

        <AlertDialog
          open={showModelChangeDialog}
          onOpenChange={setShowModelChangeDialog}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Change Model</AlertDialogTitle>
              <AlertDialogDescription>
                Changing the model will clear your conversation. Are you sure
                you want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={cancelModelChange}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmModelChange}>
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SidebarInset>
  );
}
