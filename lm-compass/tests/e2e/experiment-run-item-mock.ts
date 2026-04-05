/**
 * JSON bodies for mocking POST /api/experiments/run-item in Playwright tests.
 * Shapes match app/api/experiments/run-item and lib/evaluation/types.
 */

export type MockEvaluationScore = {
  judgeModel: string;
  evaluatedModel: string;
  score: number | null;
  reasoning: string | null;
};

export type MockRunItemBody = {
  success: true;
  evaluationMetadata: {
    winnerModel: string | null;
    scores: MockEvaluationScore[];
    meanScores: Record<string, number>;
    modelReasoning: Record<string, string[]>;
    tiedModels: string[];
  };
  results: Array<{
    model: string;
    message?: { content?: string | null };
    error?: string;
    latencyMs?: number;
  }>;
};

function emptyReasoning(models: string[]): Record<string, string[]> {
  return Object.fromEntries(models.map((m) => [m, [] as string[]]));
}

/** Two-model experiment: charts, summary, dialog reasoning, markdown in outputs. */
export function mockRunItemTwoModels(models: string[]): MockRunItemBody {
  const m1 = models[0] ?? "openai/gpt-5.4";
  const m2 = models[1] ?? "openai/gpt-5.2";
  const scores: MockEvaluationScore[] = [
    {
      judgeModel: m1,
      evaluatedModel: m2,
      score: 8,
      reasoning: "Response B is clearer for this query.",
    },
    {
      judgeModel: m2,
      evaluatedModel: m1,
      score: 7,
      reasoning: "Response A is acceptable but less detailed.",
    },
  ];
  return {
    success: true,
    evaluationMetadata: {
      winnerModel: m2,
      scores,
      meanScores: { [m1]: 7.5, [m2]: 8.5 },
      modelReasoning: emptyReasoning([m1, m2]),
      tiedModels: [],
    },
    results: [
      {
        model: m1,
        message: { content: "Answer with **bold** markdown." },
        latencyMs: 120,
      },
      {
        model: m2,
        message: { content: "Another line with *italic* text." },
        latencyMs: 95,
      },
    ],
  };
}

/**
 * Four models with full judge–candidate score grid so Kendall tau-b pairs exist
 * (each judge scores the other three; any two judges share ≥2 evaluated models).
 */
export function mockRunItemFourModels(models: string[]): MockRunItemBody {
  const all = models.slice(0, 4);
  if (all.length < 4) {
    throw new Error(`mockRunItemFourModels requires 4 models, got ${models.length}`);
  }
  const [a, b, c, d] = all;
  const four = [a, b, c, d];
  const scores: MockEvaluationScore[] = [];
  for (const judge of four) {
    for (const evaluated of four) {
      if (judge === evaluated) continue;
      const hash = (judge.length + evaluated.length + judge.charCodeAt(2)) % 30;
      scores.push({
        judgeModel: judge,
        evaluatedModel: evaluated,
        score: 65 + hash,
        reasoning: `Judge ${judge.split("/").pop()} on ${evaluated.split("/").pop()}.`,
      });
    }
  }
  return {
    success: true,
    evaluationMetadata: {
      winnerModel: a,
      scores,
      meanScores: Object.fromEntries(four.map((id) => [id, 78])),
      modelReasoning: emptyReasoning(four),
      tiedModels: [],
    },
    results: four.map((model, i) => ({
      model,
      message: { content: `Response **${i + 1}** for ${model.split("/").pop()}.` },
      latencyMs: 100 + i * 10,
    })),
  };
}
