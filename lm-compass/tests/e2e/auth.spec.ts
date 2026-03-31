import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const TEST_USER_FILE = path.resolve(__dirname, ".test-user.json");

function getTestUserId(): string | null {
  try {
    const data = JSON.parse(fs.readFileSync(TEST_USER_FILE, "utf-8"));
    return data.userId ?? null;
  } catch {
    return null;
  }
}

/**
 * Creates a one-time sign-in token via the Clerk Backend API.
 * This bypasses all configured auth strategies (password, OAuth, etc.)
 * and works with any existing user.
 */
async function createSignInToken(userId: string): Promise<string> {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create sign-in token: ${res.status} ${err}`);
  }

  const { token } = await res.json();
  return token;
}

// ---------------------------------------------------------------------------
// Unauthenticated tests
// ---------------------------------------------------------------------------

test.describe("Unauthenticated access", () => {
  test("landing page is accessible and Get Started links to /chat", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: /get started/i }).first()
    ).toBeVisible();

    await page.getByRole("link", { name: /get started/i }).first().click();
    await page.waitForURL("**/chat", { timeout: 15_000 });
  });

  test("chat page shows sign-in prompt when unauthenticated", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/chat");

    await expect(page.getByText("Sign in required")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in/i })
    ).toBeVisible();
    await expect(page.getByRole("textbox")).not.toBeVisible();
  });

  test("/experiments renders but shows empty state when unauthenticated", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/experiments");

    await expect(page.getByText("Create Experiment")).toBeVisible();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(0);
  });

  test("/rubric/view renders but shows empty state when unauthenticated", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/rubric/view");

    await page.waitForLoadState("networkidle");
    const addButton = page.getByRole("button", { name: /add/i });
    const emptyPrompt = page.getByText(/add your first rubric/i);
    const eitherVisible = addButton.or(emptyPrompt);
    await expect(eitherVisible.first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Authenticated tests — use Clerk Backend API sign-in tokens
// ---------------------------------------------------------------------------

test.describe("Authenticated access", () => {
  let userId: string | null;

  test.beforeAll(() => {
    userId = getTestUserId();
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (!userId) {
      testInfo.skip(
        true,
        "No test user available — add a user to the Clerk dev instance"
      );
      return;
    }

    const ticket = await createSignInToken(userId);

    await setupClerkTestingToken({ page });
    await page.goto("/");

    // Wait for Clerk to fully initialize
    await page.waitForFunction(
      () => (window as unknown as { Clerk?: { loaded: boolean } }).Clerk?.loaded === true,
      null,
      { timeout: 15_000 }
    );

    // Sign in via the ticket strategy (bypasses password/OAuth requirements)
    await page.evaluate(async (t) => {
      const clerk = (
        window as unknown as {
          Clerk: {
            client: {
              signIn: {
                create: (params: {
                  strategy: string;
                  ticket: string;
                }) => Promise<{ createdSessionId: string }>;
              };
            };
            setActive: (params: { session: string }) => Promise<void>;
          };
        }
      ).Clerk;
      const signIn = await clerk.client.signIn.create({
        strategy: "ticket",
        ticket: t,
      });
      await clerk.setActive({ session: signIn.createdSessionId });
    }, ticket);

    // Wait for auth state to propagate
    await page.waitForTimeout(1000);
  });

  test("authenticated user sees prompt input or API key banner on /chat", async ({
    page,
  }) => {
    await page.goto("/chat");

    await expect(page.getByText("Sign in required")).not.toBeVisible();

    const promptInput = page.getByRole("textbox");
    const apiKeyBanner = page.getByText("API key required");
    const eitherVisible = promptInput.or(apiKeyBanner);
    await expect(eitherVisible.first()).toBeVisible({ timeout: 15_000 });
  });

  test("authenticated user can access /experiments", async ({ page }) => {
    await page.goto("/experiments");

    await expect(
      page.getByRole("button", { name: /create experiment/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("authenticated user can access /rubric/view", async ({ page }) => {
    await page.goto("/rubric/view");

    const addButton = page.getByRole("button", { name: /add/i });
    const emptyPrompt = page.getByText(/add your first rubric/i);
    const eitherVisible = addButton.or(emptyPrompt);
    await expect(eitherVisible.first()).toBeVisible({ timeout: 10_000 });
  });

  test("sidebar navigation links are available", async ({ page }) => {
    await page.goto("/chat");

    const sidebar = page.locator("[data-sidebar='sidebar']");
    await expect(sidebar.first()).toBeVisible({ timeout: 10_000 });

    await expect(sidebar.first().getByText("New Chat")).toBeVisible();
    await expect(sidebar.first().getByText("View Rubrics")).toBeVisible();
    await expect(sidebar.first().getByText("Evaluation Methods")).toBeVisible();
    await expect(sidebar.first().getByText("Experiments")).toBeVisible();
  });
});
