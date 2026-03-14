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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface MultiModelSelectorProps {
  values: string[]
  onChange: (values: string[]) => void
  buttonClassName?: string
  popoverClassName?: string
}

type ModelPricing = {
  prompt: number
  completion: number
  request: number
}

type PricingResponse = {
  pricingStatus: "live" | "unavailable"
  pricingByModel: Record<string, ModelPricing | null>
  pricingError?: string
}

function formatUsdPerMillionTokens(perTokenUsd: number) {
  if (!Number.isFinite(perTokenUsd)) return "—"
  const perMillion = perTokenUsd * 1_000_000
  if (perMillion >= 1) {
    return `$${perMillion.toFixed(2)}`
  }
  return `$${perMillion.toFixed(4)}`
}

function formatModelPrice(pricing: ModelPricing | null | undefined) {
  if (!pricing) return "—"
  return `${formatUsdPerMillionTokens(pricing.prompt)} / ${formatUsdPerMillionTokens(pricing.completion)}`
}

export function MultiModelSelector({
  values,
  onChange,
  buttonClassName,
  popoverClassName,
}: MultiModelSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [pricingByModel, setPricingByModel] = React.useState<Record<string, ModelPricing | null>>({})
  const [pricingStatus, setPricingStatus] = React.useState<"live" | "unavailable">("unavailable")

  const selected = models.filter((m) => values.includes(m.value))
  const selectedLabels = selected.map((m) => m.label)
  const selectedCount = values.length

  React.useEffect(() => {
    let isMounted = true

    const loadPricing = async () => {
      try {
        const response = await fetch("/api/models/pricing")
        const data = (await response.json()) as PricingResponse

        if (!isMounted) return

        if (!response.ok) {
          setPricingStatus("unavailable")
          setPricingByModel({})
          return
        }

        setPricingStatus(data.pricingStatus)
        setPricingByModel(data.pricingByModel ?? {})
      } catch {
        if (!isMounted) return
        setPricingStatus("unavailable")
        setPricingByModel({})
      }
    }

    loadPricing()

    return () => {
      isMounted = false
    }
  }, [])

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
              className={cn("w-[250px] justify-between", buttonClassName)}
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

      <PopoverContent className={cn("w-[320px] p-0", popoverClassName)}>
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            {pricingStatus === "live" && (
              <div className="sticky top-0 z-10 px-3 py-2 text-[11px] text-muted-foreground border-b border-border/60 bg-popover">
                Prices shown as input / output ($ per 1M tokens)
              </div>
            )}
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
                    <div className="flex w-full items-center justify-between gap-3">
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate">{model.label}</span>
                        <span className="text-xs text-muted-foreground">{model.provider}</span>
                      </div>
                      <div
                        className="text-xs text-muted-foreground text-right whitespace-nowrap"
                        title={`${model.label}: ${formatModelPrice(pricingByModel[model.value])} (input/output $ per 1M tokens)`}
                      >
                        {formatModelPrice(pricingByModel[model.value])}
                      </div>
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
