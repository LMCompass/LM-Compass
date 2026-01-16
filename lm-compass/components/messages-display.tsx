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
import { useChat } from "@/contexts/chat-context";
import { Button } from "@/components/ui/button";
import { ChevronUp } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useSupabaseClient } from "@/utils/supabase/client";
import { saveChat, loadAllMessages } from "@/lib/chat-storage";

type MessagesDisplayProps = {
  messages: MessageType[];
  isLoading: boolean;
  loadingPhase: "querying" | "evaluating";
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

  // Track when chatId changes - if it changes, messages were likely loaded from storage
  useEffect(() => {
    if (chatId !== lastChatIdRef.current && lastChatIdRef.current !== null) {
      // Chat ID changed, so messages were loaded from storage
      isChatLoadedFromStorageRef.current = true;
    } else if (chatId !== lastChatIdRef.current && lastChatIdRef.current === null) {
      // First time setting chatId, check if messages have sequenceOrder (loaded from storage)
      const allHaveSequenceOrder = messages.length > 0 && messages.every(
        (msg) => msg.sequenceOrder !== undefined
      );
      isChatLoadedFromStorageRef.current = allHaveSequenceOrder;
    }
    lastChatIdRef.current = chatId;
  }, [chatId, messages]);

  // When new messages are added in the current session (not loading from history),
  // mark chat as active (not loaded from storage)
  useEffect(() => {
    // If messages increased and we're not loading more (which means loading from history),
    // then new messages were added in the current session
    if (messages.length > prevMessageCountRef.current && !isLoadingMore) {
      // Check if new messages don't have sequenceOrder (they're newly created)
      const hasNewMessages = messages.some(
        (msg) => msg.sequenceOrder === undefined
      );
      if (hasNewMessages) {
        isChatLoadedFromStorageRef.current = false;
      }
    }
  }, [messages.length, isLoadingMore, messages]);

  /**
   * Determines if a message is "active" (currently being worked on) vs "previous" (from a completed chat).
   * A message is active if:
   * - It's the last assistant message with multiple results AND
   *   (the chat was not loaded from storage OR the message itself doesn't have sequenceOrder)
   * - All other messages with multiple results are considered "previous"
   */
  const isMessageActive = useMemo(() => {
    return (message: MessageType, messageIndex: number): boolean => {
      // Only assistant messages with multiple results can be active
      if (
        message.role !== "assistant" ||
        !message.multiResults ||
        message.multiResults.length <= 1
      ) {
        return false;
      }

      // Find the last assistant message with multiple results
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

      // If this is not the last assistant message with multiple results, it's previous
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
    // Update local state
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

    // Save to database after user selects a winner
    if (chatId && user?.id) {
      try {
        // Load ALL existing messages from database to preserve full conversation
        // This ensures we don't lose older messages that weren't loaded in the UI
        const { messages: allExistingMessages } = await loadAllMessages(supabase, chatId, user.id);
        
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
          
          const result = await saveChat(supabase, chatId, user.id, allMessagesToSave);
          if (result.success) {
            console.log('Chat saved successfully after winner selection');
          } else {
            console.error('Error saving chat after winner selection:', result.error);
          }
        } else {
          // Fallback: if we can't load all messages, save what we have
          const result = await saveChat(supabase, chatId, user.id, updatedMessages);
          if (result.success) {
            console.log('Chat saved successfully after winner selection (fallback)');
          } else {
            console.error('Error saving chat after winner selection:', result.error);
          }
        }
      } catch (error) {
        console.error('Error saving chat to database after winner selection:', error);
      }
    }
  };

  // Store scroll height and position before loading more messages starts
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (isLoadingMore) {
      scrollHeightBeforeRef.current = container.scrollHeight;
      scrollTopBeforeRef.current = container.scrollTop;
    }
  }, [isLoadingMore, messagesContainerRef]);

  // Preserve scroll position after loading more messages - use useLayoutEffect for immediate execution
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // If messages were added (count increased) and we just finished loading
    if (messages.length > prevMessageCountRef.current && prevMessageCountRef.current > 0) {
      const scrollHeightAfter = container.scrollHeight;
      const scrollDiff = scrollHeightAfter - scrollHeightBeforeRef.current;
      
      if (scrollDiff > 0) {
        // Maintain the same visual position by adding the height difference to the previous scroll position
        const newScrollTop = scrollTopBeforeRef.current + scrollDiff;
        container.scrollTop = newScrollTop;
      }
    }
    
    prevMessageCountRef.current = messages.length;
  }, [messages, messagesContainerRef]);

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
    >
      {messages.length === 0 ? (
        <EmptyChatHeader />
      ) : (
        <>
          {hasMoreMessages && (
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
            const tiedModels = evaluationMetadata?.tiedModels || [];

            const displayModel =
              userSelectedWinner || evaluationMetadata?.winnerModel || null;
            const displayResult =
              displayModel && message.multiResults
                ? message.multiResults.find((r) => r.model === displayModel)
                : null;

            const shouldShowWinnerBubble =
              hasEvaluation && displayResult !== null;
            const shouldShowSelectionButtons =
              hasNoWinner && !userSelectedWinner;

            const isActive = isMessageActive(message, messageIndex);

            return (
              <div key={message.id} className="max-w-5xl mx-auto space-y-4">
                {/* Only show model response cards for active messages */}
                {hasMultipleResults && message.multiResults && isActive && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {message.multiResults.map((r) => {
                      const cardKey = `${message.id}-${r.model}`;
                      const label = modelLabelMap[r.model] || r.model;
                      const isWinner =
                        message.evaluationMetadata?.winnerModel === r.model;
                      const isUserSelected = userSelectedWinner === r.model;
                      const score =
                        message.evaluationMetadata?.meanScores[r.model];

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

                {/* Only show WinnerBanner for active messages (last message) */}
                {hasEvaluation && evaluationMetadata && isActive && (
                  <div>
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

                {/* Single Result or Regular Messages */}
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

                {/* Error Messages - Assistant messages without multiResults */}
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

                {/* Regular Assistant Messages (without multiResults) */}
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
              className="max-w-4xl backdrop-blur-2xl p-0"
              aria-describedby={undefined}
            >
              <DialogHeader>
                <DialogTitle className="text-xl">{detail?.label}</DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto p-0">
                {detail && (
                  <Markdown className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0">
                    {detail.content}
                  </Markdown>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
