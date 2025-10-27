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

const models = [
  // OpenAI Models
  { value: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
  { value: "openai/gpt-4-turbo", label: "GPT-4 Turbo", provider: "OpenAI" },
  { value: "openai/gpt-3.5-turbo", label: "GPT-3.5 Turbo", provider: "OpenAI" },
  
  // Anthropic Models
  { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", provider: "Anthropic" },
  { value: "anthropic/claude-opus-4", label: "Claude Opus 4", provider: "Anthropic" },
  { value: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku", provider: "Anthropic" },
  { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", provider: "Anthropic" },
  
  // Google Models
  { value: "google/gemini-pro-1.5", label: "Gemini Pro 1.5", provider: "Google" },
  { value: "google/gemini-flash-1.5", label: "Gemini Flash 1.5", provider: "Google" },
  { value: "google/gemini-pro", label: "Gemini Pro", provider: "Google" },
  
  // Meta Models
  { value: "meta-llama/llama-3.1-405b-instruct", label: "Llama 3.1 405B", provider: "Meta" },
  { value: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B", provider: "Meta" },
  { value: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B", provider: "Meta" },
  
  // DeepSeek Models
  { value: "tngtech/deepseek-r1t2-chimera:free", label: "DeepSeek Chimera", provider: "DeepSeek" },
  { value: "deepseek/deepseek-chat", label: "DeepSeek Chat", provider: "DeepSeek" },
  { value: "deepseek/deepseek-coder", label: "DeepSeek Coder", provider: "DeepSeek" },
  
  // xAI Models
  { value: "xai/grok-4-fast:free", label: "Grok 4 Fast", provider: "xAI" },
  { value: "xai/grok-2", label: "Grok 2", provider: "xAI" },
  
  // Mistral Models
  { value: "mistralai/mistral-7b-instruct", label: "Mistral 7B", provider: "Mistral" },
  { value: "mistralai/mixtral-8x7b-instruct", label: "Mixtral 8x7B", provider: "Mistral" },
  { value: "mistralai/mixtral-8x22b-instruct", label: "Mixtral 8x22B", provider: "Mistral" },
  
  // Cohere Models
  { value: "cohere/command-r-plus", label: "Command R+", provider: "Cohere" },
  { value: "cohere/command-r", label: "Command R", provider: "Cohere" },
  
  // Perplexity Models
  { value: "perplexity/llama-3.1-sonar-small-128k-online", label: "Sonar Small", provider: "Perplexity" },
  { value: "perplexity/llama-3.1-sonar-large-128k-online", label: "Sonar Large", provider: "Perplexity" },
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