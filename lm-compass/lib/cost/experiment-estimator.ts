import "server-only";

import { estimateWorkloadCost } from "./estimate-engine";
import type { EstimateProfile, WorkUnitsByModel } from "./types";
import { normalizeAndValidateRows } from "../experiments";
import type { ExperimentCostEstimate, ExperimentEvaluationMethod, MappedRow } from "../types";
import { fetchModelPricingMap, PricingClientError } from "../openrouter/pricing-client";

const CHARS_PER_TOKEN = 4;
const BASE_INPUT_RATIO = 0.7;
const BASE_OUTPUT_RATIO = 0.3;

function getPerModelRequestUnits(
  selectedModelCount: number,
  evaluationMethod: ExperimentEvaluationMethod
): number {
  if (evaluationMethod === "n-prompt-based") {
    return 2;
  }

  if (evaluationMethod === "rl4f") {
    return (2 * selectedModelCount) - 1;
  }

  // prompt-based default: each model gets one generation + (n-1) evaluations
  return selectedModelCount;
}

function createBaseEstimate(
  validRows: MappedRow[],
  selectedModelCount: number,
  perModelRequestUnits: number
): {
  avgChars: number;
  estTokensPerPrompt: number;
  totalTokensBase: number;
  totalInputTokensBase: number;
  totalOutputTokensBase: number;
  totalRequestsBase: number;
} {
  const totalChars = validRows.reduce(
    (sum, row) => sum + row.query.length + (row.ground_truth?.length ?? 0),
    0
  );

  const totalRows = validRows.length;
  const avgChars = totalRows > 0 ? totalChars / totalRows : 0;
  const estTokensPerPrompt = avgChars / CHARS_PER_TOKEN;

  const totalTokensBase = estTokensPerPrompt * perModelRequestUnits * selectedModelCount * totalRows;
  const totalInputTokensBase = totalTokensBase * BASE_INPUT_RATIO;
  const totalOutputTokensBase = totalTokensBase * BASE_OUTPUT_RATIO;
  const totalRequestsBase = perModelRequestUnits * selectedModelCount * totalRows;

  return {
    avgChars,
    estTokensPerPrompt,
    totalTokensBase,
    totalInputTokensBase,
    totalOutputTokensBase,
    totalRequestsBase,
  };
}

export type EstimateExperimentCostLiveInput = {
  rows: MappedRow[];
  selectedModels: string[];
  evaluationMethod: ExperimentEvaluationMethod;
  profile?: EstimateProfile;
};

export function buildExperimentWorkUnits(
  validRows: MappedRow[],
  selectedModels: string[],
  evaluationMethod: ExperimentEvaluationMethod
): {
  workUnits: WorkUnitsByModel;
  perModelRequestUnits: number;
  avgChars: number;
  estTokensPerPrompt: number;
} {
  const selectedModelCount = selectedModels.length;
  const perModelRequestUnits = getPerModelRequestUnits(selectedModelCount, evaluationMethod);

  const base = createBaseEstimate(validRows, selectedModelCount, perModelRequestUnits);

  const workUnits: WorkUnitsByModel = {};
  const inputPerModel = base.totalInputTokensBase / Math.max(selectedModelCount, 1);
  const outputPerModel = base.totalOutputTokensBase / Math.max(selectedModelCount, 1);
  const requestsPerModel = base.totalRequestsBase / Math.max(selectedModelCount, 1);

  for (const model of selectedModels) {
    workUnits[model] = {
      inputTokens: inputPerModel,
      outputTokens: outputPerModel,
      requests: requestsPerModel,
    };
  }

  return {
    workUnits,
    perModelRequestUnits,
    avgChars: base.avgChars,
    estTokensPerPrompt: base.estTokensPerPrompt,
  };
}

export async function estimateExperimentCostLive(
  input: EstimateExperimentCostLiveInput
): Promise<ExperimentCostEstimate> {
  const { validRows, skippedRows } = normalizeAndValidateRows(input.rows);
  const selectedModelCount = input.selectedModels.length;
  const profile = input.profile ?? "balanced";
  const perModelRequestUnits = getPerModelRequestUnits(selectedModelCount, input.evaluationMethod);

  const base = createBaseEstimate(
    validRows,
    selectedModelCount,
    perModelRequestUnits
  );

  if (validRows.length === 0 || selectedModelCount === 0) {
    return {
      avgChars: base.avgChars,
      estTokensPerPrompt: base.estTokensPerPrompt,
      multiplier: perModelRequestUnits,
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalRequests: 0,
      estimatedUsd: 0,
      perModelEstimates: [],
      validRows: validRows.length,
      skippedRows,
      pricingStatus: "unavailable",
      pricingError: "No valid rows or models were provided for estimation.",
      profile,
    };
  }

  const { workUnits } = buildExperimentWorkUnits(
    validRows,
    input.selectedModels,
    input.evaluationMethod
  );

  try {
    const pricingMap = await fetchModelPricingMap();
    const cost = estimateWorkloadCost({
      workUnits,
      pricingMap,
      profile,
    });

    return {
      avgChars: base.avgChars,
      estTokensPerPrompt: base.estTokensPerPrompt,
      multiplier: perModelRequestUnits,
      totalTokens: cost.totalTokens,
      totalInputTokens: cost.totalInputTokens,
      totalOutputTokens: cost.totalOutputTokens,
      totalRequests: cost.totalRequests,
      estimatedUsd: cost.estimatedUsd,
      perModelEstimates: cost.perModel,
      validRows: validRows.length,
      skippedRows,
      pricingStatus: cost.pricingStatus,
      pricingError: cost.pricingError,
      profile: cost.profile,
    };
  } catch (error) {
    const pricingError =
      error instanceof PricingClientError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to fetch model pricing from OpenRouter.";
    const fallbackCost = estimateWorkloadCost({
      workUnits,
      pricingMap: {},
      profile,
    });

    return {
      avgChars: base.avgChars,
      estTokensPerPrompt: base.estTokensPerPrompt,
      multiplier: perModelRequestUnits,
      totalTokens: fallbackCost.totalTokens,
      totalInputTokens: fallbackCost.totalInputTokens,
      totalOutputTokens: fallbackCost.totalOutputTokens,
      totalRequests: fallbackCost.totalRequests,
      estimatedUsd: null,
      perModelEstimates: fallbackCost.perModel,
      validRows: validRows.length,
      skippedRows,
      pricingStatus: "unavailable",
      pricingError,
      profile,
    };
  }
}
