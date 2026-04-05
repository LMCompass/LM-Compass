import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";
import {
  createSignInToken,
  e2eGoto,
  expectPagePath,
  getTestUserId,
} from "./helpers";

function sidebarPeer(page: import("@playwright/test").Page) {
  return page.locator(".group.peer[data-state]").first();
}

/** Desktop sidebar only — avoids the mobile Sheet duplicate `[data-sidebar=sidebar]`. */
function desktopSidebar(page: import("@playwright/test").Page) {
  return page.locator('[data-sidebar="sidebar"]:not([data-mobile="true"])').first();
}

/** Collapse / expand control (size default); logo row uses `data-size="lg"`. */
function headerToggleButton(page: import("@playwright/test").Page) {
  return page.locator(
    '[data-sidebar="header"] button[data-sidebar="menu-button"][data-size="default"]'
  );
}

async function waitForAppPath(
  page: import("@playwright/test").Page,
  pathSuffix: string
) {
  await expectPagePath(page, pathSuffix);
}

// ---------------------------------------------------------------------------
// Authenticated: sidebar navigation links
// ---------------------------------------------------------------------------

test.describe("Sidebar navigation links", () => {
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
    await e2eGoto(page,"/");

    await page.waitForFunction(
      () =>
        (window as unknown as { Clerk?: { loaded: boolean } }).Clerk?.loaded === true,
      null,
      { timeout: 15_000 }
    );

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

    await page.waitForTimeout(1000);
  });

  test("New Chat navigates to /chat", async ({ page }) => {
    await e2eGoto(page,"/experiments");
    const sidebar = desktopSidebar(page);
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    await sidebar.getByText("New Chat").click();
    await waitForAppPath(page, "/chat");
  });

  test("View Rubrics navigates to /rubric/view", async ({ page }) => {
    await e2eGoto(page,"/chat");
    const sidebar = desktopSidebar(page);
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    await sidebar.getByText("View Rubrics").click();
    await waitForAppPath(page, "/rubric/view");
  });

  test("Evaluation Methods navigates to /evaluation-methods", async ({
    page,
  }) => {
    await e2eGoto(page,"/chat");
    const sidebar = desktopSidebar(page);
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    await sidebar.getByText("Evaluation Methods").click();
    await waitForAppPath(page, "/evaluation-methods");
  });

  test("Experiments navigates to /experiments", async ({ page }) => {
    await e2eGoto(page,"/chat");
    const sidebar = desktopSidebar(page);
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    await sidebar.getByText("Experiments").click();
    await waitForAppPath(page, "/experiments");
  });
});

// ---------------------------------------------------------------------------
// Authenticated: sidebar collapse / expand
// ---------------------------------------------------------------------------

test.describe("Sidebar collapse and expand", () => {
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
    await e2eGoto(page,"/");

    await page.waitForFunction(
      () =>
        (window as unknown as { Clerk?: { loaded: boolean } }).Clerk?.loaded === true,
      null,
      { timeout: 15_000 }
    );

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

    await page.waitForTimeout(1000);
    await e2eGoto(page,"/chat");
    await expect(
      page.getByText("Sign in required").or(page.getByRole("textbox"))
    ).toBeVisible({ timeout: 15_000 });
  });

  test("sidebar can be collapsed and expanded", async ({ page }) => {
    const peer = sidebarPeer(page);
    await expect(peer).toHaveAttribute("data-state", "expanded", {
      timeout: 10_000,
    });

    await headerToggleButton(page).click();
    await expect(peer).toHaveAttribute("data-state", "collapsed");

    await headerToggleButton(page).click();
    await expect(peer).toHaveAttribute("data-state", "expanded");
  });

  test("collapsed state persists across navigation", async ({ page }) => {
    const peer = sidebarPeer(page);
    await expect(peer).toHaveAttribute("data-state", "expanded", {
      timeout: 10_000,
    });

    await headerToggleButton(page).click();
    await expect(peer).toHaveAttribute("data-state", "collapsed");

    await e2eGoto(page,"/experiments");
    await expect(peer).toHaveAttribute("data-state", "collapsed", {
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Authenticated: previous chats in sidebar
// ---------------------------------------------------------------------------

test.describe("Sidebar previous chats", () => {
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
    await e2eGoto(page,"/");

    await page.waitForFunction(
      () =>
        (window as unknown as { Clerk?: { loaded: boolean } }).Clerk?.loaded === true,
      null,
      { timeout: 15_000 }
    );

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

    await page.waitForTimeout(1000);
    await e2eGoto(page,"/chat");
    await expect(
      page.getByText("Sign in required").or(page.getByRole("textbox"))
    ).toBeVisible({ timeout: 15_000 });
  });

  test("empty state shows No previous chats when expanded", async ({
    page,
  }) => {
    const sidebar = desktopSidebar(page);
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    await sidebar.getByRole("button", { name: /previous chats/i }).click();
    await expect(sidebar.getByText("No previous chats")).toBeVisible();
  });

  test("rename a chat inline when history exists", async ({ page }) => {
    const sidebar = desktopSidebar(page);
    await sidebar.getByRole("button", { name: /previous chats/i }).click();

    const firstChatRow = sidebar
      .locator('ul[data-sidebar="menu-sub"] > li')
      .first();
    if (!(await firstChatRow.isVisible().catch(() => false))) {
      test.skip(true, "No chat history items to rename");
      return;
    }

    await firstChatRow.hover();
    const editBtn = sidebar.getByRole("button", { name: "Edit chat title" });
    await editBtn.first().click();
    const newTitle = `E2E rename ${Date.now()}`;
    const input = sidebar.locator("input").first();
    await input.fill(newTitle);
    await input.press("Enter");

    await expect(sidebar.getByText(newTitle)).toBeVisible({ timeout: 10_000 });
  });

  test("delete a chat shows confirmation and removes after confirm", async ({
    page,
  }) => {
    const sidebar = desktopSidebar(page);
    await sidebar.getByRole("button", { name: /previous chats/i }).click();

    const firstChatRow = sidebar
      .locator('ul[data-sidebar="menu-sub"] > li')
      .first();
    if (!(await firstChatRow.isVisible().catch(() => false))) {
      test.skip(true, "No chat history items to delete");
      return;
    }

    await firstChatRow.hover();
    const deleteBtn = sidebar.getByRole("button", { name: "Delete chat" });

    const titleBefore = await sidebar
      .locator('[data-sidebar="menu-sub-button"] span')
      .first()
      .textContent();

    await deleteBtn.first().click();
    await expect(
      page.getByRole("alertdialog").getByText("Delete chat")
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    if (titleBefore) {
      await expect(sidebar.getByText(titleBefore.trim())).not.toBeVisible({
        timeout: 10_000,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Authenticated: evaluation methods page
// ---------------------------------------------------------------------------

test.describe("Evaluation methods page", () => {
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
    await e2eGoto(page,"/");

    await page.waitForFunction(
      () =>
        (window as unknown as { Clerk?: { loaded: boolean } }).Clerk?.loaded === true,
      null,
      { timeout: 15_000 }
    );

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

    await page.waitForTimeout(1000);
  });

  test("renders all four evaluation method descriptions", async ({ page }) => {
    await e2eGoto(page,"/evaluation-methods");

    await expect(
      page.getByRole("heading", { name: "Evaluation methods" })
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole("heading", {
        name: "Prompt-based scoring",
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "One-Shot Prompt-based scoring" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Rationale-Based Self-Critique Loops (RL4F)",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Human-in-the-loop (HITL) rubric refinement",
      })
    ).toBeVisible();
  });

  test("Back to Chat navigates to /chat", async ({ page }) => {
    await e2eGoto(page,"/evaluation-methods");
    await expect(
      page.getByRole("link", { name: /back to chat/i })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("link", { name: /back to chat/i }).click();
    await waitForAppPath(page, "/chat");
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated: landing page navigation
// ---------------------------------------------------------------------------

test.describe("Landing page navigation", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("navbar How It Works scrolls to section", async ({ page }) => {
    await setupClerkTestingToken({ page });
    await e2eGoto(page,"/");

    await page
      .getByRole("navigation")
      .getByRole("button", { name: "How It Works" })
      .click();
    await page.waitForTimeout(800);
    await expect(page.locator("#how-it-works")).toBeInViewport();
  });

  test("navbar Features scrolls to section", async ({ page }) => {
    await setupClerkTestingToken({ page });
    await e2eGoto(page,"/");

    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Features" })
      .click();
    await page.waitForTimeout(800);
    await expect(page.locator("#features")).toBeInViewport();
  });

  test("navbar Get Started navigates to /chat", async ({ page }) => {
    await setupClerkTestingToken({ page });
    await e2eGoto(page,"/");

    await page
      .getByRole("navigation")
      .getByRole("link", { name: /get started/i })
      .click();
    await waitForAppPath(page, "/chat");
  });

  test("hero Start Evaluating navigates to /chat", async ({ page }) => {
    await setupClerkTestingToken({ page });
    await e2eGoto(page,"/");

    await page
      .getByRole("main")
      .getByRole("link", { name: /start evaluating/i })
      .click();
    await waitForAppPath(page, "/chat");
  });

  test("hero Learn More scrolls to features", async ({ page }) => {
    await setupClerkTestingToken({ page });
    await e2eGoto(page,"/");

    await page.getByRole("button", { name: "Learn More" }).click();
    await page.waitForTimeout(800);
    await expect(page.locator("#features")).toBeInViewport();
  });
});
