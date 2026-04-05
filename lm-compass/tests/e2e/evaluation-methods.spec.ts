import { expect, test, type Page } from "@playwright/test";
import {
  getTestUserId,
  mockChatSSE,
  mockHasApiKey,
  mockModelPricing,
  selectModels,
  signInTestUser,
  submitPrompt,
  waitForChatReady,
} from "./helpers";

async function selectEvaluationMethod(page: Page, optionName: RegExp) {
  const evalSelector = page.getByRole("combobox").nth(1);
  await evalSelector.click();
  await page.getByRole("option", { name: optionName }).first().click();
}

async function selectRl4fIterations(page: Page, count: 2 | 3 | 4) {
  const iterationsSelector = page.getByRole("combobox", {
    name: /iteration/i,
  });
  await iterationsSelector.click();
  await page
    .getByRole("option", { name: new RegExp(`^${count} iterations$`, "i") })
    .click();
}

test.describe("Evaluation Method Workflows", () => {
  test.describe.configure({ timeout: 60_000 });

  let userId: string | null;

  test.beforeAll(() => {
    userId = getTestUserId();
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (!userId) {
      testInfo.skip(
        true,
        "No test user available - add a user to the Clerk dev instance",
      );
      return;
    }

    await signInTestUser(page, userId);
    await mockModelPricing(page);
    await mockHasApiKey(page);
    try {
      await page.goto("/chat", { waitUntil: "domcontentloaded" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("ERR_ABORTED") && !message.includes("frame was detached")) {
        throw error;
      }
      await page.goto("/chat", { waitUntil: "domcontentloaded" });
    }
    await waitForChatReady(page);
  });

  test.afterEach(async ({ page }) => {
    try {
      await page.unrouteAll({ behavior: "ignoreErrors" });
    } catch {
      // Ignore page-close race conditions.
    }
  });

  test("allows switching between all evaluation methods", async ({ page }) => {
    const evalSelector = page.getByRole("combobox").nth(1);

    await selectEvaluationMethod(page, /prompt-based scoring/i);
    await expect(evalSelector).toContainText("Prompt-based scoring");

    await selectEvaluationMethod(page, /one-shot prompt-based scoring/i);
    await expect(evalSelector).toContainText("One-Shot Prompt-based scoring");

    await selectEvaluationMethod(page, /rationale based self critique loops/i);
    await expect(evalSelector).toContainText("Rationale Based Self Critique Loops");

    await selectEvaluationMethod(page, /human-in-the-loop \(hitl\) rubric refinement/i);
    await expect(evalSelector).toContainText("Human-in-the-loop (HITL) rubric refinement");
  });

  test("prompt-based evaluation returns scored responses with a winner", async ({
    page,
  }) => {
    await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);
    await selectEvaluationMethod(page, /prompt-based scoring/i);

    await mockChatSSE(page, {
      results: [
        {
          model: "openai/gpt-5-mini",
          message: {
            role: "assistant",
            content: "Prompt-based winner response",
          },
        },
        {
          model: "anthropic/claude-haiku-4.5",
          message: {
            role: "assistant",
            content: "Prompt-based second response",
          },
        },
      ],
      evaluationMetadata: {
        winnerModel: "openai/gpt-5-mini",
        scores: [],
        meanScores: {
          "openai/gpt-5-mini": 89.3,
          "anthropic/claude-haiku-4.5": 78.0,
        },
        modelReasoning: {
          "openai/gpt-5-mini": ["Higher relevance"],
          "anthropic/claude-haiku-4.5": ["Less complete"],
        },
        tiedModels: [],
      },
    });

    await submitPrompt(page, "Compare these two models with prompt-based scoring");

    await expect(page.getByRole("heading", { name: "GPT-5 Mini" }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Claude Haiku 4.5" }).first()).toBeVisible();
    await expect(page.getByText("Top Score:")).toBeVisible();
    await expect(page.getByText("89.3", { exact: true }).first()).toBeVisible();
  });

  test("one-shot n-prompt-based evaluation handles tie outcomes", async ({ page }) => {
    await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);
    await selectEvaluationMethod(page, /one-shot prompt-based scoring/i);

    await mockChatSSE(page, {
      results: [
        {
          model: "openai/gpt-5-mini",
          message: { role: "assistant", content: "Tie candidate A" },
        },
        {
          model: "anthropic/claude-haiku-4.5",
          message: { role: "assistant", content: "Tie candidate B" },
        },
      ],
      evaluationMetadata: {
        winnerModel: null,
        scores: [],
        meanScores: {
          "openai/gpt-5-mini": 81.0,
          "anthropic/claude-haiku-4.5": 81.0,
        },
        modelReasoning: {
          "openai/gpt-5-mini": ["Equivalent quality"],
          "anthropic/claude-haiku-4.5": ["Equivalent quality"],
        },
        tiedModels: ["openai/gpt-5-mini", "anthropic/claude-haiku-4.5"],
      },
    });

    await submitPrompt(page, "Run one-shot evaluation with possible tie");

    await expect(page.getByText("It's a Tie")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/select your preferred answer/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^select$/i })).toHaveCount(2);
  });

  test("rl4f shows iterations selector, refining phase, and iteration metadata", async ({
    page,
  }) => {
    await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);
    await selectEvaluationMethod(page, /rationale based self critique loops/i);

    await expect(page.getByRole("combobox", { name: /1 iteration/i })).toBeVisible();
    await selectRl4fIterations(page, 2);
    await expect(page.getByRole("combobox", { name: /2 iterations/i })).toBeVisible();

    await mockChatSSE(page, {
      includeRefiningPhase: true,
      phaseDelay: 2500,
      results: [
        {
          model: "openai/gpt-5-mini",
          message: { role: "assistant", content: "RL4F final response A" },
        },
        {
          model: "anthropic/claude-haiku-4.5",
          message: { role: "assistant", content: "RL4F final response B" },
        },
      ],
      evaluationMetadata: {
        winnerModel: "openai/gpt-5-mini",
        scores: [],
        meanScores: {
          "openai/gpt-5-mini": 84.0,
          "anthropic/claude-haiku-4.5": 79.0,
        },
        modelReasoning: {
          "openai/gpt-5-mini": ["Improved after critique"],
          "anthropic/claude-haiku-4.5": ["Solid but less improved"],
        },
        tiedModels: [],
      },
      iterationResults: [
        {
          iterationNumber: 0,
          scores: [
            {
              judgeModel: "openai/gpt-5-mini",
              evaluatedModel: "anthropic/claude-haiku-4.5",
              score: 78,
              reasoning: "Initial pass",
            },
          ],
          meanScores: {
            "openai/gpt-5-mini": 82,
            "anthropic/claude-haiku-4.5": 78,
          },
          winner: { model: "openai/gpt-5-mini", content: "" },
        },
        {
          iterationNumber: 1,
          scores: [
            {
              judgeModel: "openai/gpt-5-mini",
              evaluatedModel: "anthropic/claude-haiku-4.5",
              score: 84,
              reasoning: "After self-critique",
            },
          ],
          meanScores: {
            "openai/gpt-5-mini": 84,
            "anthropic/claude-haiku-4.5": 79,
          },
          winner: { model: "openai/gpt-5-mini", content: "" },
        },
      ],
    });

    await submitPrompt(page, "Run RL4F with refinement");

    await expect(page.getByText("Refining evaluations")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Refinement Iterations:")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /initial evaluation/i })).toBeVisible();

    await page.getByRole("button", { name: /initial evaluation/i }).click();
    await expect(page.getByText("Mean Scores:")).toBeVisible();
  });

  test("hitl blocks submission with fewer than 3 selected models", async ({ page }) => {
    await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);
    await selectEvaluationMethod(page, /human-in-the-loop \(hitl\) rubric refinement/i);

    await expect(
      page.getByText(/human-in-the-loop evaluation requires at least 3 models/i),
    ).toBeVisible();

    const textbox = page.getByRole("textbox");
    await expect(textbox).toHaveAttribute(
      "placeholder",
      "HITL evaluation requires at least 3 models...",
    );

    const sendButton = page.locator("button:has(svg.lucide-send)");
    await expect(sendButton).toBeDisabled();
  });

  test("hitl phase-1 requires input and phase-2 submission completes evaluation cycle", async ({
    page,
  }) => {
    await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5", "GPT-5 Nano"]);
    await selectEvaluationMethod(page, /human-in-the-loop \(hitl\) rubric refinement/i);

    await page.route("**/api/chat/hitl-phase2", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          updatedRubric: "Updated rubric from human input",
          graderResults: {
            "openai/gpt-5-mini": {
              score: 86,
              reasoning: "Best consistency",
              raw_model_output: { score: 86, reasoning: "Best consistency" },
            },
            "anthropic/claude-haiku-4.5": {
              score: 81,
              reasoning: "Good overall",
              raw_model_output: { score: 81, reasoning: "Good overall" },
            },
            "openai/gpt-5-nano": {
              score: 74,
              reasoning: "Less complete",
              raw_model_output: { score: 74, reasoning: "Less complete" },
            },
          },
          crossEvalResults: {
            "openai/gpt-5-mini": {
              "anthropic/claude-haiku-4.5": 77,
              "openai/gpt-5-nano": 72,
            },
            "anthropic/claude-haiku-4.5": {
              "openai/gpt-5-mini": 75,
              "openai/gpt-5-nano": 71,
            },
            "openai/gpt-5-nano": {
              "openai/gpt-5-mini": 69,
              "anthropic/claude-haiku-4.5": 70,
            },
          },
        }),
      });
    });

    await mockChatSSE(page, {
      results: [
        {
          model: "openai/gpt-5-mini",
          message: { role: "assistant", content: "HITL response A" },
        },
        {
          model: "anthropic/claude-haiku-4.5",
          message: { role: "assistant", content: "HITL response B" },
        },
        {
          model: "openai/gpt-5-nano",
          message: { role: "assistant", content: "HITL response C" },
        },
      ],
      evaluationMetadata: {
        winnerModel: "openai/gpt-5-mini",
        scores: [],
        meanScores: {
          "openai/gpt-5-mini": 83,
          "anthropic/claude-haiku-4.5": 82,
          "openai/gpt-5-nano": 75,
        },
        modelReasoning: {
          "openai/gpt-5-mini": ["Strong grading"],
          "anthropic/claude-haiku-4.5": ["Close second"],
          "openai/gpt-5-nano": ["Weaker output"],
        },
        tiedModels: [],
        hitlPhase1: {
          graderResults: {
            "openai/gpt-5-mini": {
              score: 83,
              reasoning: "Initial grade",
              raw_model_output: { score: 83, reasoning: "Initial grade" },
            },
          },
          crossEvalResults: {
            "openai/gpt-5-mini": {
              "anthropic/claude-haiku-4.5": 35,
              "openai/gpt-5-nano": 82,
            },
          },
          scoreRanges: {
            "openai/gpt-5-mini": [35, 82],
          },
          hitlTriggered: true,
          questionsAndDrafts: {
            questions: [
              "Should completeness be weighted higher than style in this task?",
            ],
            draft_rubric_changes: "Prioritize factual completeness.",
          },
          firstGraderName: "openai/gpt-5-mini",
          firstGraderResult: {
            score: 83,
            reasoning: "Initial grade",
            raw_model_output: { score: 83, reasoning: "Initial grade" },
          },
        },
        hitlRubric: "Original HITL rubric",
      },
    });

    await submitPrompt(page, "Run HITL phase-1");

    await expect(
      page.getByText(/grader disagreement was high/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(/q1:/i)).toBeVisible();

    await page.getByLabel(/q1:/i).fill("Yes, prioritize correctness and completeness.");
    const phase2Response = page.waitForResponse(
      (response) =>
        response.url().includes("/api/chat/hitl-phase2") && response.status() === 200,
      { timeout: 15_000 },
    );
    await page.getByRole("button", { name: /submit & update rubric/i }).click();
    await phase2Response;

    await expect(page.getByText(/updated rubric \(after your answers\):/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Updated rubric from human input")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/top model after updated rubric:/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "GPT-5 Mini" }).first()).toBeVisible();
  });

  test("tie scenarios require winner selection before follow-up messages", async ({
    page,
  }) => {
    await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);

    await mockChatSSE(page, {
      results: [
        {
          model: "openai/gpt-5-mini",
          message: { role: "assistant", content: "Tie option one" },
        },
        {
          model: "anthropic/claude-haiku-4.5",
          message: { role: "assistant", content: "Tie option two" },
        },
      ],
      evaluationMetadata: {
        winnerModel: null,
        scores: [],
        meanScores: {
          "openai/gpt-5-mini": 80,
          "anthropic/claude-haiku-4.5": 80,
        },
        modelReasoning: {
          "openai/gpt-5-mini": ["Equivalent"],
          "anthropic/claude-haiku-4.5": ["Equivalent"],
        },
        tiedModels: ["openai/gpt-5-mini", "anthropic/claude-haiku-4.5"],
      },
    });

    await submitPrompt(page, "Generate a tie");

    await expect(page.getByText("It's a Tie")).toBeVisible({ timeout: 15_000 });

    const textbox = page.getByRole("textbox");
    await expect(textbox).toHaveAttribute(
      "placeholder",
      "Please select a winner first...",
    );
    const sendButton = page.locator("button:has(svg.lucide-send)");
    await expect(sendButton).toBeDisabled();

    await page.getByRole("button", { name: /^select$/i }).first().click();

    await expect(textbox).toBeEnabled();
    await textbox.fill("Follow-up after selecting winner");
    await page.keyboard.press("Enter");

    await expect(page.getByText("Follow-up after selecting winner")).toBeVisible({
      timeout: 10_000,
    });
  });
});
