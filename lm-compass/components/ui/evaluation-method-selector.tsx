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

interface EvaluationMethodSelectorProps {
  value: string
  onChange: (value: string) => void
}

const evaluationMethods = [
  { value: "prompt-based", label: "Prompt-based" },
  { value: "multi-agent", label: "Multi-agent" },
]

export function EvaluationMethodSelector({ value, onChange }: EvaluationMethodSelectorProps) {
  const [open, setOpen] = React.useState(false)

  const selectedMethod = evaluationMethods.find((method) => method.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between"
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span>{selectedMethod?.label || "Select method"}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandList>
            <CommandEmpty>No evaluation method found.</CommandEmpty>
            <CommandGroup>
              {evaluationMethods.map((method) => (
                <CommandItem
                  key={method.value}
                  value={method.value}
                  onSelect={(currentValue) => {
                    onChange(currentValue)
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

