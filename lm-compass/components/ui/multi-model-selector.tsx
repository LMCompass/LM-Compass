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

interface MultiModelSelectorProps {
  values: string[]
  onChange: (values: string[]) => void
}

export function MultiModelSelector({ values, onChange }: MultiModelSelectorProps) {
  const [open, setOpen] = React.useState(false)

  const selected = models.filter((m) => values.includes(m.value))
  const selectedLabels = selected.map((m) => m.label)
  const displayLabels = selectedLabels.slice(0, 2)
  const overflowCount = Math.max(0, selectedLabels.length - 2)

  const toggleValue = (val: string) => {
    const exists = values.includes(val)
    if (exists) {
      onChange(values.filter((v) => v !== val))
    } else {
      if (values.length >= 4) {
        return
      }
      onChange([...values, val])
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[280px] justify-between"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            {selectedLabels.length === 0 ? (
              <span className="text-muted-foreground truncate">Select models (max 4)</span>
            ) : (
              <div className="flex items-center gap-1 min-w-0">
                {displayLabels.map((label) => (
                  <span
                    key={label}
                    className="max-w-[110px] truncate text-xs px-1.5 py-0.5 rounded bg-muted text-foreground border"
                    title={label}
                  >
                    {label}
                  </span>
                ))}
                {overflowCount > 0 && (
                  <span className="text-xs text-muted-foreground">+{overflowCount}</span>
                )}
              </div>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0">
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            <CommandGroup>
              {models.map((model) => (
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

