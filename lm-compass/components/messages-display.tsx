"use client";

import type React from "react";

import type { Message as MessageType } from "@/lib/types";
import { MessageContent } from "@/components/ui/message";
import { Markdown } from "@/components/ui/markdown";
import { models } from "@/components/ui/model-selector";
import { useState, useMemo, useEffect, useRef, useLayoutEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoaderBanner } from "@/components/chat/loader-banner";
import { EmptyChatHeader } from "@/components/chat/empty-chat-header";
import { ModelResponseCard } from "@/components/chat/model-response-card";
import { WinnerBanner } from "@/components/chat/winner-banner";
import { ComparisonPanel } from "@/components/chat/comparison-panel";
import { IterationResults } from "@/components/ui/iteration-results";
import { HITLForm } from "@/components/chat/hitl-form";
import type { HITLPhase2Result } from "@/lib/evaluation";
import { useChat } from "@/contexts/chat-context";
import { Button } from "@/components/ui/button";
import { AlertCircle, ChevronUp } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useSupabaseClient } from "@/utils/supabase/client";
import { saveChat, loadAllMessages } from "@/lib/chat-storage";

type MessagesDisplayProps = {
  messages: MessageType[];
  isLoading: boolean;
  loadingPhase: "querying" | "evaluating" | "refining";
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>;
  selectedModels: string[];
};

export function MessagesDisplay({
  messages,
  isLoading,
  loadingPhase,
  messagesContainerRef,
  setMessages,
  selectedModels,
}: MessagesDisplayProps) {
  const [detail, setDetail] = useState<null | {
    model: string;
    label: string;
    content: string;
  }>(null);
  const [showComparison, setShowComparison] = useState<string | null>(null);
  const [hitlPhase2Results, setHitlPhase2Results] = useState<Record<string, HITLPhase2Result>>({});
  const [winnerSelectionError, setWinnerSelectionError] = useState<string | null>(null);
  const { loadMoreMessages, hasMoreMessages, isLoadingMore, chatId } = useChat();
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const prevMessageCountRef = useRef(messages.length);
  const scrollHeightBeforeRef = useRef(0);
  const scrollTopBeforeRef = useRef(0);
  const isChatLoadedFromStorageRef = useRef(false);
  const lastChatIdRef = useRef<string | null>(null);

  const modelLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    models.forEach((m) => {
      map[m.value] = m.label;
    });
    return map;
  }, []);

  useEffect(() => {
    if (chatId !== lastChatIdRef.current && lastChatIdRef.current !== null) {
      isChatLoadedFromStorageRef.current = true;
    } else if (chatId !== lastChatIdRef.current && lastChatIdRef.current === null) {
      const allHaveSequenceOrder = messages.length > 0 && messages.every(
        (msg) => msg.sequenceOrder !== undefined
      );
      isChatLoadedFromStorageRef.current = allHaveSequenceOrder;
    }
    lastChatIdRef.current = chatId;
  }, [chatId, messages]);

  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && !isLoadingMore) {
      const hasNewMessages = messages.some(
        (msg) => msg.sequenceOrder === undefined
      );
      if (hasNewMessages) {
        isChatLoadedFromStorageRef.current = false;
      }
    }
  }, [messages.length, isLoadingMore, messages]);

  const isMessageActive = useMemo(() => {
    return (message: MessageType, messageIndex: number): boolean => {
      if (
        message.role !== "assistant" ||
        !message.multiResults ||
        message.multiResults.length <= 1
      ) {
        return false;
      }

      let lastAssistantMessageIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (
          msg.role === "assistant" &&
          msg.multiResults &&
          msg.multiResults.length > 1
        ) {
          lastAssistantMessageIndex = i;
          break;
        }
      }

      if (messageIndex !== lastAssistantMessageIndex) {
        return false;
      }

      if (isChatLoadedFromStorageRef.current && message.sequenceOrder !== undefined) {
        return false;
      }
      return true;
    };
  }, [messages]);

  const openDetail = (model: string, label: string, content: string) => {
    setDetail({ model, label, content });
  };
  const closeDetail = () => setDetail(null);

  const toggleComparison = (messageId: string) => {
    setShowComparison(showComparison === messageId ? null : messageId);
  };

  const handleSelectWinner = async (
    messageId: string,
    selectedModel: string,
    selectedContent: string
  ) => {
    setWinnerSelectionError(null);

    const updatedMessages = messages.map((msg) =>
      msg.id === messageId
        ? {
            ...msg,
            content: selectedContent,
            userSelectedWinner: selectedModel,
          }
        : msg
    );
    
    setMessages(updatedMessages);

    if (chatId && user?.id) {
      try {
        const { messages: allExistingMessages, error: loadError } = await loadAllMessages(
          supabase,
          chatId,
          user.id
        );

        if (loadError) {
          throw new Error(loadError);
        }
        
        if (allExistingMessages) {
          const allMessagesToSave = allExistingMessages.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  content: selectedContent,
                  userSelectedWinner: selectedModel,
                }
              : msg
          );
          
          const saveResult = await saveChat(supabase, chatId, user.id, allMessagesToSave);
          if (!saveResult.success) {
            throw new Error(saveResult.error || "Failed to save winner selection.");
          }
        } else {
          const saveResult = await saveChat(supabase, chatId, user.id, updatedMessages);
          if (!saveResult.success) {
            throw new Error(saveResult.error || "Failed to save winner selection.");
          }
        }
      } catch (error) {
        setWinnerSelectionError(
          error instanceof Error
            ? error.message
            : "Failed to save your winner selection."
        );
      }
    }
  };

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (isLoadingMore) {
      scrollHeightBeforeRef.current = container.scrollHeight;
      scrollTopBeforeRef.current = container.scrollTop;
    }
  }, [isLoadingMore, messagesContainerRef]);

  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (messages.length > prevMessageCountRef.current && prevMessageCountRef.current > 0) {
      const scrollHeightAfter = container.scrollHeight;
      const scrollDiff = scrollHeightAfter - scrollHeightBeforeRef.current;
      
      if (scrollDiff > 0) {
        const newScrollTop = scrollTopBeforeRef.current + scrollDiff;
        container.scrollTop = newScrollTop;
      }
    }
    
    prevMessageCountRef.current = messages.length;
  }, [messages, messagesContainerRef]);

  const shouldShowLoadMoreButton = useMemo(() => {
    if (!hasMoreMessages || messages.length === 0) {
      return false;
    }
    const oldestMessage = messages[0];
    if (!oldestMessage?.sequenceOrder) {
      return false;
    }
    if (oldestMessage.sequenceOrder === 0) {
      return false;
    }
    return true;
  }, [hasMoreMessages, messages]);

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
    >
      {messages.length === 0 ? (
        <EmptyChatHeader />
      ) : (
        <>
          {winnerSelectionError && (
            <div className="mx-auto flex max-w-2xl items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{winnerSelectionError}</p>
            </div>
          )}
          {shouldShowLoadMoreButton && (
            <div className="flex justify-center py-4">
              <Button
                onClick={loadMoreMessages}
                disabled={isLoadingMore}
                variant="outline"
                className="gap-2"
              >
                <ChevronUp className="h-4 w-4" />
                {isLoadingMore ? "Loading..." : "Load Previous Messages"}
              </Button>
            </div>
          )}
          {messages.map((message, messageIndex) => {
            const hasMultipleResults =
              message.role === "assistant" &&
              message.multiResults &&
              message.multiResults.length > 1;
            const evaluationMetadata = message.evaluationMetadata;
            const hasEvaluation = hasMultipleResults && evaluationMetadata;
            const hasNoWinner = evaluationMetadata?.winnerModel === null;
            const userSelectedWinner = message.userSelectedWinner;

            let displayModel: string | null =
              userSelectedWinner || evaluationMetadata?.winnerModel || null;
            const shouldShowSelectionButtons =
              hasNoWinner && !userSelectedWinner;

            const isActive = isMessageActive(message, messageIndex);
            const isHITLTriggered =
              hasEvaluation &&
              evaluationMetadata?.hitlPhase1?.hitlTriggered &&
              isActive;
            const phase2Result = hitlPhase2Results[message.id];
            const hasPhase2 = !!phase2Result;

            let phase2WinnerModel: string | null = null;
            if (phase2Result) {
              const entries = Object.entries(phase2Result.graderResults);
              if (entries.length > 0) {
                const meanScores: Record<string, number> = {};
                entries.forEach(([modelName, gr]) => {
                  const score =
                    typeof gr.score === "number" && Number.isFinite(gr.score)
                      ? gr.score
                      : 0;
                  meanScores[modelName] = score;
                });
                const meanEntries = Object.entries(meanScores);
                const maxScore = Math.max(...meanEntries.map(([, s]) => s));
                const winners = meanEntries.filter(([, s]) => s === maxScore);
                if (winners.length === 1) {
                  phase2WinnerModel = winners[0][0];
                }
              }
            }

            if (!userSelectedWinner && phase2WinnerModel) {
              displayModel = phase2WinnerModel;
            }

            const displayResult =
              displayModel && message.multiResults
                ? message.multiResults.find((r) => r.model === displayModel)
                : null;

            const shouldShowWinnerBubble =
              hasEvaluation &&
              displayResult !== null &&
              (!isHITLTriggered || hasPhase2);

            return (
              <div key={message.id} className="max-w-5xl mx-auto space-y-4">
                {isHITLTriggered && (
                  <div className="mt-4">
                    {phase2Result ? (
                      <div className="rounded-lg border bg-muted/30 p-4 max-w-2xl space-y-3">
                        <p className="text-sm font-medium">Updated rubric (after your answers):</p>
                        <pre className="text-xs whitespace-pre-wrap bg-background p-3 rounded overflow-auto max-h-60">
                          {phase2Result.updatedRubric}
                        </pre>
                        {(phase2Result.savedRubricId || phase2Result.saveRubricError) && (
                          <p className="text-xs text-muted-foreground">
                            {phase2Result.saveRubricError
                              ? `Could not save rubric: ${phase2Result.saveRubricError}`
                              : `Saved rubric${phase2Result.savedRubricTitle ? `: ${phase2Result.savedRubricTitle}` : ""}.`}
                          </p>
                        )}
                        <div>
                          <p className="text-xs font-medium text-foreground mb-1">Updated model scores:</p>
                          <ul className="space-y-1.5 text-xs text-muted-foreground">
                            {message.multiResults?.map((r) => {
                              const gr = phase2Result.graderResults[r.model];
                              if (!gr) return null;
                              const label = modelLabelMap[r.model] || r.model;
                              const score =
                                typeof gr.score === "number" && Number.isFinite(gr.score)
                                  ? gr.score
                                  : null;
                              const avgScore = score !== null ? score.toFixed(1) : "—";
                              const scoreSummary =
                                score !== null ? `score: ${score.toFixed(1)}` : "";
                              return (
                                <li key={r.model} className="flex flex-wrap items-baseline gap-x-2">
                                  <span className="font-medium text-foreground">{label}</span>
                                  <span>avg {avgScore}/100</span>
                                  {scoreSummary && (
                                    <span className="text-muted-foreground/80">
                                      ({scoreSummary})
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                        {(() => {
                          const entries = Object.entries(phase2Result.graderResults);
                          if (entries.length === 0) return null;
                          const meanScores: Record<string, number> = {};
                          entries.forEach(([modelName, gr]) => {
                            const score =
                              typeof gr.score === "number" && Number.isFinite(gr.score)
                                ? gr.score
                                : 0;
                            meanScores[modelName] = score;
                          });
                          const meanEntries = Object.entries(meanScores);
                          const maxScore = Math.max(...meanEntries.map(([, s]) => s));
                          const winners = meanEntries.filter(([, s]) => s === maxScore);
                          if (winners.length === 0) return null;
                          const [winnerModel, winnerScore] = winners[0];
                          const winnerLabel = modelLabelMap[winnerModel] || winnerModel;
                          return (
                            <p className="text-xs font-medium text-foreground">
                              Top model after updated rubric: {winnerLabel} ({winnerScore.toFixed(1)}/100)
                            </p>
                          );
                        })()}
                        <p className="text-xs text-muted-foreground">
                          Re-graded with new rubric. Cross-eval scores (how good each model is as a grader):{" "}
                          {Object.entries(phase2Result.crossEvalResults)
                            .map(
                              ([grader, scores]) =>
                                `${grader}: ${Object.values(scores).join(", ")}`
                            )
                            .join("; ")}
                        </p>
                      </div>
                    ) : (
                      <HITLForm
                        message={message}
                        previousUserContent={
                          messageIndex > 0 && messages[messageIndex - 1].role === "user"
                            ? messages[messageIndex - 1].content
                            : ""
                        }
                        onPhase2Complete={(msgId, result) =>
                          setHitlPhase2Results((prev) => ({ ...prev, [msgId]: result }))
                        }
                      />
                    )}
                  </div>
                )}

                {hasMultipleResults &&
                  message.multiResults &&
                  isActive &&
                  (!isHITLTriggered || hasPhase2) && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {message.multiResults.map((r) => {
                      const cardKey = `${message.id}-${r.model}`;
                      const label = modelLabelMap[r.model] || r.model;
                      let isWinner =
                        message.evaluationMetadata?.winnerModel === r.model;
                      if (phase2WinnerModel) {
                        isWinner = phase2WinnerModel === r.model;
                      }
                      const isUserSelected = userSelectedWinner === r.model;
                      let score =
                        message.evaluationMetadata?.meanScores[r.model];
                      if (phase2Result) {
                        const gr = phase2Result.graderResults[r.model];
                        if (gr && typeof gr.score === "number" && Number.isFinite(gr.score)) {
                          score = gr.score;
                        }
                      }

                      return (
                        <ModelResponseCard
                          key={cardKey}
                          cardKey={cardKey}
                          label={label}
                          model={r.model}
                          content={r.content}
                          score={score}
                          isWinner={isWinner}
                          isUserSelected={isUserSelected}
                          shouldShowSelectionButtons={
                            shouldShowSelectionButtons
                          }
                          onViewDetail={openDetail}
                          onSelectWinner={(model, content) =>
                            handleSelectWinner(message.id, model, content)
                          }
                        />
                      );
                    })}
                  </div>
                )}

                {hasEvaluation && evaluationMetadata && isActive && (
                  <div>
                    {!isHITLTriggered && (
                      <>
                        <WinnerBanner
                          message={message}
                          modelLabelMap={modelLabelMap}
                          isComparisonOpen={showComparison === message.id}
                          onToggleComparison={() => toggleComparison(message.id)}
                        />

                        {showComparison === message.id && (
                          <ComparisonPanel
                            message={message}
                            modelLabelMap={modelLabelMap}
                            userSelectedWinner={userSelectedWinner}
                          />
                        )}

                        {message.iterationResults && message.iterationResults.length > 0 && (
                          <IterationResults results={message.iterationResults} />
                        )}
                      </>
                    )}
                  </div>
                )}

                {shouldShowWinnerBubble && displayResult && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl p-2 shadow-lg bg-card max-w-2xl">
                      <MessageContent
                        markdown={true}
                        className="bg-card text-sm"
                      >
                        {displayResult.content}
                      </MessageContent>
                    </div>
                  </div>
                )}

                {message.role === "assistant" &&
                  message.multiResults &&
                  message.multiResults.length === 1 ? (
                  <div className="flex justify-start">
                    <div className="rounded-2xl p-2 shadow-lg bg-card max-w-2xl">
                      <MessageContent
                        markdown={true}
                        className="bg-card text-md"
                      >
                        {message.multiResults[0].content}
                      </MessageContent>
                    </div>
                  </div>
                ) : null}

                {message.role === "assistant" &&
                  !message.multiResults &&
                  message.content &&
                  (message.content.toLowerCase().includes("error") ||
                    message.content.toLowerCase().includes("unauthorized") ||
                    message.content.toLowerCase().includes("not found") ||
                    message.content.toLowerCase().includes("failed")) ? (
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-5 py-3 max-w-2xl shadow-lg bg-destructive/10 border border-destructive/20">
                      <p className="text-destructive leading-relaxed text-md">
                        {message.content}
                      </p>
                    </div>
                  </div>
                ) : null}

                {message.role === "assistant" &&
                  !message.multiResults &&
                  message.content &&
                  !(
                    message.content.toLowerCase().includes("error") ||
                    message.content.toLowerCase().includes("unauthorized") ||
                    message.content.toLowerCase().includes("not found") ||
                    message.content.toLowerCase().includes("failed")
                  ) ? (
                  <div className="flex justify-start">
                    <div className="rounded-2xl p-2 shadow-lg bg-card max-w-2xl">
                      <MessageContent
                        markdown={true}
                        className="bg-card text-md"
                      >
                        {message.content}
                      </MessageContent>
                    </div>
                  </div>
                ) : null}

                {message.role === "user" && (
                  <div className="flex justify-end">
                    <div
                      className={`rounded-2xl px-5 py-3 max-w-2xl shadow-lg ${message.isStopped
                        ? "bg-primary/90 opacity-50 text-primary-foreground"
                        : "bg-primary/90 text-primary-foreground backdrop-blur-xl"
                        }`}
                    >
                      <p className="leading-relaxed text-md">
                        {message.content}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <LoaderBanner
              phase={loadingPhase}
              models={selectedModels}
              labelMap={modelLabelMap}
            />
          )}

          <Dialog
            open={!!detail}
            onOpenChange={(open) => !open && closeDetail()}
          >
            <DialogContent
              className="max-w-4xl backdrop-blur-2xl p-4 sm:p-6 border border-border"
              aria-describedby={undefined}
            >
              <DialogHeader className="pb-3 sm:pb-4">
                <DialogTitle className="text-lg sm:text-xl">
                  {detail?.label}
                </DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto -mx-1 sm:-mx-1.5">
                {detail && (
                  <div className="px-1 sm:px-1.5">
                    <Markdown className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0">
                      {detail.content}
                    </Markdown>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
