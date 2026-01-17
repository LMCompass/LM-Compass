"use client";

import { PromptInputComponent } from "./prompt-input";
import { MessagesDisplay } from "@/components/messages-display";
import { useState, useEffect, useRef } from "react";
import { MultiModelSelector } from "@/components/ui/multi-model-selector";
import { EvaluationMethodSelector } from "@/components/ui/evaluation-method-selector";
import { Button } from "@/components/ui/button";
import { Sun, Moon, KeyRound, LogIn } from "lucide-react";
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
import { SignedIn, SignedOut, SignInButton, useUser } from "@clerk/nextjs";
import { SettingsDialog } from "@/components/ui/settings-dialog";
import { hasApiKey } from "@/app/settings/actions";
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";

export default function Home() {
  const { theme, toggleTheme, mounted } = useTheme();
  const { messages, setMessages, chatStarted, setChatStarted, chatId } =
    useChat();
  const { user, isLoaded: userLoaded } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"querying" | "evaluating">(
    "querying"
  );
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedRubric, setSelectedRubric] = useState("prompt-based");
  const [showModelChangeDialog, setShowModelChangeDialog] = useState(false);
  const [pendingModels, setPendingModels] = useState<string[] | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [checkingKey, setCheckingKey] = useState(true);

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

  // Check if user has API key when signed in
  useEffect(() => {
    const checkApiKey = async () => {
      if (!userLoaded) {
        return;
      }

      if (!user) {
        setHasKey(false);
        setCheckingKey(false);
        return;
      }

      setCheckingKey(true);
      try {
        const result = await hasApiKey();
        setHasKey(result.hasKey);

        // If user is signed in but doesn't have a key, show settings dialog
        if (!result.hasKey) {
          setIsSettingsOpen(true);
        }
      } catch (error) {
        console.error("Failed to check API key:", error);
        setHasKey(false);
      } finally {
        setCheckingKey(false);
      }
    };

    checkApiKey();
  }, [user, userLoaded]);

  // Refresh API key status when settings dialog closes
  const handleSettingsClose = async (open: boolean) => {
    setIsSettingsOpen(open);
    if (!open && user) {
      // Check again when dialog closes
      const result = await hasApiKey();
      setHasKey(result.hasKey);
    }
  };

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
          <SignedOut>
            <div className="w-full md:w-3/4 lg:w-2/3">
              <Item variant="banner" size="sm">
                <ItemMedia>
                  <LogIn className="size-5" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Sign in required</ItemTitle>
                  <ItemDescription className="text-accent-foreground">
                    You must be signed in to use this application. Please sign
                    in to continue.
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <SignInButton mode="modal">
                    <Button variant="default" size="sm">
                      Sign In
                    </Button>
                  </SignInButton>
                </ItemActions>
              </Item>
            </div>
          </SignedOut>
          <SignedIn>
            {checkingKey ? (
              <div className="w-full md:w-3/4 lg:w-2/3">
                <Item variant="banner" size="sm">
                  <ItemMedia>
                    <KeyRound className="size-5" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>Checking API key...</ItemTitle>
                  </ItemContent>
                </Item>
              </div>
            ) : !hasKey ? (
              <div className="w-full md:w-3/4 lg:w-2/3">
                <Item variant="banner" size="sm">
                  <ItemMedia>
                    <KeyRound className="size-5" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>API key required</ItemTitle>
                    <ItemDescription>
                      You need to add your OpenRouter API key to use this
                      application. Please add your key in settings.
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setIsSettingsOpen(true)}
                    >
                      Add API Key
                    </Button>
                  </ItemActions>
                </Item>
              </div>
            ) : (
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
            )}
          </SignedIn>
        </div>

        <SettingsDialog
          open={isSettingsOpen}
          onOpenChange={handleSettingsClose}
        />

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
