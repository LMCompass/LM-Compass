"use client";

import { PromptInputComponent } from "./prompt-input";
import { MessagesDisplay } from "@/components/messages-display";
import { useState, useEffect, useRef } from "react";
import { MultiModelSelector } from "@/components/ui/multi-model-selector";
import { EvaluationMethodSelector } from "@/components/ui/evaluation-method-selector";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";
import { SidebarInset } from "@/components/sidebar/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { useChat } from "@/contexts/chat-context";
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

export default function Home() {
  const { theme, toggleTheme, mounted } = useTheme();
  const { messages, setMessages, chatStarted, setChatStarted, chatId } =
    useChat();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"querying" | "evaluating">(
    "querying"
  );
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedRubric, setSelectedRubric] = useState("prompt-based");
  const [showModelChangeDialog, setShowModelChangeDialog] = useState(false);
  const [pendingModels, setPendingModels] = useState<string[] | null>(null);

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
  }, [messages.length, chatStarted, setChatStarted]);

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

  return (
    <SidebarInset className="overflow-hidden">
      <div className="h-screen flex flex-col overflow-hidden">
        <header className="flex-shrink-0 flex items-center gap-4 p-4 sm:p-6 border-b border-border">
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
