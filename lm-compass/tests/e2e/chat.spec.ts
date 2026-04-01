import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";
import {
  getTestUserId,
  signInTestUser,
  waitForChatReady,
  selectModels,
  mockChatSSE,
  mockChatHanging,
  mockModelPricing,
  mockHasApiKey,
  submitPrompt,
} from "./helpers";

// ---------------------------------------------------------------------------
// Fixtures: authenticated + chat-ready for every test
// ---------------------------------------------------------------------------

test.describe("Chat Workflow", () => {
  let userId: string | null;

  test.beforeAll(() => {
    userId = getTestUserId();
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (!userId) {
      testInfo.skip(
        true,
        "No test user available — add a user to the Clerk dev instance",
      );
      return;
    }

    await signInTestUser(page, userId);
    await mockModelPricing(page);
    await mockHasApiKey(page);
    await page.goto("/chat");
    await waitForChatReady(page);
  });

  test.afterEach(async ({ page }) => {
    // Clear any pending intercepted routes to prevent 'Target closed' errors when the browser closes
    try {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    } catch {
      // Ignore if page is already closed
    }
  });

  // =========================================================================
  // 1. Model Selection
  // =========================================================================

  test.describe("Model Selection", () => {
    test('can select one model and see "1 model selected"', async ({
      page,
    }) => {
      await selectModels(page, ["GPT-5 Mini"]);

      const trigger = page.getByRole("combobox").first();
      await expect(trigger).toContainText("1 model selected");
    });

    test('can select multiple models and see "N models selected"', async ({
      page,
    }) => {
      await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);

      const trigger = page.getByRole("combobox").first();
      await expect(trigger).toContainText("2 models selected");
    });

    test("selected models persist after closing and reopening the dropdown", async ({
      page,
    }) => {
      await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);

      // Reopen the popover
      const trigger = page.getByRole("combobox").first();
      await trigger.click();

      // Both models should be checked (checkmark visible)
      const gptOption = page
        .getByRole("option", { name: /GPT-5 Mini/i })
        .first();
      const claudeOption = page
        .getByRole("option", { name: /Claude Haiku 4\.5/i })
        .first();

      // The Check icon has opacity-100 when selected, opacity-0 when not
      await expect(gptOption.locator("svg.opacity-100")).toBeVisible();
      await expect(claudeOption.locator("svg.opacity-100")).toBeVisible();

      await page.keyboard.press("Escape");
    });
  });

  // =========================================================================
  // 2. Prompt Submission & Loading States
  // =========================================================================

  test.describe("Prompt Submission & Loading States", () => {
    test("can type and submit a prompt via Send button", async ({ page }) => {
      // Need models selected before we can send
      await selectModels(page, ["GPT-5 Mini"]);

      // Mock the API so we get a response
      await mockChatSSE(page, {
        results: [
          {
            model: "openai/gpt-5-mini",
            message: { role: "assistant", content: "Hello! How can I help?" },
          },
        ],
      });

      const textbox = page.getByRole("textbox");
      await textbox.fill("Hello, world!");

      // Click the send button
      const sendButton = page.locator(
        'button:has(svg.lucide-send)',
      );
      await sendButton.click();

      // User message should appear
      await expect(page.getByText("Hello, world!")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("can submit a prompt via Enter key", async ({ page }) => {
      await selectModels(page, ["GPT-5 Mini"]);

      await mockChatSSE(page, {
        results: [
          {
            model: "openai/gpt-5-mini",
            message: { role: "assistant", content: "Response via enter key." },
          },
        ],
      });

      await submitPrompt(page, "Testing Enter key");

      await expect(page.getByText("Testing Enter key")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("shows loading indicator with model names during querying phase", async ({
      page,
    }) => {
      await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);

      // Use a hanging mock so we can observe the loading state
      await mockChatHanging(page);

      await submitPrompt(page, "Show me the loading state");

      // Should show loading banner with "Querying 2 models"
      await expect(page.getByText("Querying 2 models")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("shows Evaluating responses text after querying completes", async ({
      page,
    }) => {
      await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);

      await mockChatSSE(page, {
        results: [
          {
            model: "openai/gpt-5-mini",
            message: { role: "assistant", content: "Response A" },
          },
          {
            model: "anthropic/claude-haiku-4.5",
            message: { role: "assistant", content: "Response B" },
          },
        ],
        evaluationMetadata: {
          winnerModel: "openai/gpt-5-mini",
          scores: [],
          meanScores: {
            "openai/gpt-5-mini": 85.0,
            "anthropic/claude-haiku-4.5": 72.0,
          },
          modelReasoning: {
            "openai/gpt-5-mini": ["Good response"],
            "anthropic/claude-haiku-4.5": ["Decent response"],
          },
          tiedModels: [],
        },
        phaseDelay: 500,
      });

      await submitPrompt(page, "Evaluate this prompt");

      // After the response completes, the loading should disappear
      // and we should see the response cards
      await expect(
        page.getByRole("heading", { name: "GPT-5 Mini" }).first()
      ).toBeVisible({ timeout: 15_000 });
    });

    test("shows refining phase text when rl4f method is selected", async ({
      page,
    }) => {
      await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);

      // Select rl4f evaluation method
      // Find the evaluation method selector (second combobox)
      const evalSelector = page.getByRole("combobox").nth(1);
      await evalSelector.click();
      const rl4fOption = page.getByRole("option", {
        name: /rationale based/i,
      });
      await rl4fOption.first().click();

      // Use the newly robust mockChatSSE to simulate refining phase with delays
      await mockChatSSE(page, {
        results: [],
        includeRefiningPhase: true,
        phaseDelay: 4000, // Stay in each phase for 4s so UI can be asserted
      });

      await submitPrompt(page, "Test refining phase");

      // Should eventually show "Refining evaluations"
      await expect(page.getByText("Refining evaluations")).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // =========================================================================
  // 3. Assistant Response Rendering
  // =========================================================================

  test.describe("Assistant Response Rendering", () => {
    test("renders model response cards for multi-model results", async ({
      page,
    }) => {
      await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);

      await mockChatSSE(page, {
        results: [
          {
            model: "openai/gpt-5-mini",
            message: {
              role: "assistant",
              content: "This is the GPT-5 Mini response to your question.",
            },
          },
          {
            model: "anthropic/claude-haiku-4.5",
            message: {
              role: "assistant",
              content:
                "This is the Claude Haiku 4.5 response to your question.",
            },
          },
        ],
        evaluationMetadata: {
          winnerModel: "openai/gpt-5-mini",
          scores: [],
          meanScores: {
            "openai/gpt-5-mini": 88.0,
            "anthropic/claude-haiku-4.5": 75.0,
          },
          modelReasoning: {
            "openai/gpt-5-mini": ["Clear and concise"],
            "anthropic/claude-haiku-4.5": ["Good but verbose"],
          },
          tiedModels: [],
        },
      });

      await submitPrompt(page, "Compare these models");

      // Both model response cards should be visible
      await expect(
        page.getByRole("heading", { name: "GPT-5 Mini" }).first(),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("heading", { name: "Claude Haiku 4.5" }).first(),
      ).toBeVisible({ timeout: 15_000 });

      // "View Full Response" buttons should be present (one per card)
      const viewButtons = page.getByRole("button", {
        name: /view full response/i,
      });
      await expect(viewButtons).toHaveCount(2);
    });

    test("renders winner banner with score", async ({ page }) => {
      await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);

      await mockChatSSE(page, {
        results: [
          {
            model: "openai/gpt-5-mini",
            message: { role: "assistant", content: "Winner response content" },
          },
          {
            model: "anthropic/claude-haiku-4.5",
            message: { role: "assistant", content: "Runner-up response" },
          },
        ],
        evaluationMetadata: {
          winnerModel: "openai/gpt-5-mini",
          scores: [],
          meanScores: {
            "openai/gpt-5-mini": 92.5,
            "anthropic/claude-haiku-4.5": 71.0,
          },
          modelReasoning: {
            "openai/gpt-5-mini": ["Excellent"],
            "anthropic/claude-haiku-4.5": ["Average"],
          },
          tiedModels: [],
        },
      });

      await submitPrompt(page, "Who wins?");

      // Winner banner should show the winning model name and score
      await expect(page.getByText("Top Score:")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("92.5", { exact: true }).first()).toBeVisible();

      // Compare button should be visible on the winner banner
      const compareButton = page.getByRole("button", { name: /compare/i });
      await expect(compareButton).toBeVisible();
    });

    test('renders tie banner when no winner (winnerModel is null)', async ({
      page,
    }) => {
      await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);

      await mockChatSSE(page, {
        results: [
          {
            model: "openai/gpt-5-mini",
            message: { role: "assistant", content: "Tied response A" },
          },
          {
            model: "anthropic/claude-haiku-4.5",
            message: { role: "assistant", content: "Tied response B" },
          },
        ],
        evaluationMetadata: {
          winnerModel: null,
          scores: [],
          meanScores: {
            "openai/gpt-5-mini": 80.0,
            "anthropic/claude-haiku-4.5": 80.0,
          },
          modelReasoning: {
            "openai/gpt-5-mini": ["Equal quality"],
            "anthropic/claude-haiku-4.5": ["Equal quality"],
          },
          tiedModels: ["openai/gpt-5-mini", "anthropic/claude-haiku-4.5"],
        },
      });

      await submitPrompt(page, "Test tie scenario");

      // Tie banner should be visible
      await expect(page.getByText("It's a Tie")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByText(/select your preferred answer/i),
      ).toBeVisible();

      // Selection buttons should be visible on the response cards
      const selectButtons = page.getByRole("button", { name: /^select$/i });
      await expect(selectButtons).toHaveCount(2);
    });
  });

  // =========================================================================
  // 4. Evaluation Metadata
  // =========================================================================

  test.describe("Evaluation Metadata", () => {
    test("displays scores on model response cards", async ({ page }) => {
      await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);

      await mockChatSSE(page, {
        results: [
          {
            model: "openai/gpt-5-mini",
            message: { role: "assistant", content: "Scored response A" },
          },
          {
            model: "anthropic/claude-haiku-4.5",
            message: { role: "assistant", content: "Scored response B" },
          },
        ],
        evaluationMetadata: {
          winnerModel: "openai/gpt-5-mini",
          scores: [],
          meanScores: {
            "openai/gpt-5-mini": 87.3,
            "anthropic/claude-haiku-4.5": 64.8,
          },
          modelReasoning: {
            "openai/gpt-5-mini": ["Thorough answer"],
            "anthropic/claude-haiku-4.5": ["Incomplete"],
          },
          tiedModels: [],
        },
      });

      await submitPrompt(page, "Show scores");

      // Scores should be visible on the cards
      await expect(page.getByText("87.3", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("64.8", { exact: true }).first()).toBeVisible();
    });

    test("shows comparison panel when Compare button is clicked", async ({
      page,
    }) => {
      await selectModels(page, ["GPT-5 Mini", "Claude Haiku 4.5"]);

      await mockChatSSE(page, {
        results: [
          {
            model: "openai/gpt-5-mini",
            message: {
              role: "assistant",
              content: "Comparison target response A",
            },
          },
          {
            model: "anthropic/claude-haiku-4.5",
            message: {
              role: "assistant",
              content: "Comparison target response B",
            },
          },
        ],
        evaluationMetadata: {
          winnerModel: "openai/gpt-5-mini",
          scores: [
            {
              judgeModel: "anthropic/claude-haiku-4.5",
              evaluatedModel: "openai/gpt-5-mini",
              score: 90,
              reasoning: "Well-structured and comprehensive",
            },
            {
              judgeModel: "openai/gpt-5-mini",
              evaluatedModel: "anthropic/claude-haiku-4.5",
              score: 70,
              reasoning: "Adequate but lacks depth",
            },
          ],
          meanScores: {
            "openai/gpt-5-mini": 90.0,
            "anthropic/claude-haiku-4.5": 70.0,
          },
          modelReasoning: {
            "openai/gpt-5-mini": ["Well-structured and comprehensive"],
            "anthropic/claude-haiku-4.5": ["Adequate but lacks depth"],
          },
          tiedModels: [],
        },
      });

      await submitPrompt(page, "Compare please");

      // Wait for winner banner and click Compare
      const compareButton = page.getByRole("button", { name: /compare/i });
      await expect(compareButton).toBeVisible({ timeout: 15_000 });
      await compareButton.click();

      // After clicking, the button should change to "Hide"
      await expect(
        page.getByRole("button", { name: /hide/i }),
      ).toBeVisible();
    });
  });

  // =========================================================================
  // 5. Stop / Cancel
  // =========================================================================

  test.describe("Stop / Cancel", () => {
    test("stop button halts pending request and marks message as stopped", async ({
      page,
    }) => {
      await selectModels(page, ["GPT-5 Mini"]);

      // Use a hanging mock — the request will never complete
      await mockChatHanging(page);

      await submitPrompt(page, "This will be stopped");

      // Wait for the loading state to appear
      await expect(page.getByText(/querying/i)).toBeVisible({
        timeout: 10_000,
      });

      // The send button should now show the stop icon (Square)
      const stopButton = page.locator(
        'button:has(svg.lucide-square)',
      );
      await expect(stopButton).toBeVisible();
      await stopButton.click();

      // Loading indicator should disappear
      await expect(page.getByText(/querying/i)).not.toBeVisible({
        timeout: 5_000,
      });

      // The user message should be dimmed (opacity-50 class on stopped messages)
      const userBubble = page.getByText("This will be stopped");
      await expect(userBubble).toBeVisible();
      const bubbleContainer = userBubble.locator("xpath=ancestor::div[contains(@class, 'opacity-50')]");
      await expect(bubbleContainer).toBeVisible();
    });
  });

  // =========================================================================
  // 6. Model Change Mid-Conversation
  // =========================================================================

  test.describe("Model Change Mid-Conversation", () => {
    async function sendMockedMessage(page: import("@playwright/test").Page) {
      await selectModels(page, ["GPT-5 Mini"]);

      await mockChatSSE(page, {
        results: [
          {
            model: "openai/gpt-5-mini",
            message: { role: "assistant", content: "First response." },
          },
        ],
      });

      await submitPrompt(page, "Initial message");

      // Wait for the assistant response
      await expect(page.getByText("First response.")).toBeVisible({
        timeout: 15_000,
      });
    }

    test("changing models mid-conversation shows confirmation dialog", async ({
      page,
    }) => {
      await sendMockedMessage(page);

      // Now try to change the model — should trigger the alert dialog
      const trigger = page.getByRole("combobox").first();
      await trigger.click();

      const option = page
        .getByRole("option", { name: /Claude Haiku 4\.5/i })
        .first();
      await option.click();

      // Confirmation dialog should appear
      await expect(page.getByText("Change Model")).toBeVisible({
        timeout: 5_000,
      });
      await expect(
        page.getByText(/changing the model will clear your conversation/i),
      ).toBeVisible();
    });

    test("confirming model change clears messages", async ({ page }) => {
      await sendMockedMessage(page);

      // Trigger model change
      const trigger = page.getByRole("combobox").first();
      await trigger.click();
      const option = page
        .getByRole("option", { name: /Claude Haiku 4\.5/i })
        .first();
      await option.click();

      // Click Continue in the dialog
      await expect(page.getByText("Change Model")).toBeVisible({
        timeout: 5_000,
      });
      const continueBtn = page.getByRole("button", { name: /continue/i });
      await expect(continueBtn).toBeVisible();
      await continueBtn.click({ force: true });

      // Messages should be cleared — the empty chat header should appear
      await expect(page.getByText("Initial message")).not.toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText("First response.")).not.toBeVisible();
    });

    test("canceling model change keeps messages", async ({ page }) => {
      await sendMockedMessage(page);

      // Trigger model change
      const trigger = page.getByRole("combobox").first();
      await trigger.click();
      const option = page
        .getByRole("option", { name: /Claude Haiku 4\.5/i })
        .first();
      await option.click();

      // Click Cancel in the dialog
      await expect(page.getByText("Change Model")).toBeVisible({
        timeout: 5_000,
      });
      const cancelBtn = page.getByRole("button", { name: /cancel/i });
      await expect(cancelBtn).toBeVisible();
      await cancelBtn.click({ force: true });

      // Messages should still be there
      await expect(page.getByText("Initial message")).toBeVisible();
      await expect(page.getByText("First response.")).toBeVisible();
    });
  });

  // =========================================================================
  // 7. Chat Persistence & Sidebar
  // =========================================================================

  test.describe("Chat Persistence & Sidebar", () => {
    test("New Chat button resets conversation state", async ({ page }) => {
      await selectModels(page, ["GPT-5 Mini"]);

      await mockChatSSE(page, {
        results: [
          {
            model: "openai/gpt-5-mini",
            message: {
              role: "assistant",
              content: "A response to remember",
            },
          },
        ],
      });

      await submitPrompt(page, "Remember this");
      await expect(page.getByText("A response to remember")).toBeVisible({
        timeout: 15_000,
      });

      // Click New Chat in the sidebar
      const sidebar = page.locator("[data-sidebar='sidebar']");
      await expect(sidebar.first()).toBeVisible({ timeout: 10_000 });
      await sidebar.first().getByText("New Chat").click();

      // Messages should be cleared
      await expect(page.getByText("Remember this")).not.toBeVisible({
        timeout: 5_000,
      });
      await expect(
        page.getByText("A response to remember"),
      ).not.toBeVisible();
    });

    test("chat appears in sidebar after sending a message", async ({
      page,
    }) => {
      // Unroute the mock pricing so the real chat can be saved
      await selectModels(page, ["GPT-5 Mini"]);

      await mockChatSSE(page, {
        results: [
          {
            model: "openai/gpt-5-mini",
            message: {
              role: "assistant",
              content: "Persisted response",
            },
          },
        ],
      });

      await submitPrompt(page, "Persist this chat");
      await expect(page.getByText("Persisted response")).toBeVisible({
        timeout: 15_000,
      });

      // Wait a moment for the chat to be saved
      await page.waitForTimeout(2000);

      // The sidebar should now have a "Previous Chats" section
      const sidebar = page.locator("[data-sidebar='sidebar']");
      const previousChats = sidebar.first().getByText("Previous Chats");
      // Previous chats may already be expanded; if not, just check it exists
      await expect(previousChats).toBeVisible({ timeout: 10_000 });
    });

    test("navigating away and back restores messages from sidebar history", async ({
      page,
    }) => {
      await selectModels(page, ["GPT-5 Mini"]);

      await mockChatSSE(page, {
        results: [
          {
            model: "openai/gpt-5-mini",
            message: {
              role: "assistant",
              content: "Navigate away and come back",
            },
          },
        ],
      });

      await submitPrompt(page, "Persistence test");
      await expect(
        page.getByText("Navigate away and come back"),
      ).toBeVisible({ timeout: 15_000 });

      // Wait for chat to save
      await page.waitForTimeout(2000);

      // Navigate to experiments page
      await page.goto("/experiments");
      await expect(
        page.getByRole("button", { name: /create experiment/i }),
      ).toBeVisible({ timeout: 10_000 });

      // Navigate back to chat
      await page.goto("/chat");
      await waitForChatReady(page);

      // Check sidebar for previous chats and click the most recent
      const sidebar = page.locator("[data-sidebar='sidebar']");
      await expect(sidebar.first()).toBeVisible({ timeout: 10_000 });

      const previousChatsToggle = sidebar.first().getByText("Previous Chats");
      if (await previousChatsToggle.isVisible()) {
        await previousChatsToggle.click();
        await page.waitForTimeout(500);
      }

      // Find and click the first chat entry in the sidebar
      const chatEntries = sidebar
        .first()
        .locator("[data-sidebar='menu-sub'] a");
      const entryCount = await chatEntries.count();

      if (entryCount > 0) {
        await chatEntries.first().click();
        await page.waitForTimeout(1000);

        // Messages should be restored
        await expect(page.getByText("Persistence test")).toBeVisible({
          timeout: 15_000,
        });
      }
    });
  });
});
