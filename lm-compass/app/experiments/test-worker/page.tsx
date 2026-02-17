'use client';

import { useExperiments } from '@/contexts/experiments-context';
import { Button } from '@/components/ui/button';
import { useSupabaseClient } from '@/utils/supabase/client';
import { useState } from 'react';
import { useUser } from '@clerk/nextjs';

export default function TestWorkerPage() {
  const { activeExperimentId, setActiveExperimentId, isProcessing, progress } = useExperiments();
  const supabase = useSupabaseClient();
  const { user } = useUser();
  const [isCreating, setIsCreating] = useState(false);

  const createTestExperiment = async () => {
    if (!user) {
      alert('Please log in first');
      return;
    }

    setIsCreating(true);
    try {
      // 1. Create experiment
      const { data: experiment, error: expError } = await supabase
        .from('experiments')
        .insert({
          user_id: user.id,
          title: 'Automated Test Experiment',
          status: 1, // running
          created_at: new Date().toISOString(),
          configuration: {
            selected_models: ['gpt-3.5-turbo', 'gpt-4o'], // Mock models
            rubric_id: 'default',
            eval_method: 'prompt-based'
          }
        })
        .select()
        .single();

      if (expError) throw expError;

      // 2. Add some items (10 records)
      const testItems = Array.from({ length: 10 }, (_, i) => ({
        experiment_id: experiment.id,
        input_query: `Test Query #${i + 1}: What is ${i} + ${i}?`,
        expected_output: `${i + i}`,
        status: 0,
        result: {}
      }));

      const { error: itemsError } = await supabase
        .from('experiments_items')
        .insert(testItems);

      if (itemsError) throw itemsError;

      // 3. Set active experiment to trigger worker
      setActiveExperimentId(experiment.id);
      alert(`Experiment ${experiment.id} created and started!`);
    } catch (error: unknown) {
      console.error('Error creating test experiment:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      alert(`Error: ${errorMessage}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Experiments Worker Test</h1>

      <div className="space-y-2">
        <p><strong>Active Experiment ID:</strong> {activeExperimentId || 'None'}</p>
        <p><strong>Is Processing:</strong> {isProcessing ? 'Yes' : 'No'}</p>
        <p><strong>Progress:</strong> {progress.completed} / {progress.total}</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <Button
          onClick={createTestExperiment}
          disabled={isCreating || !!activeExperimentId}
        >
          {isCreating ? 'Creating...' : 'Create & Run Real Test Exp'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setActiveExperimentId('manual-test-id')}
          disabled={!!activeExperimentId}
        >
          Mock Set ID (Manual)
        </Button>
        <Button
          variant="outline"
          onClick={() => setActiveExperimentId(null)}
        >
          Clear Active ID
        </Button>
      </div>

      <div className="mt-8 p-4 bg-muted rounded-md text-sm">
        <p><strong>How to test:</strong></p>
        <ol className="list-decimal ml-5 mt-2 space-y-1">
          <li>Click <strong>&quot;Create &amp; Run Real Test Exp&quot;</strong>. This will insert a real experiment and 2 rows into your Supabase DB.</li>
          <li>The worker in <code>ExperimentsContext</code> will detect the active ID and start processing.</li>
          <li>Open <strong>Network tab</strong> to see requests to <code>/api/experiments/run-item</code>.</li>
          <li>Navigate to another page and back; the progress should persist.</li>
        </ol>
      </div>
    </div>
  );
}
