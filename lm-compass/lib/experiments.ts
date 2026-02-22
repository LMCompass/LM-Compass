import type { ExperimentCostEstimate, MappedRow } from '@/lib/types';

export const DEFAULT_SELECTED_MODELS = ['openai/gpt-5-nano', 'google/gemini-2.5-flash-lite'];
export const DEFAULT_EVAL_METHOD = 'prompt-based';
export const DEFAULT_RUBRIC_ID = '';
export const PRICE_PER_TOKEN_USD = 5 / 1_000_000;
export const BATCH_INSERT_SIZE = 500;
export const MAX_FIELD_LENGTH = 10_000;

export function normalizeAndValidateRows(rows: MappedRow[]) {
  const normalizedRows = rows.map((row) => {
    const query = (row.query ?? '').trim();
    const groundTruth = (row.ground_truth ?? '').trim();

    return {
      query,
      ground_truth: groundTruth.length > 0 ? groundTruth : undefined,
    };
  });

  const validRows = normalizedRows.filter(
    (row) =>
      row.query.length > 0 &&
      row.query.length <= MAX_FIELD_LENGTH &&
      (row.ground_truth === undefined || row.ground_truth.length <= MAX_FIELD_LENGTH)
  );
  const skippedRows = rows.length - validRows.length;

  return { validRows, skippedRows };
}

export function calculateExperimentEstimate(
  validRows: MappedRow[],
  skippedRows: number
): ExperimentCostEstimate {
  const totalChars = validRows.reduce(
    (sum, row) => sum + row.query.length + (row.ground_truth?.length ?? 0),
    0
  );
  const avgChars = validRows.length > 0 ? totalChars / validRows.length : 0;
  const estTokensPerPrompt = avgChars / 4;
  const multiplier = DEFAULT_SELECTED_MODELS.length + 1;
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
