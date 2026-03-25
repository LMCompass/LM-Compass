"use client"

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Minus, Plus } from "lucide-react";
import type { RubricCategory, RubricEvaluationMethod } from "@/lib/rubrics";
import { getDefaultRubricCategories } from "@/app/(app)/rubric/actions";
import { cn } from "@/lib/utils";

type CreateRubricFromDefaultPayload = {
  mode: "weight-adjusted-default";
  title: string;
  weights: Record<string, number>;
  categoryLabels?: Record<string, string>;
  categoryDescriptions?: Record<string, string>;
  evaluationMethods: RubricEvaluationMethod[];
};

type CreateCustomRubricPayload = {
  mode: "custom";
  title: string;
  content: string;
  evaluationMethods: RubricEvaluationMethod[];
};

export type NewRubricInput =
  | CreateRubricFromDefaultPayload
  | CreateCustomRubricPayload;

export interface RubricDialogInitialData {
  mode: "custom" | "weight-adjusted-default";
  title: string;
  content: string;
  weights: Record<string, number> | null;
  categoryLabels?: Record<string, string> | null;
  categoryDescriptions?: Record<string, string> | null;
  evaluationMethods: RubricEvaluationMethod[];
}

interface AddRubricDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (rubric: NewRubricInput) => void | Promise<void>;
  initialData?: RubricDialogInitialData;
}

export function AddRubricDialog({ open, onOpenChange, onSave, initialData }: AddRubricDialogProps) {
  const isEditMode = !!initialData;
  const [mode, setMode] = useState<"custom" | "weight-adjusted-default">("custom");
  const [rubricName, setRubricName] = useState("");
  const [rubricDescription, setRubricDescription] = useState("");
  const [categories, setCategories] = useState<RubricCategory[] | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [evaluationMethods, setEvaluationMethods] = useState<
    RubricEvaluationMethod[]
  >(["prompt-based"]);
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});
  const [categoryDescriptions, setCategoryDescriptions] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) {
      setCategories(null);
      setIsLoadingCategories(false);
      setCategoriesError(null);
    }

    if (open && initialData) {
      setMode(initialData.mode);
      setRubricName(initialData.title);
      setRubricDescription(initialData.mode === "custom" ? initialData.content : "");
      setWeights(initialData.weights ?? {});
      setCategoryLabels(initialData.categoryLabels ?? {});
      setCategoryDescriptions(initialData.categoryDescriptions ?? {});
      setEvaluationMethods(
        initialData.evaluationMethods.length > 0
          ? initialData.evaluationMethods
          : ["prompt-based"]
      );
    } else if (!open) {
      setRubricName("");
      setRubricDescription("");
      setMode("custom");
      setWeights({});
      setCategoryLabels({});
      setCategoryDescriptions({});
      setEvaluationMethods(["prompt-based"]);
    }
  }, [open, initialData]);

  useEffect(() => {
    if (!open) return;
    if (mode !== "weight-adjusted-default") return;
    if (categories || isLoadingCategories) return;

    const loadCategories = async () => {
      setIsLoadingCategories(true);
      setCategoriesError(null);
      try {
        const result = await getDefaultRubricCategories();
        if (!result.success || !result.data) {
          setCategoriesError(result.error ?? "Failed to load default rubric.");
          setCategories(null);
          setWeights({});
          return;
        }

        setCategories(result.data);

        if (initialData?.mode === "weight-adjusted-default" && initialData.weights) {
          setWeights(initialData.weights);
          setCategoryLabels(initialData.categoryLabels ?? {});
          setCategoryDescriptions(initialData.categoryDescriptions ?? {});
        } else {
          const defaultWeights: Record<string, number> = {};
          for (const cat of result.data) {
            defaultWeights[cat.key] = cat.defaultPoints;
          }
          setWeights(defaultWeights);
        }
      } catch (error) {
        console.error("Failed to load default rubric categories:", error);
        setCategoriesError("Failed to load default rubric.");
        setCategories(null);
        setWeights({});
      } finally {
        setIsLoadingCategories(false);
      }
    };

    void loadCategories();
  }, [open, mode, categories, isLoadingCategories, initialData]);

  const clearForm = () => {
    setRubricName("");
    setRubricDescription("");
    setMode("custom");
    setCategories(null);
    setWeights({});
    setCategoryLabels({});
    setCategoryDescriptions({});
    setCategoriesError(null);
    setEvaluationMethods(["prompt-based"]);
    onOpenChange(false);
  };

  const totalPoints =
    mode === "weight-adjusted-default"
      ? Object.values(weights).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0)
      : 0;

  const hasAtLeastOneMethod = evaluationMethods.length > 0;

  const isCustomValid =
    rubricName.trim() !== "" &&
    rubricDescription.trim() !== "" &&
    hasAtLeastOneMethod;

  const isDefaultModeValid =
    rubricName.trim() !== "" &&
    categories != null &&
    categories.length > 0 &&
    Object.keys(weights).length === categories.length &&
    Object.values(weights).every((v) => Number.isFinite(v) && v > 0) &&
    totalPoints === 100 &&
    hasAtLeastOneMethod;

  const toggleEvaluationMethod = (method: RubricEvaluationMethod) => {
    setEvaluationMethods((prev) =>
      prev.includes(method)
        ? prev.filter((m) => m !== method)
        : [...prev, method],
    );
  };

  const handleSave = async () => {
    if (!onSave) {
      if (mode === "custom") {
        if (!isCustomValid) return;
        console.log("Saving rubric:", {
          mode: "custom",
          title: rubricName,
          content: rubricDescription,
        });
      } else {
        if (!isDefaultModeValid) return;
        console.log("Saving rubric:", {
          mode: "weight-adjusted-default",
          title: rubricName,
          weights,
        });
      }
      clearForm();
      return;
    }

    if (mode === "custom") {
      if (!isCustomValid) return;
      await onSave({
        mode: "custom",
        title: rubricName.trim(),
        content: rubricDescription.trim(),
        evaluationMethods,
      });
    } else {
      if (!isDefaultModeValid) return;
      const hasLabelOverrides = Object.keys(categoryLabels).length > 0;
      const hasDescOverrides = Object.keys(categoryDescriptions).length > 0;
      await onSave({
        mode: "weight-adjusted-default",
        title: rubricName.trim(),
        weights,
        ...(hasLabelOverrides ? { categoryLabels } : {}),
        ...(hasDescOverrides ? { categoryDescriptions } : {}),
        evaluationMethods,
      });
    }

    clearForm();
  };

  const handleCancel = () => {
    clearForm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Rubric" : "Add Rubric"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Modify your evaluation rubric" : "Create a new evaluation rubric"}
          </DialogDescription>
        </DialogHeader>
        {/* Mode toggle */}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === "custom" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("custom")}
          >
            Custom rubric
          </Button>
          <Button
            type="button"
            variant={mode === "weight-adjusted-default" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("weight-adjusted-default")}
          >
            Adjust default weights
          </Button>
        </div>

        <div className="space-y-4 py-4">
          {/* Common: name */}
          <div className="space-y-2">
            <label htmlFor="rubric-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="rubric-name"
              placeholder="Enter rubric name"
              value={rubricName}
              onChange={(e) => setRubricName(e.target.value)}
              aria-required={true}
            />
          </div>

          {/* Common: evaluation methods/categories */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Applies to evaluation methods
            </label>

            {evaluationMethods.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {evaluationMethods.map((method) => (
                  <button
                    key={method}
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                    onClick={() => toggleEvaluationMethod(method)}
                  >
                    <span>
                      {method === "prompt-based" && "Prompt-based scoring"}
                      {method === "rl4f" &&
                        "Rationale Based Self Critique Loops"}
                      {method === "hitl" &&
                        "Human-in-the-loop (HITL) rubric refinement"}
                    </span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {(["prompt-based", "rl4f", "hitl"] as RubricEvaluationMethod[]).map(
                (method) => {
                  const isSelected = evaluationMethods.includes(method);
                  const label =
                    method === "prompt-based"
                      ? "Prompt-based"
                      : method === "rl4f"
                        ? "RL4F"
                        : "HITL";
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => toggleEvaluationMethod(method)}
                      className={cn(
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background text-foreground hover:bg-accent",
                      )}
                    >
                      {label}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {mode === "custom" ? (
            // Custom rubric content
            <div className="space-y-2">
              <label htmlFor="rubric-description" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="rubric-description"
                placeholder="Enter rubric description"
                value={rubricDescription}
                onChange={(e) => setRubricDescription(e.target.value)}
                rows={6}
                className="max-h-64 overflow-y-auto"
                aria-required={true}
              />
            </div>
          ) : (
            // Weight-adjusted default mode
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">Default categories</span>
                <span className="text-xs text-muted-foreground">
                  Total: {totalPoints}/100 points
                </span>
              </div>

              {categoriesError && (
                <p className="text-xs text-destructive">{categoriesError}</p>
              )}

              {isLoadingCategories && !categories && (
                <p className="text-sm text-muted-foreground">
                  Loading default rubric…
                </p>
              )}

              {categories && categories.length > 0 && (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {categories.map((cat) => {
                    const currentPoints = weights[cat.key] ?? cat.defaultPoints;
                    const pointsUsedByOthers = Object.entries(weights)
                      .filter(([k]) => k !== cat.key)
                      .reduce((sum, [, v]) => sum + (Number.isFinite(v) ? v : 0), 0);
                    const maxForThis = 100 - pointsUsedByOthers;

                    return (
                      <div key={cat.key} className="space-y-2 rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <Input
                            className="h-8 text-sm font-medium"
                            value={categoryLabels[cat.key] ?? cat.key}
                            onChange={(e) =>
                              setCategoryLabels((prev) => ({
                                ...prev,
                                [cat.key]: e.target.value,
                              }))
                            }
                            placeholder="Category name"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              disabled={currentPoints <= 0}
                              onClick={() =>
                                setWeights((prev) => ({
                                  ...prev,
                                  [cat.key]: Math.max(0, currentPoints - 1),
                                }))
                              }
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="text"
                              inputMode="numeric"
                              className="h-7 w-12 text-center text-sm font-medium tabular-nums px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={currentPoints}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9]/g, "");
                                if (raw === "") {
                                  setWeights((prev) => ({ ...prev, [cat.key]: 0 }));
                                  return;
                                }
                                const next = Math.min(Number(raw), maxForThis);
                                setWeights((prev) => ({ ...prev, [cat.key]: next }));
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              disabled={currentPoints >= maxForThis}
                              onClick={() =>
                                setWeights((prev) => ({
                                  ...prev,
                                  [cat.key]: Math.min(currentPoints + 1, maxForThis),
                                }))
                              }
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            <span className="text-xs text-muted-foreground ml-0.5">
                              pts
                            </span>
                          </div>
                        </div>
                        <Textarea
                          className="text-xs text-muted-foreground resize-none min-h-0"
                          rows={2}
                          value={categoryDescriptions[cat.key] ?? cat.description}
                          onChange={(e) =>
                            setCategoryDescriptions((prev) => ({
                              ...prev,
                              [cat.key]: e.target.value,
                            }))
                          }
                          placeholder="Category description"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  onClick={handleSave}
                  disabled={
                    mode === "custom" ? !isCustomValid : !isDefaultModeValid
                  }
                >
                  {isEditMode ? "Update" : "Save"}
                </Button>
              </span>
            </TooltipTrigger>
            {mode === "weight-adjusted-default" && (totalPoints > 100 || totalPoints < 100) && (
              <TooltipContent side="top">
                Total points must be 100, got {totalPoints}.
              </TooltipContent>
            )}
          </Tooltip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

