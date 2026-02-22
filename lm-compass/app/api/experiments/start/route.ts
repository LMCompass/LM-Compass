import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ExperimentItemStatus, ExperimentStatus, type MappedRow, type StartExperimentResult } from '@/lib/types';
import {
  BATCH_INSERT_SIZE,
  DEFAULT_EVAL_METHOD,
  DEFAULT_RUBRIC_ID,
  DEFAULT_SELECTED_MODELS,
  calculateExperimentEstimate,
  normalizeAndValidateRows,
} from '@/lib/experiments';

type StartExperimentRequest = {
  title?: string;
  rows?: unknown;
};

function toMappedRows(rows: unknown): MappedRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => {
    const rowObj = row as Record<string, unknown>;
    return {
      query: typeof rowObj.query === 'string' ? rowObj.query : '',
      ground_truth: typeof rowObj.ground_truth === 'string' ? rowObj.ground_truth : undefined,
    };
  });
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let payload: StartExperimentRequest;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const mappedRows = toMappedRows(payload.rows);
    const { validRows, skippedRows } = normalizeAndValidateRows(mappedRows);

    if (validRows.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows found. Please ensure at least one query is non-empty.' },
        { status: 400 }
      );
    }

    const estimate = calculateExperimentEstimate(validRows, skippedRows);
    const experimentTitle =
      payload.title?.trim() || `Experiment ${new Date().toLocaleString()}`;

    const supabase = await createClient();
    const { data: experiment, error: createExperimentError } = await supabase
      .from('experiments')
      .insert({
        user_id: userId,
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
      return NextResponse.json(
        { error: createExperimentError?.message || 'Failed to create experiment.' },
        { status: 500 }
      );
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
      console.error('Error inserting experiment items, cleaning up:', error);

      const { error: cleanupError } = await supabase
        .from('experiments_items')
        .delete()
        .eq('experiment_id', experiment.id);

      if (cleanupError) {
        console.error('Failed to clean up experiment items after error:', cleanupError);
      }

      await supabase
        .from('experiments')
        .update({ status: ExperimentStatus.ERROR })
        .eq('id', experiment.id);

      const message =
        error instanceof Error ? error.message : 'Failed while inserting experiment rows.';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const { error: updateStatusError } = await supabase
      .from('experiments')
      .update({ status: ExperimentStatus.RUNNING })
      .eq('id', experiment.id);

    if (updateStatusError) {
      return NextResponse.json(
        {
          error: `Experiment saved as draft, but failed to start: ${updateStatusError.message}`,
        },
        { status: 500 }
      );
    }

    const result: StartExperimentResult = {
      experimentId: experiment.id,
      insertedRows: validRows.length,
      skippedRows,
      status: ExperimentStatus.RUNNING,
      estimatedUsd: estimate.estimatedUsd,
    };

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error starting experiment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start experiment.' },
      { status: 500 }
    );
  }
}
