import type { ModelPricing, ModelPricingMap } from "../cost/types";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_TIMEOUT_MS = 10_000;

export type PricingClientErrorCode = "pricing_unavailable" | "invalid_pricing";

export class PricingClientError extends Error {
  readonly code: PricingClientErrorCode;

  constructor(code: PricingClientErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type RawModelsResponse = {
  data?: unknown;
};

type RawModel = {
  id?: unknown;
  pricing?: unknown;
};

type RawPricing = Record<string, unknown>;

function parseUsdValue(modelId: string, field: string, value: unknown, required: boolean): number | undefined {
  if (value == null) {
    if (required) {
      throw new PricingClientError(
        "invalid_pricing",
        `Model ${modelId} is missing required pricing field '${field}'.`
      );
    }
    return undefined;
  }

  let numeric: number;
  if (typeof value === "string") {
    numeric = Number.parseFloat(value);
  } else if (typeof value === "number") {
    numeric = value;
  } else {
    throw new PricingClientError(
      "invalid_pricing",
      `Model ${modelId} has non-numeric pricing field '${field}'.`
    );
  }

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new PricingClientError(
      "invalid_pricing",
      `Model ${modelId} has invalid pricing value for '${field}'.`
    );
  }

  return numeric;
}

function parseModelPricing(model: RawModel): { modelId: string; pricing: ModelPricing } {
  const modelId = typeof model.id === "string" && model.id.trim().length > 0
    ? model.id.trim()
    : null;

  if (!modelId) {
    throw new PricingClientError("invalid_pricing", "Model entry is missing a valid id.");
  }

  if (!model.pricing || typeof model.pricing !== "object" || Array.isArray(model.pricing)) {
    throw new PricingClientError("invalid_pricing", `Model ${modelId} is missing a pricing object.`);
  }

  const rawPricing = model.pricing as RawPricing;

  const pricing: ModelPricing = {
    prompt: parseUsdValue(modelId, "prompt", rawPricing.prompt, true)!,
    completion: parseUsdValue(modelId, "completion", rawPricing.completion, true)!,
    request: parseUsdValue(modelId, "request", rawPricing.request, false) ?? 0,
  };

  const image = parseUsdValue(modelId, "image", rawPricing.image, false);
  const webSearch = parseUsdValue(modelId, "web_search", rawPricing.web_search, false);
  const internalReasoning = parseUsdValue(
    modelId,
    "internal_reasoning",
    rawPricing.internal_reasoning,
    false
  );
  const inputCacheRead = parseUsdValue(
    modelId,
    "input_cache_read",
    rawPricing.input_cache_read,
    false
  );
  const inputCacheWrite = parseUsdValue(
    modelId,
    "input_cache_write",
    rawPricing.input_cache_write,
    false
  );

  if (image != null) {
    pricing.image = image;
  }
  if (webSearch != null) {
    pricing.webSearch = webSearch;
  }
  if (internalReasoning != null) {
    pricing.internalReasoning = internalReasoning;
  }
  if (inputCacheRead != null) {
    pricing.inputCacheRead = inputCacheRead;
  }
  if (inputCacheWrite != null) {
    pricing.inputCacheWrite = inputCacheWrite;
  }

  return { modelId, pricing };
}

export async function fetchModelPricingMap(): Promise<ModelPricingMap> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_MODELS_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
    });
  } catch (error) {
    throw new PricingClientError(
      "pricing_unavailable",
      error instanceof Error
        ? `Failed to fetch OpenRouter model pricing: ${error.message}`
        : "Failed to fetch OpenRouter model pricing."
    );
  }

  if (!response.ok) {
    throw new PricingClientError(
      "pricing_unavailable",
      `OpenRouter pricing request failed with status ${response.status}.`
    );
  }

  let body: RawModelsResponse;
  try {
    body = (await response.json()) as RawModelsResponse;
  } catch {
    throw new PricingClientError("invalid_pricing", "OpenRouter pricing response was not valid JSON.");
  }

  if (!Array.isArray(body.data)) {
    throw new PricingClientError("invalid_pricing", "OpenRouter pricing response did not include a data array.");
  }

  const pricingMap: ModelPricingMap = {};

  for (const entry of body.data) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    try {
      const parsed = parseModelPricing(entry as RawModel);
      pricingMap[parsed.modelId] = parsed.pricing;
    } catch (error) {
      if (error instanceof PricingClientError && error.code === "invalid_pricing") {
        // Ignore malformed model entries so one bad row in OpenRouter's catalog
        // does not break pricing for all valid models.
        continue;
      }
      throw error;
    }
  }

  if (Object.keys(pricingMap).length === 0) {
    throw new PricingClientError(
      "invalid_pricing",
      "OpenRouter pricing response did not include any valid model pricing entries."
    );
  }

  return pricingMap;
}
