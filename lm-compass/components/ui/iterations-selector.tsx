"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Repeat2 } from "lucide-react"
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

interface IterationsSelectorProps {
  value: number
  onChange: (value: number) => void
}

const iterationOptions = [
  { value: 1, label: "1 iteration" },
  { value: 2, label: "2 iterations" },
  { value: 3, label: "3 iterations" },
  { value: 4, label: "4 iterations" },
]

export function IterationsSelector({ value, onChange }: IterationsSelectorProps) {
  const [open, setOpen] = React.useState(false)

  const selectedOption = iterationOptions.find((option) => option.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-label={selectedOption?.label || "Select iterations"}
              aria-expanded={open}
              className="min-w-[120px] max-w-fit justify-between"
            >
              <div className="flex items-center gap-2">
                <Repeat2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{selectedOption?.label || "Select iterations"}</span>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Number of self-critique iterations</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto min-w-[120px] p-0">
        <Command>
          <CommandList>
            <CommandEmpty>No iterations found.</CommandEmpty>
            <CommandGroup>
              {iterationOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={String(option.value)}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span>{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
