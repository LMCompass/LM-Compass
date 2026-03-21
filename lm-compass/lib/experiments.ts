import type { ExperimentEvaluationMethod, MappedRow } from "./types";

export const MIN_EXPERIMENT_MODELS = 2;
export const MAX_EXPERIMENT_MODELS = 4;
export const MIN_EXPERIMENT_ITERATIONS = 1;
export const MAX_EXPERIMENT_ITERATIONS = 4;
export const DEFAULT_EXPERIMENT_ITERATIONS = 1;
export const DEFAULT_EVAL_METHOD: ExperimentEvaluationMethod = "prompt-based";
export const DEFAULT_RUBRIC_ID = "default";
export const ALLOWED_EXPERIMENT_EVAL_METHODS: readonly ExperimentEvaluationMethod[] = [
  "prompt-based",
  "n-prompt-based",
  "rl4f",
];
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

export function normalizeExperimentIterations(value: unknown): number | null {
  if (value == null || value === "") {
    return DEFAULT_EXPERIMENT_ITERATIONS;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  if (
    value < MIN_EXPERIMENT_ITERATIONS ||
    value > MAX_EXPERIMENT_ITERATIONS
  ) {
    return null;
  }

  return value;
}

export function resolveExperimentIterations(
  evaluationMethod: ExperimentEvaluationMethod,
  value: unknown
): { iterations: number; isValidForMethod: boolean } {
  if (evaluationMethod !== "rl4f") {
    return {
      iterations: DEFAULT_EXPERIMENT_ITERATIONS,
      isValidForMethod: true,
    };
  }

  const normalizedIterations = normalizeExperimentIterations(value);
  if (normalizedIterations == null) {
    return {
      iterations: DEFAULT_EXPERIMENT_ITERATIONS,
      isValidForMethod: false,
    };
  }

  return {
    iterations: normalizedIterations,
    isValidForMethod: true,
  };
}
