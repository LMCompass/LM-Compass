'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import type { Experiment, ExperimentItem } from '@/lib/types';

interface ExperimentsContextType {
  activeExperimentId: string | null;
  setActiveExperimentId: (id: string | null) => void;
  isProcessing: boolean;
  progress: { completed: number; total: number };
}

const ExperimentsContext = createContext<ExperimentsContextType | undefined>(undefined);

export function ExperimentsProvider({ children }: { children: React.ReactNode }) {
  const [activeExperimentId, setActiveExperimentId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const processingRef = useRef(false);
  const supabase = useSupabaseClient();

  const claimNextItems = useCallback(async (experimentId: string) => {
    // Attempt to claim 3 items by updating status from pending (0) to running (1)
    // using a select with subquery to mimic atomic claim since Supabase's JS client
    // doesn't support UPDATE ... RETURNING with LIMIT directly in a simple way.
    // However, we can use a select...update flow which is "safe enough" in most cases,
    // but better would be an RPC. Let's stick to the client-side claim for now with a slight delay
    // or use a direct update if possible.

    // Step 1: Find candidates
    const { data: candidates, error: findError } = await supabase
      .from('experiments_items')
      .select('id')
      .eq('experiment_id', experimentId)
      .eq('status', 0)
      .limit(3);

    if (findError || !candidates || candidates.length === 0) {
      if (findError) console.error('Error finding pending items:', findError);
      return [];
    }

    const candidateIds = candidates.map(c => c.id);

    // Step 2: Claim them
    const { data: claimed, error: claimError } = await supabase
      .from('experiments_items')
      .update({ status: 1 }) // 1 for running
      .in('id', candidateIds)
      .eq('status', 0) // Extra safety check
      .select();

    if (claimError) {
      console.error('Error claiming items:', claimError);
      return [];
    }

    return claimed as ExperimentItem[];
  }, [supabase]);

  const processItem = useCallback(async (item: ExperimentItem, experiment: Experiment) => {
    try {
      const response = await fetch('/api/experiments/run-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_query: item.input_query,
          expected_output: item.expected_output,
          models: experiment.configuration?.selected_models,
          rubric: experiment.configuration?.rubric_id,
          evaluationMethod: experiment.configuration?.eval_method || 'prompt-based'
        }),
      });

      const resultData = await response.json();

      if (!response.ok) {
        throw new Error(resultData.error || 'Failed to run item');
      }

      // Align data structure: Merge model outputs and evaluation scores
      const finalResult: Record<string, any> = {
        evaluation_summary: {
          ...resultData.evaluationMetadata,
          modelReasoning: undefined // Remove redundant aggregation
        }
      };

      // 1. Map outputs and status
      if (Array.isArray(resultData.results)) {
        resultData.results.forEach((r: any) => {
          finalResult[r.model] = {
            output: r.message?.content || r.error || '',
            status: r.error ? 'error' : 'success'
          };
        });
      }

      // 2. Map averaged scores to the model keys for quick access
      if (resultData.evaluationMetadata?.meanScores) {
        Object.entries(resultData.evaluationMetadata.meanScores).forEach(([model, score]) => {
          if (finalResult[model]) {
            finalResult[model].score = score;
          }
        });
      }

      // Update item in Supabase
      const { error: updateError } = await supabase
        .from('experiments_items')
        .update({
          status: 2, // 2 for completed
          result: finalResult,
        })
        .eq('id', item.id);

      if (updateError) {
        console.error('Error updating item status:', updateError);
      }
    } catch (error: unknown) {
      console.error(`Error processing item ${item.id}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      await supabase
        .from('experiments_items')
        .update({
          status: 3, // 3 for error
          error_message: errorMessage,
        })
        .eq('id', item.id);
    }
  }, [supabase]);

  const processQueue = useCallback(async () => {
    if (!activeExperimentId || processingRef.current) return;

    processingRef.current = true;
    setIsProcessing(true);

    try {
      // Fetch experiment details once per processQueue run
      const { data: experiment, error: expError } = await supabase
        .from('experiments')
        .select('*')
        .eq('id', activeExperimentId)
        .single();

      if (expError || !experiment) {
        console.error('Experiment not found at start of processQueue:', expError);
        setActiveExperimentId(null);
        return;
      }

      while (activeExperimentId) {
        const items = await claimNextItems(activeExperimentId);

        if (items.length === 0) {
          // Check if there are any items left at all in this experiment
          const { count, error: countError } = await supabase
            .from('experiments_items')
            .select('*', { count: 'exact', head: true })
            .eq('experiment_id', activeExperimentId)
            .eq('status', 0);

          if (countError) {
            console.error('Transient error checking pending count:', countError);
            break; // Stop processing loop but don't mark as complete
          }

          if (count === 0) {
            // Also ensure no items are still stuck in 'running' (status 1) 
            // from this specific worker's perspective or others
            const { count: runningCount } = await supabase
              .from('experiments_items')
              .select('*', { count: 'exact', head: true })
              .eq('experiment_id', activeExperimentId)
              .eq('status', 1);

            if ((runningCount || 0) === 0) {
              // Mark experiment as completed
              await supabase
                .from('experiments')
                .update({ status: 2 })
                .eq('id', activeExperimentId);

              setActiveExperimentId(null);
            }
            break; // Exit loop regardless, if others are processing we'll pick it up later or they will finish it.
          }
          break;
        }

        // Update progress
        const { count: totalCount } = await supabase
          .from('experiments_items')
          .select('*', { count: 'exact', head: true })
          .eq('experiment_id', activeExperimentId);

        const { count: completedCount } = await supabase
          .from('experiments_items')
          .select('*', { count: 'exact', head: true })
          .eq('experiment_id', activeExperimentId)
          .in('status', [2, 3]); // Completed or Error

        setProgress({
          completed: completedCount || 0,
          total: totalCount || 0
        });

        // Process batch concurrently (limit of 3 as per ticket)
        await Promise.all(items.map(item => processItem(item, experiment as Experiment)));
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
        .from('experiments')
        .select('id')
        .eq('status', 1) // 1 for running
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
      }}
    >
      {children}
    </ExperimentsContext.Provider>
  );
}

export function useExperiments() {
  const context = useContext(ExperimentsContext);
  if (context === undefined) {
    throw new Error('useExperiments must be used within an ExperimentsProvider');
  }
  return context;
}
