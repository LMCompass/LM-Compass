import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExperimentItemStatus, ExperimentStatus } from '@/lib/types';
import { BATCH_INSERT_SIZE } from '@/lib/experiments';
import { POST } from '@/app/api/experiments/start/route';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@/utils/supabase/server';
import { estimateExperimentCostLive } from '@/lib/cost';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/cost', () => ({
  estimateExperimentCostLive: vi.fn(),
}));

vi.mock('@/lib/rubrics', () => ({
  loadDefaultRubricText: vi.fn(() => 'Default rubric text'),
}));

type SupabaseState = {
  experimentInsertPayload: Record<string, unknown> | null;
  experimentUpdates: Record<string, unknown>[];
  itemInsertChunks: Array<Record<string, unknown>[]>;
};

function createSupabaseMock() {
  const state: SupabaseState = {
    experimentInsertPayload: null,
    experimentUpdates: [],
    itemInsertChunks: [],
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'experiments') {
        return {
          insert: (payload: Record<string, unknown>) => {
            state.experimentInsertPayload = payload;
            return {
              select: () => ({
                single: async () => ({ data: { id: 'exp-1' }, error: null }),
              }),
            };
          },
          update: (payload: Record<string, unknown>) => {
            state.experimentUpdates.push(payload);
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }

      if (table === 'experiments_items') {
        return {
          insert: async (chunk: Record<string, unknown>[]) => {
            state.itemInsertChunks.push(chunk);
            return { error: null };
          },
        };
      }

      if (table === 'rubrics') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { rubric_content: 'Custom rubric text' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { client, state };
}

function createRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/experiments/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/experiments/start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ userId: 'user-1' } as Awaited<ReturnType<typeof auth>>);
    vi.mocked(estimateExperimentCostLive).mockResolvedValue({ estimatedUsd: 1.25 } as Awaited<
      ReturnType<typeof estimateExperimentCostLive>
    >);
  });

  it('parses dataset rows into queries and queues only valid rows', async () => {
    const { client, state } = createSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await POST(
      createRequest({
        title: 'Dataset parse test',
        rows: [
          { query: '   What is LM Compass?   ', ground_truth: '   A toolkit  ' },
          { query: '   ', ground_truth: 'ignored because query is empty' },
          { query: 42, ground_truth: 'non-string query should be skipped' },
        ],
        selectedModels: [' gpt-4.1 ', 'gpt-4.1', 'claude-3.7'],
        rubricId: 'default',
        evaluationMethod: 'prompt-based',
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.insertedRows).toBe(1);
    expect(payload.skippedRows).toBe(2);

    expect(state.itemInsertChunks).toHaveLength(1);
    expect(state.itemInsertChunks[0]).toHaveLength(1);
    expect(state.itemInsertChunks[0][0]).toMatchObject({
      experiment_id: 'exp-1',
      input_query: 'What is LM Compass?',
      expected_output: 'A toolkit',
      status: ExperimentItemStatus.PENDING,
      result: {},
    });
  });

  it('creates experiment/item records with expected statuses and result defaults', async () => {
    const { client, state } = createSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await POST(
      createRequest({
        title: 'Creation test',
        rows: [
          { query: 'First question', ground_truth: '' },
          { query: 'Second question', ground_truth: 'Expected second answer' },
        ],
        selectedModels: ['gpt-4.1', 'claude-3.7'],
        rubricId: 'default',
        evaluationMethod: 'prompt-based',
      })
    );

    expect(response.status).toBe(200);

    expect(state.experimentInsertPayload).toMatchObject({
      user_id: 'user-1',
      title: 'Creation test',
      status: ExperimentStatus.DRAFT,
    });

    expect(state.itemInsertChunks.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: ExperimentItemStatus.PENDING,
          result: {},
        }),
      ])
    );

    expect(state.experimentUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: ExperimentStatus.RUNNING }),
      ])
    );
  });

  it('batches row insertion for large datasets', async () => {
    const { client, state } = createSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);

    const rows = Array.from({ length: BATCH_INSERT_SIZE + 1 }, (_, index) => ({
      query: `Query ${index + 1}`,
      ground_truth: `Answer ${index + 1}`,
    }));

    const response = await POST(
      createRequest({
        title: 'Batch test',
        rows,
        selectedModels: ['gpt-4.1', 'claude-3.7'],
        rubricId: 'default',
        evaluationMethod: 'prompt-based',
      })
    );

    expect(response.status).toBe(200);
    expect(state.itemInsertChunks).toHaveLength(2);
    expect(state.itemInsertChunks[0]).toHaveLength(BATCH_INSERT_SIZE);
    expect(state.itemInsertChunks[1]).toHaveLength(1);
  });
});
