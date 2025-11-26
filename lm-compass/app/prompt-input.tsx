"use client";

import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";
import { Button } from "@/components/ui/button";
import { Send, Square } from "lucide-react";
import { useState, useRef, useMemo } from "react";
import { Message } from "@/lib/types";

import { MessageCircleWarning } from "lucide-react";
import { useDictation, DictationErrorBanner, DictationButton } from "@/components/dictation";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";

type PromptInputComponentProps = {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadingPhase: React.Dispatch<
    React.SetStateAction<"querying" | "evaluating">
  >;
  selectedModels: string[];
  evaluationMethod: string;
};

export function PromptInputComponent({
  messages,
  setMessages,
  isLoading,
  setIsLoading,
  setLoadingPhase,
  selectedModels,
  evaluationMethod,
}: PromptInputComponentProps) {
  const [input, setInput] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);


  // Dictation hook
  const {
    isListening,
    isSupported,
    dictationError,
    toggleListening,
    resetError,
  } = useDictation({
    onTranscript: (text) => {
      setInput((prev) => {
        const newText = prev + (prev && !prev.endsWith(" ") ? " " : "") + text;
        return newText;
      });
    },
  });

  type MultiResult = {
    model: string;
    message?: { role: string; content: string };
    error?: string;
  };

  // Check if user needs to select a winner before sending another message
  const needsWinnerSelection = useMemo(() => {
    if (messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];

    // Check if last message is an assistant message with evaluation metadata
    if (lastMessage.role === "assistant" && lastMessage.evaluationMetadata) {
      // Check if there's a tie (no winner) and no user selection yet
      const hasTie = lastMessage.evaluationMetadata.winnerModel === null;
      const hasNoSelection = !lastMessage.userSelectedWinner;
      const hasMultipleResults =
        lastMessage.multiResults && lastMessage.multiResults.length > 1;

      return hasTie && hasNoSelection && hasMultipleResults;
    }
    return false;
  }, [messages]);

  const coerceToString = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (value == null) return "";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const handleSubmit = async () => {
    // Prevent submission if waiting for winner selection, no input, or no models selected
    if (
      !input.trim() ||
      isLoading ||
      needsWinnerSelection ||
      selectedModels.length === 0
    )
      return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    };

    // Add user message to chat
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setLoadingPhase("querying");

    abortControllerRef.current = new AbortController();

    try {
      // Send to API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage]
            .filter((msg) => !msg.isStopped)
            // Filter out assistant messages with empty content only in tie scenarios (evaluationMetadata present, no winnerModel)
            .filter(
              (msg) =>
                msg.role !== "assistant" ||
                msg.content.trim().length > 0 ||
                !(
                  msg.evaluationMetadata &&
                  !msg.evaluationMetadata.winnerModel &&
                  msg.content.trim().length === 0
                )
            )
            .map(({ role, content }) => ({
              role,
              content,
            })),
          models: selectedModels.length > 0 ? selectedModels : undefined,
          evaluationMethod,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) {
        throw new Error("No response body");
      }

      let finalData: any = null;

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                // Update loading phase when evaluation starts
                if (data.phase === "evaluating") {
                  setLoadingPhase("evaluating");
                }

                // Store final data when complete
                if (data.phase === "complete") {
                  finalData = data;
                }

                // Handle errors
                if (data.phase === "error") {
                  throw new Error(data.error || "Unknown error");
                }
              } catch (e) {
                console.error("Error parsing SSE data:", e);
                // Re-throw if we failed to parse critical phase data
                if (
                  line.includes('"phase":"complete"') ||
                  line.includes('"phase":"error"')
                ) {
                  throw new Error("Failed to parse server response");
                }
              }
            }
          }
        }
      } finally {
        // Ensure reader is released even if request is aborted or an error occurs
        reader.releaseLock();
      }

      if (!finalData) {
        throw new Error("No data received");
      }

      // API always returns { results } array for consistent format
      if (!finalData.results || !Array.isArray(finalData.results)) {
        throw new Error("Invalid response format");
      }

      const multiResults = (finalData.results as MultiResult[]).map((r) => ({
        model: r.model,
        content: r.error
          ? `Error: ${r.error}`
          : coerceToString(r.message?.content),
      }));

      // Set content to winning response if winner exists, otherwise keep empty (tie scenario)
      let content = "";
      if (finalData.evaluationMetadata?.winnerModel) {
        const winnerResult = multiResults.find(
          (r) => r.model === finalData.evaluationMetadata.winnerModel
        );
        if (winnerResult) {
          content = winnerResult.content;
        }
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        multiResults,
        evaluationMetadata: finalData.evaluationMetadata,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      console.error("Error:", error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setLoadingPhase("querying");
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.role === "user") {
        return [...prev.slice(0, -1), { ...lastMessage, isStopped: true }];
      }
      return prev;
    });

    setIsLoading(false);
    setLoadingPhase("querying");
    abortControllerRef.current = null;
  };

  const handleValueChange = (value: string) => {
    setInput(value);
  };



  return (
    <div className="w-full md:w-3/4 lg:w-2/3">
      <DictationErrorBanner
        error={dictationError}
        onDismiss={resetError}
      />
      {needsWinnerSelection && (
        <Item variant="banner" size="sm" asChild>
          <a>
            <ItemMedia>
              <MessageCircleWarning className="size-5" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                Please select a winning response from the options above before
                continuing the conversation.
              </ItemTitle>
            </ItemContent>
          </a>
        </Item>
      )}
      {selectedModels.length === 0 && !needsWinnerSelection && (
        <Item variant="banner" size="sm" asChild>
          <a>
            <ItemMedia>
              <MessageCircleWarning className="size-5" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                Please select at least one model from the dropdown above before
                sending a message.
              </ItemTitle>
            </ItemContent>
          </a>
        </Item>
      )}
      <PromptInput
        value={input}
        onValueChange={handleValueChange}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        disabled={
          isLoading || needsWinnerSelection || selectedModels.length === 0
        }
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <PromptInputTextarea
              placeholder={
                needsWinnerSelection
                  ? "Please select a winner first..."
                  : selectedModels.length === 0
                    ? "Please select at least one model first..."
                    : "Ask me anything..."
              }
              className="flex-1"
              disabled={needsWinnerSelection || selectedModels.length === 0}
            />
            <PromptInputActions>
              <DictationButton
                isListening={isListening}
                isSupported={isSupported}
                disabled={isLoading || needsWinnerSelection || !isSupported || selectedModels.length === 0}
                onClick={toggleListening}
                tooltip={
                  !isSupported
                    ? dictationError === "Microphone access denied."
                      ? "Microphone access denied"
                      : "Dictation disabled"
                    : needsWinnerSelection
                      ? "Select a winner first"
                      : selectedModels.length === 0
                        ? "Select at least one model first"
                        : isListening
                          ? "Stop dictation"
                          : "Start dictation"
                }
              />
              <PromptInputAction
                tooltip={
                  isLoading
                    ? "Stop generation"
                    : needsWinnerSelection
                      ? "Select a winner first"
                      : selectedModels.length === 0
                        ? "Select at least one model first"
                        : "Send message"
                }
              >
                <Button
                  variant="default"
                  size="icon"
                  className="h-10 w-10 rounded-xl bg-primary hover:bg-primary/90"
                  onClick={isLoading ? handleStop : handleSubmit}
                  disabled={
                    !isLoading &&
                    (needsWinnerSelection ||
                      !input.trim() ||
                      selectedModels.length === 0)
                  }
                >
                  {isLoading ? (
                    <Square className="size-5 fill-current" />
                  ) : (
                    <Send className="size-5" />
                  )}
                </Button>
              </PromptInputAction>
            </PromptInputActions>
          </div>
        </div>
      </PromptInput>
    </div>
  );
}
