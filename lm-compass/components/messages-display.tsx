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

  const modelLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    models.forEach((m) => { map[m.value] = m.label })
    return map
  }, [])

  const openDetail = (model: string, label: string, content: string) => {
    setDetail({ model, label, content })
  }
  const closeDetail = () => setDetail(null)

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p>Start a conversation by typing a message below.</p>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <div key={message.id} className="max-w-5xl mx-auto">
              {message.role === "assistant" && message.multiResults && message.multiResults.length > 1 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {message.multiResults.map((r) => {
                    const cardKey = `${message.id}-${r.model}`
                    const label = modelLabelMap[r.model] || r.model
                    const preview = r.content.slice(0, 800)
                    return (
                      <div key={cardKey} className="rounded-lg border bg-muted/50 p-3 flex flex-col gap-2">
                        <div className="text-sm font-semibold">{label}</div>
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
