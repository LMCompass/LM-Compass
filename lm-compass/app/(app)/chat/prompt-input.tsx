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
import type { EvaluationMetadata } from "@/lib/evaluation/types";
import type { RL4FIterationResult } from "@/lib/evaluation";

import { MessageCircleWarning } from "lucide-react";

import {
  Item,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";

type MultiResult = {
  model: string;
  message?: { role: string; content: string };
  error?: string;
};

type StreamResponse = {
  phase: string;
  results?: MultiResult[];
  evaluationMetadata?: EvaluationMetadata;
  iterationResults?: RL4FIterationResult[];
  error?: string;
};

type PromptInputComponentProps = {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadingPhase: React.Dispatch<
    React.SetStateAction<"querying" | "evaluating" | "refining">
  >;
  selectedModels: string[];
  evaluationMethod: string;
  iterations: number;
  chatId: string;
  rubricId: string;
};

export function PromptInputComponent({
  messages,
  setMessages,
  isLoading,
  setIsLoading,
  setLoadingPhase,
  selectedModels,
  evaluationMethod,
  iterations,
  chatId,
  rubricId,
}: PromptInputComponentProps) {
  const [input, setInput] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const needsWinnerSelection = useMemo(() => {
    if (messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];

    if (lastMessage.role === "assistant" && lastMessage.evaluationMetadata) {
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

  const hitlNeedsMoreModels =
    evaluationMethod === "hitl" &&
    selectedModels.length > 0 &&
    selectedModels.length < 3;

  const handleSubmit = async () => {
    if (
      !input.trim() ||
      isLoading ||
      needsWinnerSelection ||
      selectedModels.length === 0 ||
      hitlNeedsMoreModels
    )
      return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setLoadingPhase("querying");

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage]
            .filter((msg) => !msg.isStopped)
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
          iterations,
          chatId,
          rubricId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        let errorMessage = "Failed to get response";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = response.statusText || errorMessage;
        }
        
        if (response.status === 401) {
          errorMessage = "Unauthorized: Please sign in and try again.";
        } else if (response.status === 404) {
          errorMessage = "API key not found. Please add your OpenRouter API key in settings.";
        } else if (response.status === 500) {
          errorMessage = errorMessage || "Server error. Please try again later.";
        }
        
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) {
        throw new Error("No response body");
      }

      let finalData: StreamResponse | null = null;

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

                if (data.phase === "evaluating") {
                  setLoadingPhase("evaluating");
                }

                if (data.phase === "refining") {
                  setLoadingPhase("refining");
                }

                if (data.phase === "complete") {
                  finalData = data;
                }

                if (data.phase === "error") {
                  throw new Error(data.error || "Unknown error");
                }
              } catch {
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
        reader.releaseLock();
      }

      if (!finalData) {
        throw new Error("No data received");
      }

      if (!finalData.results || !Array.isArray(finalData.results)) {
        throw new Error("Invalid response format");
      }

      const multiResults = (finalData.results as MultiResult[]).map((r) => ({
        model: r.model,
        content: r.error
          ? `Error: ${r.error}`
          : coerceToString(r.message?.content),
      }));

      let content = "";
      if (finalData.evaluationMetadata?.winnerModel) {
        const winnerResult = multiResults.find(
          (r) => r.model === finalData?.evaluationMetadata?.winnerModel
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
        ...(finalData.iterationResults && { iterationResults: finalData.iterationResults }),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      let errorContent = "Sorry, I encountered an error. Please try again.";
      if (error instanceof Error) {
        errorContent = error.message;
      } else if (typeof error === "string") {
        errorContent = error;
      }
      
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: errorContent,
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
      {selectedModels.length === 0 && (
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
      {hitlNeedsMoreModels && (
        <Item variant="banner" size="sm" asChild>
          <a>
            <ItemMedia>
              <MessageCircleWarning className="size-5" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                Human-in-the-loop evaluation requires at least 3 models. Please
                select 3 or more models or choose a different evaluation method.
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
          isLoading ||
          needsWinnerSelection ||
          selectedModels.length === 0 ||
          hitlNeedsMoreModels
        }
      >
        <div className="flex items-center gap-2">
          <PromptInputTextarea
            placeholder={
              needsWinnerSelection
                ? "Please select a winner first..."
                : selectedModels.length === 0
                  ? "Please select at least one model first..."
                  : hitlNeedsMoreModels
                    ? "HITL evaluation requires at least 3 models..."
                    : "Ask me anything..."
            }
            className="flex-1"
            disabled={
              needsWinnerSelection ||
              selectedModels.length === 0 ||
              hitlNeedsMoreModels
            }
          />
          <PromptInputActions>
            <PromptInputAction
              tooltip={
                isLoading
                  ? "Stop generation"
                  : needsWinnerSelection
                    ? "Select a winner first"
                    : selectedModels.length === 0
                      ? "Select at least one model first"
                      : hitlNeedsMoreModels
                        ? "HITL evaluation requires at least 3 models"
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
                    selectedModels.length === 0 ||
                    hitlNeedsMoreModels)
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
      </PromptInput>
    </div>
  );
}
