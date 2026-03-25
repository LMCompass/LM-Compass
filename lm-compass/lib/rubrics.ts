import { readFileSync } from "fs";
import { join } from "path";

export type RubricMode = "weight-adjusted-default" | "custom";

export type RubricCategory = {
  key: string;
  description: string;
  defaultPoints: number;
};

export type RubricEvaluationMethod =
  | "prompt-based"
  | "rl4f"
  | "hitl";

const DEFAULT_RUBRIC_PATHS = [
  join(process.cwd(), "app", "(app)", "rubric", "types", "default.txt"),
  join(process.cwd(), "app", "rubric", "types", "default.txt"),
];

export function loadDefaultRubricText(): string {
  for (const path of DEFAULT_RUBRIC_PATHS) {
    try {
      return readFileSync(path, "utf-8");
    } catch {
      // Try next candidate
    }
  }
  throw new Error(
    `Default rubric not found at any of: ${DEFAULT_RUBRIC_PATHS.join(", ")}`
  );
}

const DEFAULT_LINE_REGEX =
  /^(.+?)\s*\((\d+)\s*points\)\s*[—-]\s*(.+)$/;

export function parseDefaultRubric(text: string): RubricCategory[] {
  const lines = text.split(/\r?\n/);
  const categories: RubricCategory[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(DEFAULT_LINE_REGEX);
    if (!match) {
      continue;
    }

    const key = match[1].trim();
    const points = Number.parseInt(match[2], 10);
    const description = match[3].trim();

    if (!key || Number.isNaN(points) || !description) continue;

    categories.push({
      key,
      description,
      defaultPoints: points,
    });
  }

  return categories;
}

export function buildRubricFromWeights(
  categories: RubricCategory[],
  weights: Record<string, number>,
  overrides?: {
    labels?: Record<string, string>;
    descriptions?: Record<string, string>;
  }
): string {
  const lines: string[] = [];

  categories.forEach((category, index) => {
    const points =
      typeof weights[category.key] === "number"
        ? weights[category.key]
        : category.defaultPoints;

    const label = overrides?.labels?.[category.key] || category.key;
    const description = overrides?.descriptions?.[category.key] || category.description;

    lines.push(
      `${label} (${points} points) — ${description}`
    );

    if (index < categories.length - 1) {
      lines.push("");
    }
  });

  return lines.join("\n");
}

