import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXPERIMENT_ITERATIONS,
  MAX_EXPERIMENT_ITERATIONS,
  MAX_EXPERIMENT_MODELS,
  MIN_EXPERIMENT_ITERATIONS,
  MIN_EXPERIMENT_MODELS,
  isExperimentEvaluationMethod,
  normalizeAndValidateRows,
  normalizeExperimentIterations,
  normalizeSelectedModels,
  resolveExperimentIterations,
  validateSelectedModelsCount,
} from "./experiments";

describe("normalizeAndValidateRows", () => {
  it("trims fields, drops empty queries, and counts skipped rows", () => {
    const { validRows, skippedRows } = normalizeAndValidateRows([
      { query: "  What is LM Compass?  ", ground_truth: "  A toolkit  " },
      { query: "   ", ground_truth: "kept but query is invalid" },
      { query: "\nSecond question\t", ground_truth: "   " },
    ]);

    expect(validRows).toEqual([
      { query: "What is LM Compass?", ground_truth: "A toolkit" },
      { query: "Second question", ground_truth: undefined },
    ]);
    expect(skippedRows).toBe(1);
  });
});

describe("isExperimentEvaluationMethod", () => {
  it("accepts allowed method values", () => {
    expect(isExperimentEvaluationMethod("prompt-based")).toBe(true);
    expect(isExperimentEvaluationMethod("n-prompt-based")).toBe(true);
    expect(isExperimentEvaluationMethod("rl4f")).toBe(true);
  });

  it("rejects invalid or non-string values", () => {
    expect(isExperimentEvaluationMethod("hitl")).toBe(false);
    expect(isExperimentEvaluationMethod("")).toBe(false);
    expect(isExperimentEvaluationMethod(42)).toBe(false);
    expect(isExperimentEvaluationMethod(null)).toBe(false);
  });
});

describe("normalizeSelectedModels", () => {
  it("returns normalized, deduplicated model ids", () => {
    expect(
      normalizeSelectedModels([
        " gpt-4.1 ",
        "gpt-4.1",
        "",
        "claude-3.7",
        "  claude-3.7 ",
      ])
    ).toEqual(["gpt-4.1", "claude-3.7"]);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizeSelectedModels("gpt-4.1")).toEqual([]);
    expect(normalizeSelectedModels(null)).toEqual([]);
  });
});

describe("validateSelectedModelsCount", () => {
  it("enforces inclusive min/max model bounds", () => {
    expect(validateSelectedModelsCount(Array(MIN_EXPERIMENT_MODELS).fill("m"))).toBe(true);
    expect(validateSelectedModelsCount(Array(MAX_EXPERIMENT_MODELS).fill("m"))).toBe(true);
    expect(validateSelectedModelsCount(Array(MIN_EXPERIMENT_MODELS - 1).fill("m"))).toBe(false);
    expect(validateSelectedModelsCount(Array(MAX_EXPERIMENT_MODELS + 1).fill("m"))).toBe(false);
  });
});

describe("normalizeExperimentIterations", () => {
  it("defaults nullish and empty input", () => {
    expect(normalizeExperimentIterations(null)).toBe(DEFAULT_EXPERIMENT_ITERATIONS);
    expect(normalizeExperimentIterations(undefined)).toBe(DEFAULT_EXPERIMENT_ITERATIONS);
    expect(normalizeExperimentIterations("")).toBe(DEFAULT_EXPERIMENT_ITERATIONS);
  });

  it("accepts integer values within allowed range", () => {
    expect(normalizeExperimentIterations(MIN_EXPERIMENT_ITERATIONS)).toBe(MIN_EXPERIMENT_ITERATIONS);
    expect(normalizeExperimentIterations(MAX_EXPERIMENT_ITERATIONS)).toBe(MAX_EXPERIMENT_ITERATIONS);
  });

  it("rejects non-integer, non-number, and out-of-range values", () => {
    expect(normalizeExperimentIterations(2.5)).toBeNull();
    expect(normalizeExperimentIterations("2")).toBeNull();
    expect(normalizeExperimentIterations(MIN_EXPERIMENT_ITERATIONS - 1)).toBeNull();
    expect(normalizeExperimentIterations(MAX_EXPERIMENT_ITERATIONS + 1)).toBeNull();
  });
});

describe("resolveExperimentIterations", () => {
  it("forces default iterations for non-rl4f methods", () => {
    expect(resolveExperimentIterations("prompt-based", 4)).toEqual({
      iterations: DEFAULT_EXPERIMENT_ITERATIONS,
      isValidForMethod: true,
    });

    expect(resolveExperimentIterations("n-prompt-based", null)).toEqual({
      iterations: DEFAULT_EXPERIMENT_ITERATIONS,
      isValidForMethod: true,
    });
  });

  it("validates iteration value for rl4f", () => {
    expect(resolveExperimentIterations("rl4f", 3)).toEqual({
      iterations: 3,
      isValidForMethod: true,
    });

    expect(resolveExperimentIterations("rl4f", 999)).toEqual({
      iterations: DEFAULT_EXPERIMENT_ITERATIONS,
      isValidForMethod: false,
    });
  });
});
