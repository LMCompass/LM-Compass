"use client"

import * as React from "react"
import { Check, ChevronsUpDown, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface EvaluationMethodSelectorProps {
  value: string
  onChange: (value: string) => void
}

export const EVALUATION_METHODS = [
  { value: "prompt-based", label: "Prompt-based scoring" },
  { value: "n-prompt-based", label: "One-Shot Prompt-based scoring" },
  { value: "rl4f", label: "Rationale Based Self Critique Loops" },
  { value: "hitl", label: "Human-in-the-loop (HITL) rubric refinement" },
] as const

export function getEvaluationMethodLabel(value: string): string {
  return EVALUATION_METHODS.find((m) => m.value === value)?.label ?? value
}

const evaluationMethods = EVALUATION_METHODS

export function EvaluationMethodSelector({ value, onChange }: EvaluationMethodSelectorProps) {
  const [open, setOpen] = React.useState(false)

  const selectedMethod = evaluationMethods.find((method) => method.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{selectedMethod?.label || "Select method"}</span>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Select an evaluation method</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto min-w-[200px] p-0">
        <Command>
          <CommandList>
            <CommandEmpty>No evaluation method found.</CommandEmpty>
            <CommandGroup>
              {evaluationMethods.map((method) => (
                <CommandItem
                  key={method.value}
                  value={method.value}
                  onSelect={() => {
                    onChange(method.value)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === method.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span>{method.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

