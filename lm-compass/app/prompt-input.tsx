"use client"

import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input"
import { Button } from "@/components/ui/button"
import { ArrowUp, Square } from "lucide-react"
import { useState, useRef } from "react"
import { Message } from "@/lib/types"

type PromptInputComponentProps = {
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  isLoading: boolean
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  selectedModel: string
}

export function PromptInputComponent({
  messages,
  setMessages,
  isLoading,
  setIsLoading,
  selectedModel,
}: PromptInputComponentProps) {
  const [input, setInput] = useState("")
  const abortControllerRef = useRef<AbortController | null>(null)

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    }

    // Add user message to chat
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    abortControllerRef.current = new AbortController()

    try {
      // Send to API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage]
            .filter(msg => !msg.isStopped)
            .map(({ role, content }) => ({
              role,
              content,
            })),
          model: selectedModel,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error("Failed to get response")
      }

      const data = await response.json()

      // Add assistant response to chat
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.message.content,
      }

      setMessages((prev) => [...prev, assistantMessage])
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        
        console.error("Error:", error)
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsLoading(false)
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1]
      if (lastMessage && lastMessage.role === 'user') {
        return [...prev.slice(0, -1), { ...lastMessage, isStopped: true }]
      }
      return prev
    })
  }

  const handleValueChange = (value: string) => {
    setInput(value)
  }

  return (
    <PromptInput
      value={input}
      onValueChange={handleValueChange}
      isLoading={isLoading}
      onSubmit={handleSubmit}
      disabled={isLoading}
      className="w-full max-w-(--breakpoint-md)"
    >
      <div className="flex items-end gap-2">
        <PromptInputTextarea placeholder="Ask me anything..." className="flex-1" />
        <PromptInputActions>
          <PromptInputAction
            tooltip={isLoading ? "Stop generation" : "Send message"}
          >
            <Button
              variant="default"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={isLoading ? handleStop : handleSubmit}
              disabled={!isLoading && !input.trim()}
            >
              {isLoading ? (
                <Square className="size-5 fill-current" />
              ) : (
                <ArrowUp className="size-5" />
              )}
            </Button>
          </PromptInputAction>
        </PromptInputActions>
      </div>
    </PromptInput>
  )
}
