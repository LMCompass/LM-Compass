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

  const fetchNextItems = useCallback(async (experimentId: string) => {
    const { data, error } = await supabase
      .from('experiments_items')
      .select('*')
      .eq('experiment_id', experimentId)
      .eq('status', 0) // 0 for pending
      .limit(3);

    if (error) {
      console.error('Error fetching pending items:', error);
      return [];
    }
    return data as ExperimentItem[];
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

      // Update item in Supabase
      const { error: updateError } = await supabase
        .from('experiments_items')
        .update({
          status: 2, // 2 for completed
          result: resultData.evaluationMetadata, // Store the evaluation result
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
        const items = await fetchNextItems(activeExperimentId);

        if (items.length === 0) {
          // Check if there are any items left at all in this experiment
          const { count, error } = await supabase
            .from('experiments_items')
            .select('*', { count: 'exact', head: true })
            .eq('experiment_id', activeExperimentId)
            .eq('status', 0);

          if (error || count === 0) {
            // Done!
            await supabase
              .from('experiments')
              .update({ status: 2 }) // 2 for completed
              .eq('id', activeExperimentId);

            setActiveExperimentId(null);
            break;
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
  }, [activeExperimentId, fetchNextItems, processItem, supabase]);

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
