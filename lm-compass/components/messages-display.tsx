"use client";

import type React from "react";

import type { Message as MessageType } from "@/lib/types";
import { MessageContent } from "@/components/ui/message";
import { Markdown } from "@/components/ui/markdown";
import { models } from "@/components/ui/model-selector";
import { useState, useMemo } from "react";
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

type MessagesDisplayProps = {
  messages: MessageType[];
  isLoading: boolean;
  loadingPhase: "querying" | "evaluating";
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>;
  selectedModels: string[];
};

export function MessagesDisplay({
  messages,
  isLoading,
  loadingPhase,
  messagesEndRef,
  setMessages,
  selectedModels,
}: MessagesDisplayProps) {
  const [detail, setDetail] = useState<null | {
    model: string;
    label: string;
    content: string;
  }>(null);
  const [showComparison, setShowComparison] = useState<string | null>(null);

  const modelLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    models.forEach((m) => {
      map[m.value] = m.label;
    });
    return map;
  }, []);

  const openDetail = (model: string, label: string, content: string) => {
    setDetail({ model, label, content });
  };
  const closeDetail = () => setDetail(null);

  const toggleComparison = (messageId: string) => {
    setShowComparison(showComparison === messageId ? null : messageId);
  };

  const handleSelectWinner = (
    messageId: string,
    selectedModel: string,
    selectedContent: string
  ) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              content: selectedContent,
              userSelectedWinner: selectedModel,
            }
          : msg
      )
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {messages.length === 0 ? (
        <EmptyChatHeader />
      ) : (
        <>
          {messages.map((message) => {
            const hasMultipleResults =
              message.role === "assistant" &&
              message.multiResults &&
              message.multiResults.length > 1;
            const evaluationMetadata = message.evaluationMetadata;
            const hasEvaluation = hasMultipleResults && evaluationMetadata;
            const hasNoWinner = evaluationMetadata?.winnerModel === null;
            const userSelectedWinner = message.userSelectedWinner;

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

            return (
              <div key={message.id} className="max-w-5xl mx-auto space-y-4">
                {hasMultipleResults && message.multiResults && (
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

                {hasEvaluation && evaluationMetadata && (
                  <div className="bg-card">
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
                  <div className="rounded-2xl p-6 shadow-lg bg-card">
                    <MessageContent markdown={true} className="bg-card">
                      {displayResult.content}
                    </MessageContent>
                  </div>
                )}

                {/* Single Result or Regular Messages */}
                {message.role === "assistant" &&
                message.multiResults &&
                message.multiResults.length === 1 ? (
                  <div className="rounded-2xl p-6 shadow-lg bg-card">
                    <MessageContent markdown={true} className="bg-card">
                      {message.multiResults[0].content}
                    </MessageContent>
                  </div>
                ) : null}

                {message.role === "user" && (
                  <div className="flex justify-end">
                    <div
                      className={`rounded-2xl px-5 py-3 max-w-2xl shadow-lg ${
                        message.isStopped
                          ? "opacity-60"
                          : "bg-primary/90 text-primary-foreground backdrop-blur-xl"
                      }`}
                    >
                      <p className="text-sm leading-relaxed">
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
              className="max-w-4xl backdrop-blur-2xl"
              aria-describedby={undefined}
            >
              <DialogHeader>
                <DialogTitle className="text-xl">{detail?.label}</DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto pr-2 -mr-2">
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
      <div ref={messagesEndRef} />
    </div>
  );
}
