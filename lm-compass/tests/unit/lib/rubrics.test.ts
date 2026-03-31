import { describe, expect, it } from "vitest";

import {
  buildRubricFromWeights,
  loadDefaultRubricText,
  parseDefaultRubric,
  type RubricCategory,
} from "@/lib/rubrics";

describe("parseDefaultRubric", () => {
  it("parses valid rubric lines and ignores malformed lines", () => {
    const input = [
      "Accuracy (5 points) — Checks factual correctness",
      "Malformed line",
      "Clarity (3 points) - Easy to follow",
      "",
      "Coverage (x points) — Invalid points",
    ].join("\n");

    expect(parseDefaultRubric(input)).toEqual([
      {
        key: "Accuracy",
        description: "Checks factual correctness",
        defaultPoints: 5,
      },
      {
        key: "Clarity",
        description: "Easy to follow",
        defaultPoints: 3,
      },
    ]);
  });
});

describe("buildRubricFromWeights", () => {
  const categories: RubricCategory[] = [
    { key: "Accuracy", description: "Checks factual correctness", defaultPoints: 5 },
    { key: "Clarity", description: "Easy to follow", defaultPoints: 3 },
  ];

  it("uses provided weights and falls back to defaults", () => {
    const output = buildRubricFromWeights(categories, { Accuracy: 7 });

    expect(output).toBe(
      [
        "Accuracy (7 points) — Checks factual correctness",
        "",
        "Clarity (3 points) — Easy to follow",
      ].join("\n")
    );
  });
});

describe("loadDefaultRubricText", () => {
  it("loads the default rubric text from configured project paths", () => {
    const text = loadDefaultRubricText();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("points");
  });
});
