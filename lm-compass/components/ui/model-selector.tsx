"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ModelSelectorProps {
  value: string
  onChange: (value: string) => void
}

export const models = [
  // OpenAI Models
  { value: "openai/gpt-5.1", label: "GPT-5.1", provider: "OpenAI" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", provider: "OpenAI" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano", provider: "OpenAI" },
  { value: "openai/gpt-4.1", label: "GPT-4.1", provider: "OpenAI" },

  // Anthropic Models
  { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", provider: "Anthropic" },
  { value: "anthropic/claude-haiku-4.5", label: "Claude 4.5 Haiku", provider: "Anthropic" },
  { value: "anthropic/claude-opus-4.1", label: "Claude Opus 4.1", provider: "Anthropic" },
  { value: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet", provider: "Anthropic" },
  
  // Google Models
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", provider: "Google" },
  
  // Meta Models
  { value: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", provider: "Meta" },
  { value: "meta-llama/llama-4-scout", label: "Llama 4 Scout", provider: "Meta" },
  
  // DeepSeek Models
  { value: "tngtech/deepseek-r1t2-chimera:free", label: "DeepSeek Chimera", provider: "DeepSeek" },
  { value: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek Chat", provider: "DeepSeek" },
  { value: "deepseek/deepseek-v3.2-exp", label: "DeepSeek Coder", provider: "DeepSeek" },
  
  // xAI Models
  { value: "x-ai/grok-4", label: "Grok 4", provider: "xAI" },
  { value: "x-ai/grok-4-fast", label: "Grok 4 Fast", provider: "xAI" },
  { value: "x-ai/grok-code-fast-1", label: "Grok Code Fast 1", provider: "xAI" },
  
  // Mistral Models
  { value: "mistralai/mistral-nemo", label: "Mistral Nemo", provider: "Mistral" },
  { value: "mistralai/mistral-small-3.2-24b-instruct", label: "Mistral Small 3.2", provider: "Mistral" },
]

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [open, setOpen] = React.useState(false)

  const selectedModel = models.find((model) => model.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[220px] justify-between"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span>{selectedModel?.label || "Select a model"}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0">
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            <CommandGroup>
              {models.map((model) => (
                <CommandItem
                  key={model.value}
                  value={model.value}
                  onSelect={(currentValue) => {
                    onChange(currentValue === value ? "" : currentValue)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === model.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">{model.label}</span>
                    <span className="text-xs text-muted-foreground">{model.provider}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}