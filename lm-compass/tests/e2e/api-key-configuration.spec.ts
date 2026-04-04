import { test, expect } from "@playwright/test";
import {
  getTestUserId,
  signInTestUser,
  mockModelPricing,
  mockApiKeyConfigurationFlow,
} from "./helpers";

const VALID_KEY = `sk-or-v1-${"a".repeat(64)}`;
const INVALID_KEY = "invalid-key-format";

async function closeSettingsDialogIfOpen(page: import("@playwright/test").Page) {
  const dialog = page.getByRole("dialog", { name: "API Configuration" });

  // The dialog can auto-open shortly after /chat loads for users without a key.
  await page.waitForTimeout(750);

  if (await dialog.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  }
}

async function openSettingsFromSidebarUserMenu(
  page: import("@playwright/test").Page,
) {
  await closeSettingsDialogIfOpen(page);

  const userButtonTrigger = page
    .locator("[data-sidebar='footer']")
    .locator("button")
    .first();
  await expect(userButtonTrigger).toBeVisible({ timeout: 10_000 });
  await userButtonTrigger.click();
  await expect(page.getByText("OpenRouter Key")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByText("OpenRouter Key").click();
}

test.describe("API Key Configuration", () => {
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
    await mockApiKeyConfigurationFlow(page, { initialHasKey: false });
  });

  test.afterEach(async ({ page }) => {
    try {
      await page.unrouteAll({ behavior: "ignoreErrors" });
    } catch {
      // Ignore if page already closed
    }
  });

  test("banner -> settings validation -> successful save enables chat and persists across navigation", async ({
    page,
  }) => {
    await page.goto("/chat");
    await closeSettingsDialogIfOpen(page);

    await expect(page.getByText("API key required")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByPlaceholder("Ask me anything...")).not.toBeVisible();

    await expect(page.getByRole("button", { name: "Add API Key" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Add API Key" }).click();
    await expect(
      page.getByRole("heading", { name: "API Configuration" }),
    ).toBeVisible();

    await page.getByLabel("OpenRouter API Key").fill(INVALID_KEY);
    await page.getByRole("button", { name: "Save Key" }).click();

    await expect(page.getByText(/invalid api key format/i)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "API Configuration" }),
    ).toBeVisible();

    await page.getByLabel("OpenRouter API Key").fill(VALID_KEY);
    await page.getByRole("button", { name: "Save Key" }).click();

    await expect(
      page.getByRole("heading", { name: "API Configuration" }),
    ).not.toBeVisible();
    await expect(page.getByText("API key required")).not.toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("textbox")).toBeVisible({ timeout: 15_000 });

    await page.goto("/experiments");
    await expect(
      page.getByRole("button", { name: /create experiment/i }),
    ).toBeVisible({ timeout: 10_000 });

    await page.goto("/chat");
    await expect(page.getByText("API key required")).not.toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("textbox")).toBeVisible({ timeout: 15_000 });
  });

  test("settings dialog from sidebar user menu validates and saves key the same way", async ({
    page,
  }) => {
    await page.goto("/chat");
    await closeSettingsDialogIfOpen(page);
    await expect(page.getByText("API key required")).toBeVisible({
      timeout: 15_000,
    });

    await openSettingsFromSidebarUserMenu(page);

    await expect(
      page.getByRole("heading", { name: "API Configuration" }),
    ).toBeVisible();

    await page.getByLabel("OpenRouter API Key").fill(INVALID_KEY);
    await page.getByRole("button", { name: "Save Key" }).click();
    await expect(page.getByText(/invalid api key format/i)).toBeVisible();

    await page.getByLabel("OpenRouter API Key").fill(VALID_KEY);
    await page.getByRole("button", { name: "Save Key" }).click();

    await expect(
      page.getByRole("heading", { name: "API Configuration" }),
    ).not.toBeVisible();
    await expect(page.getByText("API key required")).not.toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("textbox")).toBeVisible({ timeout: 15_000 });
  });
});
