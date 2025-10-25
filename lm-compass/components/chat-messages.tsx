"use client"

import { Message } from "@/lib/types"
import { cn } from "@/lib/utils"

type ChatMessagesProps = {
  messages: Message[]
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground p-8">
        <p className="text-center">Start a conversation by typing a message below</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-4xl mx-auto w-full">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "flex",
            message.role === "user" ? "justify-end" : "justify-start"
          )}
        >
          <div
            className={cn(
              "rounded-2xl px-4 py-3 max-w-[85%] sm:max-w-[80%]",
              message.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            )}
          >
            <p className="whitespace-pre-wrap break-words text-sm sm:text-base">{message.content}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

