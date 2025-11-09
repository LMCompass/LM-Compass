"use client"

import { Message as MessageType } from "@/lib/types";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import { Loader } from "@/components/ui/loader";
import { Markdown } from "@/components/ui/markdown";
import { Button } from "@/components/ui/button";
import { models } from "@/components/ui/model-selector";
import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trophy, ChevronDown, ChevronUp } from "lucide-react";

type MessagesDisplayProps = {
  messages: MessageType[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function MessagesDisplay({ 
  messages, 
  isLoading, 
  messagesEndRef 
}: MessagesDisplayProps) {
  const [detail, setDetail] = useState<null | { model: string; label: string; content: string }>(null)
  const [showComparison, setShowComparison] = useState<string | null>(null)

  const modelLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    models.forEach((m) => { map[m.value] = m.label })
    return map
  }, [])

  const openDetail = (model: string, label: string, content: string) => {
    setDetail({ model, label, content })
  }
  const closeDetail = () => setDetail(null)

  const toggleComparison = (messageId: string) => {
    setShowComparison(showComparison === messageId ? null : messageId)
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p>Start a conversation by typing a message below.</p>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <div key={message.id} className="max-w-5xl mx-auto space-y-3">
              {/* Winner Announcement */}
              {message.role === "assistant" && 
               message.multiResults && 
               message.multiResults.length > 1 && 
               message.evaluationMetadata && (
                <div className="rounded-lg border bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Trophy className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                    <div>
                      <div className="font-semibold text-sm">
                        Winner: {modelLabelMap[message.evaluationMetadata.winnerModel] || message.evaluationMetadata.winnerModel}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Average Score: {message.evaluationMetadata.meanScores[message.evaluationMetadata.winnerModel]?.toFixed(1) || 'N/A'}/100
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleComparison(message.id)}
                    className="flex items-center gap-1"
                  >
                    {showComparison === message.id ? (
                      <>
                        Hide Comparison <ChevronUp className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        Show Comparison <ChevronDown className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Comparison Dialog */}
              {message.evaluationMetadata && showComparison === message.id && (
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <div className="font-semibold text-sm">Model Comparison</div>
                  <div className="space-y-3">
                    {message.multiResults?.map((result) => {
                      const meanScore = message.evaluationMetadata!.meanScores[result.model];
                      const reasoning = message.evaluationMetadata!.modelReasoning[result.model] || [];
                      const isWinner = result.model === message.evaluationMetadata!.winnerModel;
                      const label = modelLabelMap[result.model] || result.model;
                      
                      return (
                        <div
                          key={result.model}
                          className={`rounded-lg border p-3 ${
                            isWinner
                              ? 'border-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20'
                              : 'bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{label}</span>
                              {isWinner && (
                                <Trophy className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                              )}
                            </div>
                            <span className="text-sm font-medium">
                              Score: {meanScore?.toFixed(1) || 'N/A'}/100
                            </span>
                          </div>
                          {reasoning.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-muted-foreground">
                                Evaluation Reasoning:
                              </div>
                              <div className="space-y-1">
                                {reasoning.map((reason, idx) => (
                                  <div
                                    key={idx}
                                    className="text-xs text-muted-foreground pl-2 border-l-2 border-muted"
                                  >
                                    {reason}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {message.role === "assistant" && message.multiResults && message.multiResults.length > 1 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {message.multiResults.map((r) => {
                    const cardKey = `${message.id}-${r.model}`
                    const label = modelLabelMap[r.model] || r.model
                    const preview = r.content.slice(0, 800)
                    const isWinner = message.evaluationMetadata?.winnerModel === r.model
                    return (
                      <div
                        key={cardKey}
                        className={`rounded-lg border p-3 flex flex-col gap-2 ${
                          isWinner
                            ? 'border-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20'
                            : 'bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">{label}</div>
                          {isWinner && (
                            <Trophy className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                          )}
                        </div>
                        {message.evaluationMetadata && (
                          <div className="text-xs text-muted-foreground">
                            Score: {message.evaluationMetadata.meanScores[r.model]?.toFixed(1) || 'N/A'}/100
                          </div>
                        )}
                        <div className="text-sm text-muted-foreground">
                          <div className="relative max-h-40 overflow-hidden whitespace-pre-wrap break-words">
                            {preview}
                            {r.content.length > preview.length && (
                              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-muted/70 to-transparent" />
                            )}
                          </div>
                        </div>
                        <div className="mt-1">
                          <Button size="sm" variant="secondary" onClick={() => openDetail(r.model, label, r.content)}>
                            Show more
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : message.role === "assistant" && message.multiResults && message.multiResults.length === 1 ? (
                <Message className="max-w-4xl mx-auto flex flex-row">
                  <MessageContent 
                    markdown={true}
                    className="max-w-none bg-card text-card-foreground"
                  >
                    {message.multiResults[0].content}
                  </MessageContent>
                </Message>
              ) : (
                <Message 
                  className={`max-w-4xl mx-auto flex ${
                    message.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <MessageContent 
                    markdown={message.role === "assistant"}
                    className={`max-w-none ${
                      message.role === "user" 
                        ? message.isStopped 
                          ? "opacity-60"
                          : "bg-primary text-primary-foreground" 
                        : "bg-card text-card-foreground"
                    }`}
                  >
                    {message.content}
                  </MessageContent>
                </Message>
              )}
            </div>
          ))}
          {isLoading && (
            <Message className="max-w-4xl mx-auto flex flex-row">
              <MessageAvatar
                src="/ai-avatar.png"
                alt="AI Assistant"
                fallback="AI"
                className="mt-1"
              />
              <div className="rounded-lg p-2 bg-card text-card-foreground break-words whitespace-normal">
                <Loader variant="typing" size="md" />
              </div>
            </Message>
          )}
          <Dialog open={!!detail} onOpenChange={(open) => !open && closeDetail()}>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>{detail?.label}</DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto">
                {detail && (
                  <Markdown className="prose max-w-none">{detail.content}</Markdown>
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
