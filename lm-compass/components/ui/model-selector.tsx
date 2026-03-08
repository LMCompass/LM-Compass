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
  { value: "openai/gpt-5.4", label: "GPT-5.4", provider: "OpenAI" },
  { value: "openai/gpt-5.2", label: "GPT-5.2", provider: "OpenAI" },
  { value: "openai/gpt-5.1", label: "GPT-5.1", provider: "OpenAI" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", provider: "OpenAI" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano", provider: "OpenAI" },
  { value: "openai/gpt-4.1", label: "GPT-4.1", provider: "OpenAI" },

  // Anthropic Models
  { value: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6", provider: "Anthropic" },
  { value: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", provider: "Anthropic" },
  { value: "anthropic/claude-opus-4.5", label: "Claude Opus 4.5", provider: "Anthropic" },
  { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", provider: "Anthropic" },
  { value: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", provider: "Anthropic" },


  // Google Models
  { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", provider: "Google" },
  { value: "google/gemini-3-pro-preview", label: "Gemini 3 Pro", provider: "Google" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", provider: "Google" },
  

  // Meta Models
  { value: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", provider: "Meta" },
  { value: "meta-llama/llama-4-scout", label: "Llama 4 Scout", provider: "Meta" },

  // DeepSeek Models
  { value: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2", provider: "DeepSeek" },
  { value: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1", provider: "DeepSeek" },
  { value: "deepseek/deepseek-r1", label: "DeepSeek R1", provider: "DeepSeek" },
  { value: "deepseek/deepseek-r1-0528", label: "DeepSeek R1 0528", provider: "DeepSeek" },

  // xAI Models
  { value: "x-ai/grok-4", label: "Grok 4", provider: "xAI" },
  { value: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast", provider: "xAI" },
  { value: "x-ai/grok-4-fast", label: "Grok 4 Fast", provider: "xAI" },
  { value: "x-ai/grok-3", label: "Grok 3", provider: "xAI" },

  // Mistral Models
  { value: "mistralai/mistral-medium-3.1", label: "Mistral Medium 3.1", provider: "Mistral" },
  { value: "mistralai/mistral-small-3.2-24b-instruct", label: "Mistral Small 3.2", provider: "Mistral" },
  { value: "mistralai/codestral-2508", label: "Codestral", provider: "Mistral" },


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