"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useSupabaseClient } from "@/utils/supabase/client";
import type {
  Experiment,
  ExperimentCostEstimate,
  ExperimentItem,
  MappedRow,
  StartExperimentInput,
  StartExperimentResult,
} from "@/lib/types";
import { ExperimentStatus, ExperimentItemStatus } from "@/lib/types";
import {
  calculateExperimentEstimate,
  DEFAULT_EVAL_METHOD,
  normalizeAndValidateRows,
} from "@/lib/experiments";

type RunItemResult = {
  model: string;
  message?: { content?: string | null };
  error?: string;
};

type RunItemResponse = {
  error?: string;
  results?: RunItemResult[];
  evaluationMetadata?: {
    meanScores?: Record<string, number>;
    [key: string]: unknown;
  };
};

type StartExperimentApiResponse = Partial<StartExperimentResult> & { error?: string };

interface ExperimentsContextType {
  activeExperimentId: string | null;
  setActiveExperimentId: (id: string | null) => void;
  isProcessing: boolean;
  progress: { completed: number; total: number };
  estimateExperimentCost: (
    rows: MappedRow[],
    selectedModelCount: number
  ) => ExperimentCostEstimate;
  startExperiment: (input: StartExperimentInput) => Promise<StartExperimentResult>;
}

const ExperimentsContext = createContext<ExperimentsContextType | undefined>(
  undefined,
);

export function ExperimentsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeExperimentId, setActiveExperimentId] = useState<string | null>(
    null,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const processingRef = useRef(false);
  const supabase = useSupabaseClient();

  const estimateExperimentCost = useCallback(
    (rows: MappedRow[], selectedModelCount: number) => {
      const { validRows, skippedRows } = normalizeAndValidateRows(rows);
      return calculateExperimentEstimate(validRows, skippedRows, selectedModelCount);
    },
    []
  );

  const startExperiment = useCallback(
    async (input: StartExperimentInput): Promise<StartExperimentResult> => {
      const response = await fetch('/api/experiments/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: input.title,
          rows: input.rows,
          selectedModels: input.selectedModels,
          rubricId: input.rubricId,
          evaluationMethod: input.evaluationMethod,
        }),
      });

      const result: StartExperimentApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to start experiment.');
      }

      if (!result.experimentId) {
        throw new Error('Invalid response from start experiment API.');
      }

      const finalResult: StartExperimentResult = {
        experimentId: result.experimentId,
        insertedRows: result.insertedRows ?? 0,
        skippedRows: result.skippedRows ?? 0,
        status: ExperimentStatus.RUNNING,
        estimatedUsd: result.estimatedUsd ?? 0,
      };

      setActiveExperimentId(finalResult.experimentId);

      return finalResult;
    },
    []
  );

  const claimNextItems = useCallback(
    async (experimentId: string) => {
      // Step 1: Find candidates
      const { data: candidates, error: findError } = await supabase
        .from("experiments_items")
        .select("id")
        .eq("experiment_id", experimentId)
        .eq("status", ExperimentItemStatus.PENDING)
        .limit(3);

      if (findError || !candidates || candidates.length === 0) {
        if (findError) console.error("Error finding pending items:", findError);
        return [];
      }

      const candidateIds = candidates.map((c) => c.id);

      // Step 2: Claim them
      const { data: claimed, error: claimError } = await supabase
        .from("experiments_items")
        .update({ status: ExperimentItemStatus.RUNNING })
        .in("id", candidateIds)
        .eq("status", ExperimentItemStatus.PENDING)
        .select();

      if (claimError) {
        console.error("Error claiming items:", claimError);
        return [];
      }

      return claimed as ExperimentItem[];
    },
    [supabase],
  );

  const processItem = useCallback(
    async (item: ExperimentItem, experiment: Experiment) => {
      try {
        const response = await fetch("/api/experiments/run-item", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input_query: item.input_query,
            expected_output: item.expected_output,
            models: experiment.configuration?.selected_models,
            rubric: experiment.configuration?.rubric_content,
            evaluationMethod:
              experiment.configuration?.eval_method || DEFAULT_EVAL_METHOD,
          }),
        });

        const resultData: RunItemResponse = await response.json();

        if (!response.ok) {
          throw new Error(resultData.error || "Failed to run item");
        }

        const finalResult: Record<string, unknown> = {
          evaluation_summary: {
            ...(resultData.evaluationMetadata ?? {}),
            modelReasoning: undefined,
          },
        };

        // 1. Map outputs and status
        if (Array.isArray(resultData.results)) {
          resultData.results.forEach((r) => {
            finalResult[r.model] = {
              output: r.message?.content || r.error || "",
              status: r.error ? "error" : "success",
            };
          });
        }

        // 2. Map averaged scores to the model keys for quick access
        if (resultData.evaluationMetadata?.meanScores) {
          Object.entries(resultData.evaluationMetadata.meanScores).forEach(
            ([model, score]) => {
              const modelResult = finalResult[model];
              if (
                modelResult &&
                typeof modelResult === "object" &&
                !Array.isArray(modelResult)
              ) {
                (modelResult as { score?: number }).score = score;
              }
            },
          );
        }

        const { error: updateError } = await supabase
          .from("experiments_items")
          .update({
            status: ExperimentItemStatus.COMPLETED,
            result: finalResult,
          })
          .eq("id", item.id);

        if (updateError) {
          console.error("Error updating item status:", updateError);
        }
      } catch (error: unknown) {
        console.error(`Error processing item ${item.id}:`, error);
        const errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred";
        await supabase
          .from("experiments_items")
          .update({
            status: ExperimentItemStatus.ERROR,
            error_message: errorMessage,
          })
          .eq("id", item.id);
      }
    },
    [supabase],
  );

  const processQueue = useCallback(async () => {
    if (!activeExperimentId || processingRef.current) return;

    processingRef.current = true;
    setIsProcessing(true);

    try {
      // Fetch experiment details once per processQueue run
      const { data: experiment, error: expError } = await supabase
        .from("experiments")
        .select("*")
        .eq("id", activeExperimentId)
        .single();

      if (expError || !experiment) {
        console.error(
          "Experiment not found at start of processQueue:",
          expError,
        );
        setActiveExperimentId(null);
        return;
      }

      while (activeExperimentId) {
        const items = await claimNextItems(activeExperimentId);

        if (items.length === 0) {
          // Check if there are any items left at all in this experiment
          const { count, error: countError } = await supabase
            .from("experiments_items")
            .select("*", { count: "exact", head: true })
            .eq("experiment_id", activeExperimentId)
            .eq("status", ExperimentItemStatus.PENDING);

          if (countError) {
            console.error(
              "Transient error checking pending count:",
              countError,
            );
            break; // Stop processing loop but don't mark as complete
          }

          if (count === 0) {
            // Also ensure no items are still stuck in 'running'
            // from this specific worker's perspective or others
            const { count: runningCount } = await supabase
              .from("experiments_items")
              .select("*", { count: "exact", head: true })
              .eq("experiment_id", activeExperimentId)
              .eq("status", ExperimentItemStatus.RUNNING);

            if ((runningCount || 0) === 0) {
              // Mark experiment as completed
              await supabase
                .from("experiments")
                .update({ status: ExperimentStatus.COMPLETED })
                .eq("id", activeExperimentId);

              setActiveExperimentId(null);
            }
            break; // Exit loop regardless, if others are processing we'll pick it up later or they will finish it.
          }
          break;
        }

        // Update progress
        const { count: totalCount } = await supabase
          .from("experiments_items")
          .select("*", { count: "exact", head: true })
          .eq("experiment_id", activeExperimentId);

        const { count: completedCount } = await supabase
          .from("experiments_items")
          .select("*", { count: "exact", head: true })
          .eq("experiment_id", activeExperimentId)
          .in("status", [
            ExperimentItemStatus.COMPLETED,
            ExperimentItemStatus.ERROR,
          ]); // Completed or Error

        setProgress({
          completed: completedCount || 0,
          total: totalCount || 0,
        });

        // Process batch concurrently (limit of 3 as per ticket)
        await Promise.all(
          items.map((item) => processItem(item, experiment as Experiment)),
        );
      }
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [activeExperimentId, claimNextItems, processItem, supabase]);

  useEffect(() => {
    if (activeExperimentId) {
      processQueue();
    }
  }, [activeExperimentId, processQueue]);

  // Initial check for any 'running' experiments on mount
  useEffect(() => {
    const checkActiveExperiments = async () => {
      const { data, error } = await supabase
        .from("experiments")
        .select("id")
        .eq("status", ExperimentStatus.RUNNING)
        .limit(1)
        .single();

      if (data && !error) {
        setActiveExperimentId(data.id);
      }
    };

    checkActiveExperiments();
  }, [supabase]);

  return (
    <ExperimentsContext.Provider
      value={{
        activeExperimentId,
        setActiveExperimentId,
        isProcessing,
        progress,
        estimateExperimentCost,
        startExperiment,
      }}
    >
      {children}
    </ExperimentsContext.Provider>
  );
}

export function useExperiments() {
  const context = useContext(ExperimentsContext);
  if (context === undefined) {
    throw new Error(
      "useExperiments must be used within an ExperimentsProvider",
    );
  }
  return context;
}
