import type {
  CostBreakdownByModel,
  CostEstimateResult,
  EstimateProfile,
  EstimateWorkloadInput,
} from "./types";

const PROFILE_MULTIPLIERS: Record<EstimateProfile, { input: number; output: number; requests: number }> = {
  balanced: { input: 1, output: 1, requests: 1 },
  conservative: { input: 1.2, output: 1.35, requests: 1 },
  aggressive: { input: 0.85, output: 0.75, requests: 1 },
};

function roundMetric(value: number, decimals = 6): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number.parseFloat(value.toFixed(decimals));
}

export function estimateWorkloadCost(input: EstimateWorkloadInput): CostEstimateResult {
  const profile = input.profile ?? "balanced";
  const multipliers = PROFILE_MULTIPLIERS[profile];

  const perModel: CostBreakdownByModel[] = [];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalRequests = 0;
  let totalUsd = 0;

  const missingPricingModels: string[] = [];

  for (const [model, units] of Object.entries(input.workUnits)) {
    const normalizedInputTokens = Math.max(0, units.inputTokens) * multipliers.input;
    const normalizedOutputTokens = Math.max(0, units.outputTokens) * multipliers.output;
    const normalizedRequests = Math.max(0, units.requests) * multipliers.requests;

    totalInputTokens += normalizedInputTokens;
    totalOutputTokens += normalizedOutputTokens;
    totalRequests += normalizedRequests;

    const pricing = input.pricingMap[model];

    if (!pricing) {
      missingPricingModels.push(model);
      perModel.push({
        model,
        inputTokens: roundMetric(normalizedInputTokens),
        outputTokens: roundMetric(normalizedOutputTokens),
        requests: roundMetric(normalizedRequests),
        promptCostUsd: null,
        completionCostUsd: null,
        requestCostUsd: null,
        estimatedUsd: null,
      });
      continue;
    }

    const promptCostUsd = normalizedInputTokens * pricing.prompt;
    const completionCostUsd = normalizedOutputTokens * pricing.completion;
    const requestCostUsd = normalizedRequests * pricing.request;
    const estimatedUsd = promptCostUsd + completionCostUsd + requestCostUsd;

    totalUsd += estimatedUsd;

    perModel.push({
      model,
      inputTokens: roundMetric(normalizedInputTokens),
      outputTokens: roundMetric(normalizedOutputTokens),
      requests: roundMetric(normalizedRequests),
      promptCostUsd: roundMetric(promptCostUsd, 10),
      completionCostUsd: roundMetric(completionCostUsd, 10),
      requestCostUsd: roundMetric(requestCostUsd, 10),
      estimatedUsd: roundMetric(estimatedUsd, 10),
    });
  }

  const pricingStatus = missingPricingModels.length > 0 ? "unavailable" : "live";

  return {
    estimatedUsd: pricingStatus === "live" ? roundMetric(totalUsd, 10) : null,
    totalInputTokens: roundMetric(totalInputTokens),
    totalOutputTokens: roundMetric(totalOutputTokens),
    totalRequests: roundMetric(totalRequests),
    totalTokens: roundMetric(totalInputTokens + totalOutputTokens),
    perModel,
    pricingStatus,
    pricingError:
      missingPricingModels.length > 0
        ? `Missing pricing for model(s): ${missingPricingModels.join(", ")}.`
        : undefined,
    profile,
  };
}
