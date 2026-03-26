import { describe, expect, it, vi } from "vitest";

import { Evaluator } from "./evaluation/evaluator";
import { GradeHITLEvaluator } from "./evaluation/grade-hitl-evaluator";
import { PromptBasedEvaluator, createNSqScoringQuery, NPromptBasedEvaluator } from "./evaluation/prompt-based-evaluators";
import { RL4FEvaluator } from "./evaluation/rl4f-evaluator";
import type { ModelResponse } from "./evaluation/types";

function createMockClient(responses: Array<string | Error>) {
  const create = vi.fn().mockImplementation(async () => {
    const next = responses.shift();
    if (next instanceof Error) {
      throw next;
    }

    return {
      choices: [
        {
          message: {
            content: next ?? "",
          },
        },
      ],
    };
  });

  return {
    client: {
      chat: {
        completions: {
          create,
        },
      },
    },
    create,
  };
}

describe("createNSqScoringQuery", () => {
  it("includes the user query, candidate response, rubric, and JSON output requirements", () => {
    const query = createNSqScoringQuery(
      "What is LM Compass?",
      "It compares language models.",
      "Accuracy (5 points) - Correct facts",
    );

    expect(query).toContain("QUERY:\nWhat is LM Compass?");
    expect(query).toContain("CANDIDATE RESPONSE:\nIt compares language models.");
    expect(query).toContain("RUBRIC:\nAccuracy (5 points) - Correct facts");
    expect(query).toContain('"reasoning"');
    expect(query).toContain('"score"');
  });
});

describe("Evaluator.extractOutermostJson", () => {
  const evaluator = new Evaluator({} as never, "judge");

  it("extracts JSON from fenced text and repairs invalid backslash escapes", () => {
    const parsed = evaluator.extractOutermostJson(
      '```json\n{"reasoning":"Contains LaTeX \\(x\\) safely","score":88}\n```',
    );

    expect(parsed).toEqual({
      reasoning: "Contains LaTeX \\(x\\) safely",
      score: 88,
    });
  });

  it("returns null when no valid outermost JSON exists", () => {
    expect(evaluator.extractOutermostJson("no json here")).toBeNull();
    expect(evaluator.extractOutermostJson('prefix {"score": } suffix')).toBeNull();
  });
});

describe("PromptBasedEvaluator", () => {
  const options = {
    userQuery: "Explain the result clearly.",
    rubric: "Accuracy (5 points) - Correct\n\nClarity (5 points) - Easy to follow",
  };

  const responses: ModelResponse[] = [
    { model: "model-a", content: "Answer A" },
    { model: "model-b", content: "Answer B" },
    { model: "model-c", content: "Answer C" },
  ];

  it("returns the single valid response without querying judges", async () => {
    const { client, create } = createMockClient([]);
    const evaluator = new PromptBasedEvaluator(client as never);

    const result = await evaluator.evaluate(
      [
        { model: "model-a", content: "Only valid answer" },
        { model: "model-b", content: "   ", error: "empty" },
      ],
      options,
    );

    expect(result).toEqual({
      winner: { model: "model-a", content: "Only valid answer" },
      scores: [],
      meanScores: { "model-a": 0 },
      tiedModels: [],
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("throws when there are no valid responses to evaluate", async () => {
    const { client } = createMockClient([]);
    const evaluator = new PromptBasedEvaluator(client as never);

    await expect(
      evaluator.evaluate(
        [
          { model: "model-a", content: "", error: "failed" },
          { model: "model-b", content: "   " },
        ],
        options,
      ),
    ).rejects.toThrow("No valid responses to evaluate");
  });

  it("builds all n-squared scoring queries, parses judge responses, and aggregates winner scores", async () => {
    const { client, create } = createMockClient([
      '{"score":90,"reasoning":"Strong accuracy and clarity."}',
      '```json\n{"score":70,"reasoning":"Adequate but less complete."}\n```',
      '{"score":80,"reasoning":"Good answer with minor misses."}',
      '{"score":60,"reasoning":"Weaker coverage overall."}',
      '{"score":80,"reasoning":"Solid explanation."}',
      '{"score":90,"reasoning":"Best balance of correctness and clarity."}',
    ]);
    const evaluator = new PromptBasedEvaluator(client as never);

    const result = await evaluator.evaluate(responses, options);

    expect(create).toHaveBeenCalledTimes(6);

    const requestPayloads = create.mock.calls.map(([payload]) => payload);
    expect(requestPayloads.map((payload) => payload.model)).toEqual([
      "model-a",
      "model-a",
      "model-b",
      "model-b",
      "model-c",
      "model-c",
    ]);

    expect(requestPayloads[0].messages[0].content).toContain("QUERY:\nExplain the result clearly.");
    expect(requestPayloads[0].messages[0].content).toContain("CANDIDATE RESPONSE:\nAnswer B");
    expect(requestPayloads[0].messages[0].content).toContain(options.rubric);
    expect(requestPayloads[1].messages[0].content).toContain("CANDIDATE RESPONSE:\nAnswer C");

    expect(result.scores).toEqual([
      {
        judgeModel: "model-a",
        evaluatedModel: "model-b",
        score: 90,
        reasoning: "Strong accuracy and clarity.",
      },
      {
        judgeModel: "model-a",
        evaluatedModel: "model-c",
        score: 70,
        reasoning: "Adequate but less complete.",
      },
      {
        judgeModel: "model-b",
        evaluatedModel: "model-a",
        score: 80,
        reasoning: "Good answer with minor misses.",
      },
      {
        judgeModel: "model-b",
        evaluatedModel: "model-c",
        score: 60,
        reasoning: "Weaker coverage overall.",
      },
      {
        judgeModel: "model-c",
        evaluatedModel: "model-a",
        score: 80,
        reasoning: "Solid explanation.",
      },
      {
        judgeModel: "model-c",
        evaluatedModel: "model-b",
        score: 90,
        reasoning: "Best balance of correctness and clarity.",
      },
    ]);
    expect(result.meanScores).toEqual({
      "model-a": 80,
      "model-b": 90,
      "model-c": 65,
    });
    expect(result.winner).toEqual({ model: "model-b", content: "Answer B" });
    expect(result.tiedModels).toEqual([]);
  });

  it("treats malformed judge responses as null scores", async () => {
    const { client } = createMockClient([
      '{"score":101,"reasoning":"Out of range"}',
      "not json at all",
    ]);
    const evaluator = new PromptBasedEvaluator(client as never);

    const result = await evaluator.evaluate(
      [
        { model: "model-a", content: "Answer A" },
        { model: "model-b", content: "Answer B" },
      ],
      options,
    );

    expect(result.scores).toEqual([
      {
        judgeModel: "model-a",
        evaluatedModel: "model-b",
        score: null,
        reasoning: "Out of range",
      },
      {
        judgeModel: "model-b",
        evaluatedModel: "model-a",
        score: null,
        reasoning: null,
      },
    ]);
    expect(result.meanScores).toEqual({
      "model-a": 0,
      "model-b": 0,
    });
    expect(result.winner).toBeNull();
    expect(result.tiedModels).toEqual(["model-a", "model-b"]);
  });

  it("determines a winner when some judge calls fail but others succeed", async () => {
    // 3 judges (A, B, C) judging 3 candidates (A, B, C)
    // A judges B, C -> Success (90, 80)
    // B judges A, C -> Failure (Error)
    // C judges A, B -> Success (70, 60)
    const { client } = createMockClient([
      '{"score":90,"reasoning":"A on B"}',
      '{"score":80,"reasoning":"A on C"}',
      new Error("Judge B failed"),
      new Error("Judge B failed"),
      '{"score":70,"reasoning":"C on A"}',
      '{"score":60,"reasoning":"C on B"}',
    ]);
    const evaluator = new PromptBasedEvaluator(client as never);

    const result = await evaluator.evaluate(responses, options);

    // Mean scores:
    // model-a: (70) / 1 = 70
    // model-b: (90 + 60) / 2 = 75
    // model-c: (80) / 1 = 80
    expect(result.meanScores).toEqual({
      "model-a": 70,
      "model-b": 75,
      "model-c": 80,
    });
    expect(result.winner?.model).toBe("model-c");
  });

  it("returns a tie when multiple models share the highest mean score", async () => {
    const { client } = createMockClient([
      '{"score":80,"reasoning":"Good answer."}',
      '{"score":80,"reasoning":"Also good answer."}',
    ]);
    const evaluator = new PromptBasedEvaluator(client as never);

    const result = await evaluator.evaluate(
      [
        { model: "model-a", content: "Answer A" },
        { model: "model-b", content: "Answer B" },
      ],
      options,
    );

    expect(result.meanScores).toEqual({
      "model-a": 80,
      "model-b": 80,
    });
    expect(result.winner).toBeNull();
    expect(result.tiedModels).toEqual(["model-a", "model-b"]);
  });

  it("extracts score and reasoning from raw judge text and rejects malformed payloads", () => {
    const evaluator = new PromptBasedEvaluator({} as never);

    expect(
      evaluator.extractScoreAndReasoning(
        'Preface ```json\n{"score":77,"reasoning":"Weighted correctly."}\n``` trailing text',
      ),
    ).toEqual({
      score: 77,
      reasoning: "Weighted correctly.",
    });

    expect(
      evaluator.extractScoreAndReasoning(
        '{"score":"77","reasoning":"Wrong score type"}',
      ),
    ).toEqual({
      score: null,
      reasoning: "Wrong score type",
    });
  });
});

describe("NPromptBasedEvaluator", () => {
  const options = {
    userQuery: "Compare the answers.",
    rubric: "Accuracy (5 points) - Correct\n\nClarity (5 points) - Understandable",
  };

  it("sends one combined evaluation prompt per judge and aggregates parsed scores", async () => {
    const { client, create } = createMockClient([
      '{"model-b":{"score":81,"reasoning":"Good coverage."},"model-c":{"score":73,"reasoning":"Mostly correct."}}',
      '```json\n{"model-a":{"score":91,"reasoning":"Best answer."},"model-c":{"score":60,"reasoning":"Less complete."}}\n```',
      '{"model-a":{"score":85,"reasoning":"Clear and correct."},"model-b":{"score":88,"reasoning":"Strong answer."}}',
    ]);
    const evaluator = new NPromptBasedEvaluator(client as never);

    const result = await evaluator.evaluate(
      [
        { model: "model-a", content: "Answer A" },
        { model: "model-b", content: "Answer B" },
        { model: "model-c", content: "Answer C" },
      ],
      options,
    );

    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls.map(([payload]) => payload.model)).toEqual([
      "model-a",
      "model-b",
      "model-c",
    ]);

    const firstPrompt = create.mock.calls[0][0].messages[0].content;
    expect(firstPrompt).toContain("CANDIDATE RESPONSES:");
    expect(firstPrompt).toContain("model-b RESPONSE:\nAnswer B");
    expect(firstPrompt).toContain("model-c RESPONSE:\nAnswer C");
    expect(firstPrompt).toContain("Here are the model names for reference: model-b, model-c");

    expect(result.meanScores).toEqual({
      "model-a": 88,
      "model-b": 84.5,
      "model-c": 66.5,
    });
    expect(result.winner).toEqual({ model: "model-a", content: "Answer A" });
    expect(result.tiedModels).toEqual([]);
  });

  it("maps missing or malformed per-model scores to null entries and handles ties", async () => {
    const { client } = createMockClient([
      '{"model-b":{"score":75,"reasoning":"Solid."}}',
      '{"model-a":{"score":"88","reasoning":"Wrong type."}}',
    ]);
    const evaluator = new NPromptBasedEvaluator(client as never);

    const result = await evaluator.evaluate(
      [
        { model: "model-a", content: "Answer A" },
        { model: "model-b", content: "Answer B" },
      ],
      options,
    );

    expect(result.scores).toEqual([
      {
        judgeModel: "model-a",
        evaluatedModel: "model-b",
        score: 75,
        reasoning: "Solid.",
      },
      {
        judgeModel: "model-b",
        evaluatedModel: "model-a",
        score: 88,
        reasoning: "Wrong type.",
      },
    ]);
    expect(result.meanScores).toEqual({
      "model-a": 88,
      "model-b": 75,
    });
    expect(result.winner).toEqual({ model: "model-a", content: "Answer A" });
    expect(
      evaluator.extractScores('{"model-a":{"score":88,"reasoning":"Good"},"model-b":"bad"}'),
    ).toEqual({
      "model-a": { score: 88, reasoning: "Good" },
    });
  });

  it("handles string-based scores in JSON for compatibility with varied LLM outputs", async () => {
    const { client } = createMockClient([
      '{"model-b":{"score":"95","reasoning":"String score."}}',
    ]);
    const evaluator = new NPromptBasedEvaluator(client as never);

    const result = await evaluator.evaluate(
      [
        { model: "model-a", content: "A" },
        { model: "model-b", content: "B" },
      ],
      options
    );

    expect(result.scores[0].score).toBe(95);
  });
});

describe("RL4FEvaluator", () => {
  const options = {
    userQuery: "Explain the answer.",
    rubric: "Accuracy (5 points) - Correct\n\nClarity (5 points) - Clear",
    iterations: 1,
  };

  it("runs refinement iterations, updates scores, and stores iteration history", async () => {
    const onRefinementStart = vi.fn();
    const { client } = createMockClient([
      '{"score":60,"reasoning":"Needs work."}',
      '{"score":70,"reasoning":"Decent answer."}',
      'Critique: I was too harsh.\n{"reasoning":"Improved after reconsidering rubric fit.","score":85}',
      'Critique: score seems right.\n```json\n{"reasoning":"Still stronger overall.","score":70}\n```',
    ]);
    const evaluator = new RL4FEvaluator(client as never, onRefinementStart);

    const result = await evaluator.evaluate(
      [
        { model: "model-a", content: "Answer A" },
        { model: "model-b", content: "Answer B" },
      ],
      options,
    );

    expect(onRefinementStart).toHaveBeenCalledTimes(1);
    expect(result.meanScores).toEqual({
      "model-a": 70,
      "model-b": 85,
    });
    expect(result.winner).toEqual({ model: "model-b", content: "" });
    expect(result.tiedModels).toEqual(["model-b"]);

    expect(result.iterationResults).toHaveLength(2);
    expect(result.iterationResults?.[0]).toMatchObject({
      iterationNumber: 0,
      meanScores: { "model-a": 70, "model-b": 60 },
      winner: { model: "model-a", content: "" },
    });
    expect(result.iterationResults?.[1]).toMatchObject({
      iterationNumber: 1,
      meanScores: { "model-a": 70, "model-b": 85 },
      winner: { model: "model-b", content: "" },
    });

    expect(evaluator.getCritiqueHistory()).toHaveLength(1);
    expect(evaluator.getCritiqueHistory()[0]).toEqual([
      expect.objectContaining({
        evaluatingModel: "model-a",
        evaluatedModel: "model-b",
        beforeScore: 60,
        afterScore: 85,
      }),
      expect.objectContaining({
        evaluatingModel: "model-b",
        evaluatedModel: "model-a",
        beforeScore: 70,
        afterScore: 70,
      }),
    ]);
    expect(evaluator.getEvaluationQueryAnswers()).toEqual(result.scores);
  });

  it("manages multiple refinement iterations and shows cumulative history", async () => {
    const { client } = createMockClient([
      '{"score":50,"reasoning":"Initial A on B."}',
      '{"score":60,"reasoning":"Initial B on A."}',
      // Iteration 1
      '{"reasoning":"Refined 1.","score":70}',
      '{"reasoning":"Refined 1.","score":80}',
      // Iteration 2
      '{"reasoning":"Refined 2.","score":90}',
      '{"reasoning":"Refined 2.","score":100}',
    ]);
    const evaluator = new RL4FEvaluator(client as never);
    const result = await evaluator.rl4fEvaluate(
      [
        { model: "model-a", content: "A" },
        { model: "model-b", content: "B" },
      ],
      { userQuery: "Q", iterations: 2 }
    );

    expect(result.iterationResults).toHaveLength(3); // 0 (Initial), 1, 2
    expect(result.iterationResults?.[0].meanScores).toEqual({ "model-a": 60, "model-b": 50 });
    expect(result.iterationResults?.[1].meanScores).toEqual({ "model-a": 80, "model-b": 70 });
    expect(result.iterationResults?.[2].meanScores).toEqual({ "model-a": 100, "model-b": 90 });
    expect(result.meanScores).toEqual({ "model-a": 100, "model-b": 90 });
  });

  it("keeps original scores when critique output is malformed and formats critique entries", async () => {
    const { client } = createMockClient([
      '{"score":55,"reasoning":"Weak answer."}',
      '{"score":90,"reasoning":"Strong answer."}',
      "No valid json here",
      '{"reasoning":"Revised and still strong.","score":92}',
    ]);
    const evaluator = new RL4FEvaluator(client as never);

    const result = await evaluator.evaluate(
      [
        { model: "model-a", content: "Answer A" },
        { model: "model-b", content: "Answer B" },
      ],
      options,
    );

    expect(result.scores).toEqual([
      {
        judgeModel: "model-a",
        evaluatedModel: "model-b",
        score: 55,
        reasoning: "Weak answer.",
      },
      {
        judgeModel: "model-b",
        evaluatedModel: "model-a",
        score: 92,
        reasoning: "Revised and still strong.",
      },
    ]);

    expect(
      evaluator.formatCritiqueEntry(evaluator.getCritiqueHistory()[0][0]),
    ).toContain("Judge: model-a  ->  Candidate: model-b");
  });
});

describe("GradeHITLEvaluator", () => {
  const example = {
    prompt: "What is the result?",
    response: "Here is the candidate response.",
  };
  const rubric = "Correctness (5 points) - factual\n\nClarity (5 points) - understandable";

  it("grades all models and cross-evaluates graders", async () => {
    const { client } = createMockClient([
      '{"score": "81", "reasoning":"Well graded."}',
      '{"score": 77, "reasoning":"Mostly appropriate."}',
      '{"score": 73, "reasoning":"Reasonable grade."}',
      '{"score": 60, "reasoning":"M1 by M2"}',
      '{"score": 65, "reasoning":"M1 by M3"}',
      '{"score": 72, "reasoning":"M2 by M1"}',
      '{"score": 75, "reasoning":"M2 by M3"}',
      '{"score": 80, "reasoning":"M3 by M1"}',
      '{"score": "bad", "reasoning":"ignored"}',
    ]);
    const evaluator = new GradeHITLEvaluator(client as never, "model-1", "model-2", "model-3");

    const graderResults = await evaluator.gradeAllModels(example, rubric);
    const crossEvalResults = await evaluator.crossEvaluateGraders(example, rubric, graderResults);

    expect(graderResults).toEqual({
      "model-1": {
        score: 81,
        reasoning: "Well graded.",
        raw_model_output: { score: "81", reasoning: "Well graded." },
      },
      "model-2": {
        score: 77,
        reasoning: "Mostly appropriate.",
        raw_model_output: { score: 77, reasoning: "Mostly appropriate." },
      },
      "model-3": {
        score: 73,
        reasoning: "Reasonable grade.",
        raw_model_output: { score: 73, reasoning: "Reasonable grade." },
      },
    });
    expect(crossEvalResults).toEqual({
      "model-1": { "model-2": 60, "model-3": 65 },
      "model-2": { "model-1": 72, "model-3": 75 },
      "model-3": { "model-1": 80 },
    });
  });

  it("checks score ranges and triggers phase1 follow-up questions when disagreement is high", async () => {
    const { client } = createMockClient([
      '{"score": 70, "reasoning":"First grader."}',
      '{"score": 72, "reasoning":"Second grader."}',
      '{"score": 74, "reasoning":"Third grader."}',
      '{"score": 20, "reasoning":"Low confidence in grader 1"}',
      '{"score": 80, "reasoning":"High confidence in grader 1"}',
      '{"score": 55, "reasoning":"Moderate confidence in grader 2"}',
      '{"score": 58, "reasoning":"Moderate confidence in grader 2"}',
      '{"score": 61, "reasoning":"Moderate confidence in grader 3"}',
      '{"score": 64, "reasoning":"Moderate confidence in grader 3"}',
      '{"questions":["Correctness: For this case, should the final score bucket be HIGH, MID, or LOW? Answer with exactly one of: HIGH, MID, LOW"],"draft_rubric_changes":"Add an explicit rule for ambiguous correctness cases."}',
    ]);
    const evaluator = new GradeHITLEvaluator(client as never, "model-1", "model-2", "model-3");

    const result = await evaluator.phase1(example, rubric, 20);

    expect(result.hitlTriggered).toBe(true);
    expect(result.scoreRanges).toEqual({
      "model-1": [20, 80],
      "model-2": [55, 58],
      "model-3": [61, 64],
    });
    expect(result.firstGraderName).toBe("model-1");
    expect(result.firstGraderResult).toMatchObject({
      score: 70,
      reasoning: "First grader.",
    });
    expect(result.questionsAndDrafts).toEqual({
      questions: [
        "Correctness: For this case, should the final score bucket be HIGH, MID, or LOW? Answer with exactly one of: HIGH, MID, LOW",
      ],
      draft_rubric_changes: "Add an explicit rule for ambiguous correctness cases.",
    });
  });

  it("requires at least three models for phase1", async () => {
    const evaluator = new GradeHITLEvaluator({} as never, "model-1", "model-2");

    await expect(evaluator.phase1(example, rubric)).rejects.toThrow(
      "Human-in-the-loop grading requires at least 3 models",
    );
  });

  it("updates the rubric in phase2 and re-runs grading with the updated rubric", async () => {
    const { client } = createMockClient([
      '{"rubric":"Updated rubric text"}',
      '{"score": 83, "reasoning":"Regraded 1."}',
      '{"score": 84, "reasoning":"Regraded 2."}',
      '{"score": 85, "reasoning":"Regraded 3."}',
      '{"score": 66, "reasoning":"Cross 1"}',
      '{"score": 67, "reasoning":"Cross 2"}',
      '{"score": 68, "reasoning":"Cross 3"}',
      '{"score": 69, "reasoning":"Cross 4"}',
      '{"score": 70, "reasoning":"Cross 5"}',
      '{"score": 71, "reasoning":"Cross 6"}',
    ]);
    const evaluator = new GradeHITLEvaluator(client as never, "model-1", "model-2", "model-3");

    const result = await evaluator.phase2(
      example,
      rubric,
      "model-1",
      { score: 70, reasoning: "Initial reasoning", raw_model_output: {} },
      {
        questions: [
          "Correctness: For this case, should the final score bucket be HIGH, MID, or LOW? Answer with exactly one of: HIGH, MID, LOW",
        ],
        draft_rubric_changes: "Draft change",
      },
      { "0": "HIGH" },
    );

    expect(result.updatedRubric).toBe("Updated rubric text");
    expect(result.graderResults["model-2"]).toMatchObject({
      score: 84,
      reasoning: "Regraded 2.",
    });
    expect(result.crossEvalResults).toEqual({
      "model-1": { "model-2": 66, "model-3": 67 },
      "model-2": { "model-1": 68, "model-3": 69 },
      "model-3": { "model-1": 70, "model-2": 71 },
    });
  });

  it("handles partially answered human questions in phase 2 refinement", async () => {
    const { client } = createMockClient([
      '{"rubric":"Partial updated rubric"}',
      '{"score": 50, "reasoning":"R1"}',
      '{"score": 50, "reasoning":"R2"}',
      '{"score": 50, "reasoning":"R3"}',
      '{"score": 50, "reasoning":"C1"}',
      '{"score": 50, "reasoning":"C2"}',
      '{"score": 50, "reasoning":"C3"}',
      '{"score": 50, "reasoning":"C4"}',
      '{"score": 50, "reasoning":"C5"}',
      '{"score": 50, "reasoning":"C6"}',
    ]);
    const evaluator = new GradeHITLEvaluator(client as never, "model-1", "model-2", "model-3");

    const result = await evaluator.phase2(
      example,
      rubric,
      "model-1",
      { score: 70, reasoning: "Initial", raw_model_output: {} },
      {
        questions: ["Q1", "Q2"],
        draft_rubric_changes: "Draft",
      },
      { "0": "HIGH" } // Only Q1 answered, A2 will be 'TODO'
    );

    expect(result.updatedRubric).toBe("Partial updated rubric");
  });
});
