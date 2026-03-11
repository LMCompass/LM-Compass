import type {
  ExperimentCostEstimate,
  ExperimentEvaluationMethod,
  MappedRow,
} from "@/lib/types";

export const MIN_EXPERIMENT_MODELS = 2;
export const MAX_EXPERIMENT_MODELS = 4;
export const DEFAULT_EVAL_METHOD: ExperimentEvaluationMethod = "prompt-based";
export const DEFAULT_RUBRIC_ID = "default";
export const ALLOWED_EXPERIMENT_EVAL_METHODS: readonly ExperimentEvaluationMethod[] = [
  "prompt-based",
  "n-prompt-based",
  "rl4f",
];
export const PRICE_PER_TOKEN_USD = 5 / 1_000_000;
export const BATCH_INSERT_SIZE = 500;

export function normalizeAndValidateRows(rows: MappedRow[]) {
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

export function calculateExperimentEstimate(
  validRows: MappedRow[],
  skippedRows: number,
  selectedModelCount: number
): ExperimentCostEstimate {
  const totalChars = validRows.reduce(
    (sum, row) => sum + row.query.length + (row.ground_truth?.length ?? 0),
    0
  );
  const avgChars = validRows.length > 0 ? totalChars / validRows.length : 0;
  const estTokensPerPrompt = avgChars / 4;
  const multiplier = selectedModelCount + 1;
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

export function isExperimentEvaluationMethod(
  value: unknown
): value is ExperimentEvaluationMethod {
  return (
    typeof value === "string" &&
    (ALLOWED_EXPERIMENT_EVAL_METHODS as readonly string[]).includes(value)
  );
}

export function normalizeSelectedModels(models: unknown): string[] {
  if (!Array.isArray(models)) {
    return [];
  }

  const normalized = models
    .map((model) => (typeof model === "string" ? model.trim() : ""))
    .filter((model): model is string => model.length > 0);

  return Array.from(new Set(normalized));
}

export function validateSelectedModelsCount(models: string[]): boolean {
  return (
    models.length >= MIN_EXPERIMENT_MODELS &&
    models.length <= MAX_EXPERIMENT_MODELS
  );
}
