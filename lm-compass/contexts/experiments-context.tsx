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
import { useUser } from "@clerk/nextjs";
import type {
  Experiment,
  ExperimentCostEstimate,
  ExperimentItem,
  MappedRow,
  StartExperimentInput,
  StartExperimentResult,
} from "@/lib/types";
import { ExperimentStatus, ExperimentItemStatus } from "@/lib/types";

const DEFAULT_SELECTED_MODELS = ['openai/gpt-5-nano', 'google/gemini-2.5-flash-lite'];
const DEFAULT_EVAL_METHOD = 'prompt-based';
const DEFAULT_RUBRIC_ID = '';
const PRICE_PER_TOKEN_USD = 5 / 1_000_000;
const BATCH_INSERT_SIZE = 500;

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

function normalizeAndValidateRows(rows: MappedRow[]) {
  const normalizedRows = rows.map((row) => {
    const query = (row.query ?? '').trim();
    const groundTruth = (row.ground_truth ?? '').trim();

    return {
      query,
      ground_truth: groundTruth.length > 0 ? groundTruth : undefined,
    };
  });

  const validRows = normalizedRows.filter((row) => row.query.length > 0);
  const skippedRows = rows.length - validRows.length;

  return { validRows, skippedRows };
}

function calculateEstimate(validRows: MappedRow[], skippedRows: number): ExperimentCostEstimate {
  const totalChars = validRows.reduce(
    (sum, row) => sum + row.query.length + (row.ground_truth?.length ?? 0),
    0
  );
  const avgChars = validRows.length > 0 ? totalChars / validRows.length : 0;
  const estTokensPerPrompt = avgChars / 4;
  const multiplier = DEFAULT_SELECTED_MODELS.length + 1; // selected models + judge
  const totalTokens = estTokensPerPrompt * multiplier * validRows.length;
  const estimatedUsd = totalTokens * PRICE_PER_TOKEN_USD;

  return {
    avgChars,
    estTokensPerPrompt,
    multiplier,
    totalTokens,
    estimatedUsd,
    validRows: validRows.length,
    skippedRows,
  };
}

interface ExperimentsContextType {
  activeExperimentId: string | null;
  setActiveExperimentId: (id: string | null) => void;
  isProcessing: boolean;
  progress: { completed: number; total: number };
  estimateExperimentCost: (rows: MappedRow[]) => ExperimentCostEstimate;
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
  const { user } = useUser();

  const estimateExperimentCost = useCallback((rows: MappedRow[]) => {
    const { validRows, skippedRows } = normalizeAndValidateRows(rows);
    return calculateEstimate(validRows, skippedRows);
  }, []);

  const startExperiment = useCallback(
    async (input: StartExperimentInput): Promise<StartExperimentResult> => {
      if (!user?.id) {
        throw new Error('Please sign in to start an experiment.');
      }

      const { validRows, skippedRows } = normalizeAndValidateRows(input.rows);
      if (validRows.length === 0) {
        throw new Error('No valid rows found. Please ensure at least one query is non-empty.');
      }

      const estimate = calculateEstimate(validRows, skippedRows);
      const experimentTitle = input.title?.trim() || `Experiment ${new Date().toLocaleString()}`;

      const { data: experiment, error: createExperimentError } = await supabase
        .from('experiments')
        .insert({
          user_id: user.id,
          title: experimentTitle,
          status: ExperimentStatus.DRAFT,
          created_at: new Date().toISOString(),
          configuration: {
            selected_models: DEFAULT_SELECTED_MODELS,
            rubric_id: DEFAULT_RUBRIC_ID,
            eval_method: DEFAULT_EVAL_METHOD,
          },
        })
        .select('id')
        .single();

      if (createExperimentError || !experiment?.id) {
        throw new Error(createExperimentError?.message || 'Failed to create experiment.');
      }

      try {
        for (let index = 0; index < validRows.length; index += BATCH_INSERT_SIZE) {
          const chunk = validRows.slice(index, index + BATCH_INSERT_SIZE).map((row) => ({
            experiment_id: experiment.id,
            input_query: row.query,
            expected_output: row.ground_truth ?? null,
            status: ExperimentItemStatus.PENDING,
            result: {},
          }));

          const { error: insertItemsError } = await supabase
            .from('experiments_items')
            .insert(chunk);

          if (insertItemsError) {
            throw insertItemsError;
          }
        }
      } catch (error) {
        await supabase
          .from('experiments')
          .update({ status: ExperimentStatus.ERROR })
          .eq('id', experiment.id);

        const message =
          error instanceof Error ? error.message : 'Failed while inserting experiment rows.';
        throw new Error(message);
      }

      const { error: updateStatusError } = await supabase
        .from('experiments')
        .update({ status: ExperimentStatus.RUNNING })
        .eq('id', experiment.id);

      if (updateStatusError) {
        throw new Error(
          `Experiment saved as draft, but failed to start: ${updateStatusError.message}`
        );
      }

      setActiveExperimentId(experiment.id);

      return {
        experimentId: experiment.id,
        insertedRows: validRows.length,
        skippedRows,
        status: ExperimentStatus.RUNNING,
        estimatedUsd: estimate.estimatedUsd,
      };
    },
    [supabase, user?.id]
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
            rubric: experiment.configuration?.rubric_id,
            evaluationMethod:
              experiment.configuration?.eval_method || "prompt-based",
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
