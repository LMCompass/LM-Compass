"use client"

import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input"
import { Button } from "@/components/ui/button"
import { ArrowUp, Square } from "lucide-react"
import { useState, useRef, useMemo } from "react"
import { Message } from "@/lib/types"

type PromptInputComponentProps = {
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  isLoading: boolean
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  setLoadingPhase: React.Dispatch<React.SetStateAction<"querying" | "evaluating">>
  selectedModels: string[]
}

export function PromptInputComponent({
  messages,
  setMessages,
  isLoading,
  setIsLoading,
  setLoadingPhase,
  selectedModels,
}: PromptInputComponentProps) {
  const [input, setInput] = useState("")
  const abortControllerRef = useRef<AbortController | null>(null)

  type MultiResult = { model: string; message?: { role: string; content: string }; error?: string }

  // Check if user needs to select a winner before sending another message
  const needsWinnerSelection = useMemo(() => {
    if (messages.length === 0) return false
    const lastMessage = messages[messages.length - 1]
    
    // Check if last message is an assistant message with evaluation metadata
    if (lastMessage.role === 'assistant' && lastMessage.evaluationMetadata) {
      // Check if there's a tie (no winner) and no user selection yet
      const hasTie = lastMessage.evaluationMetadata.winnerModel === null
      const hasNoSelection = !lastMessage.userSelectedWinner
      const hasMultipleResults = lastMessage.multiResults && lastMessage.multiResults.length > 1
      
      return hasTie && hasNoSelection && hasMultipleResults
    }
    return false
  }, [messages])

  const coerceToString = (value: unknown): string => {
    if (typeof value === "string") return value
    if (value == null) return ""
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  const handleSubmit = async () => {
    // Prevent submission if waiting for winner selection, no input, or no models selected
    if (!input.trim() || isLoading || needsWinnerSelection || selectedModels.length === 0) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    }

    // Add user message to chat
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)
    setLoadingPhase("querying")

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
            // Filter out assistant messages with empty content only in tie scenarios (evaluationMetadata present, no winnerModel)
            .filter(msg =>
              msg.role !== 'assistant' ||
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
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error("Failed to get response")
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      if (!reader) {
        throw new Error("No response body")
      }

      let finalData: any = null

      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6))
                
                // Update loading phase when evaluation starts
                if (data.phase === "evaluating") {
                  setLoadingPhase("evaluating")
                }
                
                // Store final data when complete
                if (data.phase === "complete") {
                  finalData = data
                }
                
                // Handle errors
                if (data.phase === "error") {
                  throw new Error(data.error || "Unknown error")
                }
              } catch (e) {
                console.error("Error parsing SSE data:", e)
                // Re-throw if we failed to parse critical phase data
                if (line.includes('"phase":"complete"') || line.includes('"phase":"error"')) {
                  throw new Error("Failed to parse server response")
                }
              }
            }
          }
        }
      } finally {
        // Ensure reader is released even if request is aborted or an error occurs
        reader.releaseLock()
      }

      if (!finalData) {
        throw new Error("No data received")
      }

      // API always returns { results } array for consistent format
      if (!finalData.results || !Array.isArray(finalData.results)) {
        throw new Error("Invalid response format")
      }

      const multiResults = (finalData.results as MultiResult[]).map((r) => ({
        model: r.model,
        content: r.error ? `Error: ${r.error}` : coerceToString(r.message?.content),
      }));

      // Set content to winning response if winner exists, otherwise keep empty (tie scenario)
      let content = "";
      if (finalData.evaluationMetadata?.winnerModel) {
        const winnerResult = multiResults.find((r) => r.model === finalData.evaluationMetadata.winnerModel);
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
      setLoadingPhase("querying")
      abortControllerRef.current = null
    }
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1]
      if (lastMessage && lastMessage.role === 'user') {
        return [...prev.slice(0, -1), { ...lastMessage, isStopped: true }]
      }
      return prev
    })

    setIsLoading(false)
    setLoadingPhase("querying")
    abortControllerRef.current = null
  }

  const handleValueChange = (value: string) => {
    setInput(value)
  }

  return (
    <div className="w-full md:w-3/4 lg:w-2/3">
      {needsWinnerSelection && (
        <div className="mb-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
          Please select a winning response from the options above before continuing the conversation.
        </div>
      )}
      {selectedModels.length === 0 && !needsWinnerSelection && (
        <div className="mb-2 px-4 py-2bg-yellow-50 dark:bg-yellow-950/20 border border-blue-200 dark:border-blue-900 rounded-lg text-sm text-black-800 dark:text-black-200">
          Please select at least one model from the dropdown above before sending a message.
        </div>
      )}
      <PromptInput
        value={input}
        onValueChange={handleValueChange}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        disabled={isLoading || needsWinnerSelection || selectedModels.length === 0}
      >
        <div className="flex items-end gap-2">
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
                className="h-8 w-8 rounded-full"
                onClick={isLoading ? handleStop : handleSubmit}
                disabled={!isLoading && (needsWinnerSelection || !input.trim() || selectedModels.length === 0)}
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
    </div>
  )
}
