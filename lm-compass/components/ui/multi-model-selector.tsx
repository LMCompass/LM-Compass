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
import { models } from "@/components/ui/model-selector"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface MultiModelSelectorProps {
  values: string[]
  onChange: (values: string[]) => void
}

export function MultiModelSelector({ values, onChange }: MultiModelSelectorProps) {
  const [open, setOpen] = React.useState(false)

  const selected = models.filter((m) => values.includes(m.value))
  const selectedLabels = selected.map((m) => m.label)
  const selectedCount = values.length

  // Sort models by selected status, so the selected models are at the top
  const sortedModels = React.useMemo(() => {
    return [...models].sort((a, b) => {
      const aSelected = values.includes(a.value)
      const bSelected = values.includes(b.value)
      if (aSelected && !bSelected) return -1
      if (!aSelected && bSelected) return 1
      return 0
    })
  }, [values])

  const toggleValue = (val: string) => {
    const exists = values.includes(val)
    if (exists) {
      onChange(values.filter((v) => v !== val))
    } else {
      if (values.length >= 4) {
        // TODO: Show a toast notification that the user has selected the maximum number of models
        return
      }
      onChange([...values, val])
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[250px] justify-between"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                {selectedCount === 0 ? (
                  <span className="text-muted-foreground truncate">Select models (max 4)</span>
                ) : (
                  <span className="truncate">
                    {selectedCount} {selectedCount === 1 ? 'model' : 'models'} selected
                  </span>
                )}
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
          <TooltipContent side="bottom">
            {selectedLabels.length > 0
              ? selectedLabels.join(", ")
              : "No models selected"
            }
          </TooltipContent>
      </Tooltip>

      <PopoverContent className="w-[320px] p-0">
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            <CommandGroup>
              {sortedModels.map((model) => (
                  <CommandItem
                    key={model.value}
                    value={model.value}
                    onSelect={() => toggleValue(model.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        values.includes(model.value) ? "opacity-100" : "opacity-0"
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

