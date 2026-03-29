import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { ExperimentsProvider, useExperiments } from './experiments-context';
import { ExperimentItemStatus, ExperimentStatus, type Experiment } from '@/lib/types';
import { useSupabaseClient } from '@/utils/supabase/client';

vi.mock('@/utils/supabase/client', () => ({
  useSupabaseClient: vi.fn(),
}));

type QueryResult = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

class SelectBuilder {
  private filters: Array<{ field: string; value: unknown }> = [];

  constructor(
    private readonly table: string,
    private readonly columns: string,
    private readonly options: Record<string, unknown> | undefined,
    private readonly context: {
      candidateSelectCalls: number;
      countsQueue: QueryResult[];
      activeExperimentId: string;
      activeExperiment: Experiment;
    }
  ) {}

  eq(field: string, value: unknown) {
    this.filters.push({ field, value });
    return this;
  }

  in(field: string, value: unknown) {
    this.filters.push({ field, value });
    return this;
  }

  limit(value: number) {
    void value;
    return this;
  }

  single() {
    if (this.table === 'experiments' && this.columns === 'id') {
      return Promise.resolve({ data: null, error: { message: 'no rows' } });
    }

    if (this.table === 'experiments' && this.columns === '*') {
      return Promise.resolve({ data: this.context.activeExperiment, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  }

  private execute(): QueryResult {
    if (this.table === 'experiments_items' && this.columns === 'id') {
      this.context.candidateSelectCalls += 1;
      if (this.context.candidateSelectCalls === 1) {
        return {
          data: [{ id: 'item-1' }, { id: 'item-2' }],
          error: null,
        };
      }

      return {
        data: [],
        error: null,
      };
    }

    if (this.table === 'experiments_items' && this.options?.head === true) {
      return this.context.countsQueue.shift() ?? { count: 0, error: null };
    }

    return { data: [], error: null };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

function createSupabaseMock() {
  const itemUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const experimentUpdates: Record<string, unknown>[] = [];

  const context = {
    candidateSelectCalls: 0,
    countsQueue: [
      { count: 2, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
    ] as QueryResult[],
    activeExperimentId: 'exp-1',
    activeExperiment: {
      id: 'exp-1',
      user_id: 'user-1',
      title: 'Experiment 1',
      status: ExperimentStatus.RUNNING,
      created_at: new Date().toISOString(),
      start_time: new Date().toISOString(),
      end_time: null,
      configuration: {
        selected_models: ['model-a', 'model-b'],
        rubric_id: 'default',
        rubric_content: 'Rubric',
        eval_method: 'prompt-based',
      },
    } as Experiment,
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'experiments') {
        return {
          select: (columns: string, options?: Record<string, unknown>) =>
            new SelectBuilder(table, columns, options, context),
          update: (payload: Record<string, unknown>) => {
            experimentUpdates.push(payload);
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }

      if (table === 'experiments_items') {
        return {
          select: (columns: string, options?: Record<string, unknown>) =>
            new SelectBuilder(table, columns, options, context),
          update: (payload: Record<string, unknown>) => ({
            in: () => ({
              eq: () => ({
                select: async () => ({
                  data: [
                    {
                      id: 'item-1',
                      input_query: 'first query',
                      expected_output: null,
                    },
                    {
                      id: 'item-2',
                      input_query: 'second query',
                      expected_output: null,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
            eq: async (_field: string, id: string) => {
              itemUpdates.push({ id, payload });
              return { error: null };
            },
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { supabase, itemUpdates, experimentUpdates };
}

describe('ExperimentsProvider queue processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('continues processing remaining queued items when one item fails', async () => {
    const { supabase, itemUpdates, experimentUpdates } = createSupabaseMock();
    vi.mocked(useSupabaseClient).mockReturnValue(supabase as unknown as ReturnType<typeof useSupabaseClient>);

    const fetchMock = vi.spyOn(global, 'fetch');
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { model: 'model-a', message: { content: 'answer A' }, latencyMs: 12 },
            { model: 'model-b', message: { content: 'answer B' }, latencyMs: 14 },
          ],
          evaluationMetadata: {
            meanScores: { 'model-a': 90, 'model-b': 85 },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Model request timed out' }),
      } as Response);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ExperimentsProvider>{children}</ExperimentsProvider>
    );

    const { result } = renderHook(() => useExperiments(), { wrapper });

    act(() => {
      result.current.setActiveExperimentId('exp-1');
    });

    await waitFor(() => {
      expect((global.fetch as Mock)).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(itemUpdates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'item-1',
            payload: expect.objectContaining({ status: ExperimentItemStatus.COMPLETED }),
          }),
          expect.objectContaining({
            id: 'item-2',
            payload: expect.objectContaining({
              status: ExperimentItemStatus.ERROR,
              error_message: 'Model request timed out',
            }),
          }),
        ])
      );
    });

    await waitFor(() => {
      expect(experimentUpdates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: ExperimentStatus.COMPLETED,
          }),
        ])
      );
      expect(result.current.activeExperimentId).toBeNull();
    });
  });
});
