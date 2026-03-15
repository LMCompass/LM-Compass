export type EstimateProfile = "balanced" | "conservative" | "aggressive";

export type PricingStatus = "live" | "unavailable";

export interface ModelPricing {
  prompt: number;
  completion: number;
  request: number;
  image?: number;
  webSearch?: number;
  internalReasoning?: number;
  inputCacheRead?: number;
  inputCacheWrite?: number;
}

export type ModelPricingMap = Record<string, ModelPricing>;

export interface ModelWorkUnits {
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

export type WorkUnitsByModel = Record<string, ModelWorkUnits>;

export interface CostBreakdownByModel {
  model: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  promptCostUsd: number | null;
  completionCostUsd: number | null;
  requestCostUsd: number | null;
  estimatedUsd: number | null;
}

export interface CostEstimateResult {
  estimatedUsd: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRequests: number;
  totalTokens: number;
  perModel: CostBreakdownByModel[];
  pricingStatus: PricingStatus;
  pricingError?: string;
  profile: EstimateProfile;
}

export interface EstimateWorkloadInput {
  workUnits: WorkUnitsByModel;
  pricingMap: ModelPricingMap;
  profile?: EstimateProfile;
}
