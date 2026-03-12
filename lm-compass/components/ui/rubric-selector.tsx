"use client";

import * as React from "react";
import { Check, ChevronsUpDown, ListChecks } from "lucide-react";
import { useSupabaseClient } from "@/utils/supabase/client";
import { useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type RubricRow = {
  id: string;
  rubric_title: string | null;
  category: string | null;
};

type RubricSelectorProps = {
  value: string;
  onChange: (value: string) => void;
  /**
   * Evaluation method selected in the chat header,
   * e.g. "prompt-based", "rl4f", "hitl".
   */
  evaluationMethod?: string;
};

export function RubricSelector({
  value,
  onChange,
  evaluationMethod,
}: RubricSelectorProps) {
  const supabase = useSupabaseClient();
  const { user } = useUser();
  const [rubrics, setRubrics] = React.useState<RubricRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!user?.id) {
      setRubrics([]);
      return;
    }

    let isMounted = true;

    const loadRubrics = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("rubrics")
          .select("id, rubric_title, category")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (!isMounted) return;

        if (error) {
          console.error("Failed to load rubrics:", error);
          setRubrics([]);
          return;
        }

        setRubrics((data || []) as RubricRow[]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadRubrics();

    return () => {
      isMounted = false;
    };
  }, [supabase, user?.id]);

  const effectiveValue = value || "default";

  const filteredRubrics = React.useMemo(() => {
    if (!evaluationMethod) return rubrics;
    let method = evaluationMethod.trim();
    if (!method) return rubrics;

    // Treat one-shot prompt-based as using the same rubrics
    // as regular prompt-based evaluations.
    if (method === "n-prompt-based") {
      method = "prompt-based";
    }

    return rubrics.filter((rubric) => {
      if (!rubric.category) {
        // If a rubric has no category, treat it as not matching
        // when a specific evaluation method is selected.
        return false;
      }
      const categories = rubric.category
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      if (categories.length === 0) return false;
      return categories.includes(method);
    });
  }, [rubrics, evaluationMethod]);

  const selectedRubric =
    effectiveValue === "default"
      ? { id: "default", rubric_title: "Default rubric" }
      : rubrics.find((r) => r.id === effectiveValue) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="min-w-[220px] max-w-fit justify-between"
              disabled={isLoading || !user}
            >
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">
                  {selectedRubric?.rubric_title?.trim() ||
                    "Select rubric"}
                </span>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Select a rubric for scoring</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto min-w-[220px] p-0">
        <Command>
          <CommandInput placeholder="Search rubrics..." />
          <CommandList>
            <CommandEmpty>No rubrics found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="default"
                onSelect={() => {
                  onChange("default");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    effectiveValue === "default"
                      ? "opacity-100"
                      : "opacity-0",
                  )}
                />
                <span>Default rubric</span>
              </CommandItem>
              {filteredRubrics.map((rubric) => (
                <CommandItem
                  key={rubric.id}
                  value={rubric.id}
                  onSelect={() => {
                    onChange(rubric.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      effectiveValue === rubric.id
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <span>
                    {rubric.rubric_title?.trim() || "Untitled rubric"}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

