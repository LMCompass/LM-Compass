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

async function deleteAllRubricsViaUi(page: Page) {
  await page.goto("/rubric/view");
  await expect(page.getByRole("heading", { name: "View Rubrics" })).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForLoadState("networkidle");

  for (let i = 0; i < 50; i++) {
    const emptyHeading = page.getByText("No rubrics yet");
    if (await emptyHeading.isVisible().catch(() => false)) {
      return;
    }

    const firstRubricRow = page
      .locator("section")
      .first()
      .locator(".min-h-0")
      .getByRole("button")
      .first();
    await expect(firstRubricRow).toBeVisible({ timeout: 15_000 });
    await firstRubricRow.click();

    const preview = page.locator("section").nth(1);
    await preview.getByRole("button", { name: /^delete$/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^delete$/i }).click();
    await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 10_000 });
  }
}

/** Wrap the current page fetch (after mockChatSSE) to record the last /api/chat POST body. */
async function installLastChatPayloadHook(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { fetch: typeof fetch };
    const prevFetch = w.fetch;
    w.fetch = async (input, init) => {
      try {
        const rawUrl =
          typeof input === "string"
            ? input
            : input instanceof Request
              ? input.url
              : "";
        const pathname = new URL(rawUrl, window.location.origin).pathname;
        if (
          pathname === "/api/chat" &&
          init?.method === "POST" &&
          typeof init.body === "string"
        ) {
          const parsed = JSON.parse(init.body) as { rubricId?: string };
          (window as unknown as { __e2eLastChatPayload?: { rubricId?: string } }).__e2eLastChatPayload =
            parsed;
        }
      } catch {
        /* ignore malformed bodies */
      }
      return prevFetch(input, init);
    };
  });
}

async function readLastRubricIdFromHook(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    return (window as unknown as { __e2eLastChatPayload?: { rubricId?: string } })
      .__e2eLastChatPayload?.rubricId;
  });
}

async function openRubricDropdown(page: Page) {
  const rubricCombo = page.getByRole("combobox").nth(2);
  await rubricCombo.click();
  await expect(page.getByPlaceholder("Search rubrics...")).toBeVisible({
    timeout: 5_000,
  });
}

async function selectEvaluationMethod(page: Page, optionName: RegExp) {
  const evalSelector = page.getByRole("combobox").nth(1);
  await evalSelector.click();
  await page.getByRole("option", { name: optionName }).first().click();
}

test.describe("Rubric management", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  let userId: string | null;
  const runId = Date.now();
  const promptOnlyTitle = `E2E Prompt ${runId}`;
  const hitlOnlyTitle = `E2E HITL ${runId}`;

  test.beforeAll(() => {
    userId = getTestUserId();
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (!userId) {
      testInfo.skip(true, "No test user available — add a user to the Clerk dev instance");
      return;
    }

    await signInTestUser(page, userId);
  });

  test("shows empty state with Add your first rubric after clearing existing rubrics", async ({
    page,
  }) => {
    await deleteAllRubricsViaUi(page);

    await expect(page.getByText("No rubrics yet")).toBeVisible();
    await expect(page.getByText(/add your first rubric/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /add your first rubric/i }),
    ).toBeVisible();
  });

  test("creates a rubric from the dialog with title, content, and evaluation methods", async ({
    page,
  }) => {
    await page.goto("/rubric/view");
    await expect(page.getByRole("heading", { name: "View Rubrics" })).toBeVisible({
      timeout: 20_000,
    });

    await page.locator('[data-tour-id="rubric-add-button"]').click();
    await expect(page.getByRole("dialog", { name: /add rubric/i })).toBeVisible();

    await page.locator("#rubric-name").fill(promptOnlyTitle);
    await page.locator("#rubric-description").fill("E2E rubric body line A\nLine B");

    await page.getByRole("button", { name: "RL4F" }).click();

    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 20_000 });

    await expect(page.getByText(promptOnlyTitle).first()).toBeVisible();
    await expect(page.getByText("E2E rubric body line A").first()).toBeVisible();
    await expect(page.getByText("PROMPT-BASED").first()).toBeVisible();
    await expect(page.getByText("RL4F").first()).toBeVisible();
  });

  test("edits a rubric and saves changes to the list and preview", async ({ page }) => {
    await page.goto("/rubric/view");
    await expect(page.getByText(promptOnlyTitle).first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: new RegExp(promptOnlyTitle) }).click();
    await page.locator("section").nth(1).getByRole("button", { name: /^edit$/i }).click();

    await expect(page.getByRole("dialog", { name: /edit rubric/i })).toBeVisible();
    await page.locator("#rubric-name").fill(`${promptOnlyTitle} edited`);
    await page.locator("#rubric-description").fill("Updated content for E2E");

    await page.getByRole("button", { name: /^update$/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 20_000 });

    const updatedTitle = `${promptOnlyTitle} edited`;
    await expect(page.getByText(updatedTitle).first()).toBeVisible();
    await expect(page.getByText("Updated content for E2E").first()).toBeVisible();
  });

  test("adds a HITL-only rubric for chat selector filtering", async ({ page }) => {
    await page.goto("/rubric/view");
    await page.locator('[data-tour-id="rubric-add-button"]').click();
    await expect(page.getByRole("dialog", { name: /add rubric/i })).toBeVisible();

    await page.locator("#rubric-name").fill(hitlOnlyTitle);
    await page.locator("#rubric-description").fill("HITL-only rubric content");

    await page.getByRole("button", { name: "HITL" }).click();
    await page.getByRole("button", { name: "Prompt-based", exact: true }).click();

    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 20_000 });

    await expect(page.getByText(hitlOnlyTitle).first()).toBeVisible();
    await expect(page.getByText("HITL").first()).toBeVisible();
  });

  test("chat rubric selector lists Default rubric for every evaluation method and filters custom rubrics", async ({
    page,
  }) => {
    await mockModelPricing(page);
    await mockHasApiKey(page);
    await page.goto("/chat");
    await waitForChatReady(page);

    await selectEvaluationMethod(page, /prompt-based scoring/i);
    await openRubricDropdown(page);
    await expect(page.getByRole("option", { name: /default rubric/i })).toBeVisible();
    await expect(page.getByRole("option", { name: new RegExp(`${promptOnlyTitle} edited`, "i") })).toBeVisible();
    await expect(page.getByRole("option", { name: new RegExp(hitlOnlyTitle, "i") })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await selectEvaluationMethod(page, /human-in-the-loop \(hitl\) rubric refinement/i);
    await openRubricDropdown(page);
    await expect(page.getByRole("option", { name: /default rubric/i })).toBeVisible();
    await expect(page.getByRole("option", { name: new RegExp(hitlOnlyTitle, "i") })).toBeVisible();
    await expect(
      page.getByRole("option", { name: new RegExp(`${promptOnlyTitle} edited`, "i") }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("selecting a rubric sends its id on the next chat request", async ({ page }) => {
    await mockModelPricing(page);
    await mockHasApiKey(page);
    await page.goto("/chat");
    await waitForChatReady(page);

    const rubricCombo = page.getByRole("combobox").nth(2);

    await selectModels(page, ["GPT-5 Mini"]);
    await mockChatSSE(page, {
      results: [
        {
          model: "openai/gpt-5-mini",
          message: { role: "assistant", content: "E2E rubric ack" },
        },
      ],
      evaluationMetadata: {
        winnerModel: "openai/gpt-5-mini",
        scores: [],
        meanScores: { "openai/gpt-5-mini": 90 },
        modelReasoning: { "openai/gpt-5-mini": ["ok"] },
        tiedModels: [],
      },
    });
    await installLastChatPayloadHook(page);

    await selectEvaluationMethod(page, /prompt-based scoring/i);
    await openRubricDropdown(page);
    await page.getByRole("option", { name: new RegExp(`${promptOnlyTitle} edited`, "i") }).click();
    await expect(rubricCombo).toContainText(`${promptOnlyTitle} edited`);

    await submitPrompt(page, "Rubric payload check");

    await expect(page.getByText("E2E rubric ack")).toBeVisible({ timeout: 20_000 });
    const sentId = await readLastRubricIdFromHook(page);
    expect(sentId).toBeTruthy();
    expect(sentId).not.toBe("default");
  });

  test("deletes a rubric after confirmation and removes it from the list", async ({ page }) => {
    await page.goto("/rubric/view");
    await expect(page.getByText(hitlOnlyTitle).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: new RegExp(hitlOnlyTitle) }).click();

    await page.locator("section").nth(1).getByRole("button", { name: /^delete$/i }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByText(/permanently delete this rubric/i)).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: /^delete$/i }).click();
    await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 10_000 });

    await expect(page.getByText(hitlOnlyTitle)).not.toBeVisible();
  });

  test("deletes remaining rubrics and returns to empty state", async ({ page }) => {
    await deleteAllRubricsViaUi(page);
    await expect(page.getByText("No rubrics yet")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/add your first rubric/i)).toBeVisible();
  });
});
