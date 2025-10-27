"use client"

import { useState, useRef, useEffect } from "react"
import { Sparkles, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface ModelSelectorProps {
  value: string
  onChange: (value: string) => void
}

const models = [
  { value: "tngtech/deepseek-r1t2-chimera:free", label: "DeepSeek Chimera", provider: "DeepSeek" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
  { value: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", provider: "Anthropic" },
  { value: "anthropic/claude-opus-4", label: "Claude Opus 4", provider: "Anthropic" },
  { value: "xai/grok-4-fast:free", label: "Grok 4 Fast", provider: "xAI" },
]

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedModel = models.find((model) => model.value === value)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "inline-flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-xs transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
          "w-[220px]",
        )}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span>{selectedModel?.label || "Select a model"}</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-2 w-[220px] rounded-md border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95">
          {models.map((model) => (
            <button
              key={model.value}
              onClick={() => {
                onChange(model.value)
                setIsOpen(false)
              }}
              className={cn(
                "w-full rounded-sm px-2 py-2 text-left text-sm transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:bg-accent",
                value === model.value && "bg-accent",
              )}
            >
              <div className="flex flex-col">
                <span className="font-medium">{model.label}</span>
                <span className="text-xs text-muted-foreground">{model.provider}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}