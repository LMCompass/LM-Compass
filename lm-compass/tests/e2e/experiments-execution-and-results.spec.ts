import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { getTestUserId, signInAsTestUser } from "./clerk-auth";
import {
  mockRunItemFourModels,
  mockRunItemTwoModels,
} from "./experiment-run-item-mock";

const FIXTURES = path.resolve(__dirname, "fixtures");
const experimentCsvBuffer = fs.readFileSync(
  path.join(FIXTURES, "experiment-query.csv")
);
const deleteOneRowCsvBuffer = fs.readFileSync(
  path.join(FIXTURES, "e2e-delete-one-row.csv")
);

function uniqueExperimentTitle(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function setExperimentQueryCsv(
  page: import("@playwright/test").Page,
  titleBase: string
) {
  await page.locator('input[type="file"]').setInputFiles({
    name: `${titleBase}.csv`,
    mimeType: "text/csv",
    buffer: experimentCsvBuffer,
  });
}

async function setDeleteOneRowCsv(
  page: import("@playwright/test").Page,
  titleBase: string
) {
  await page.locator('input[type="file"]').setInputFiles({
    name: `${titleBase}.csv`,
    mimeType: "text/csv",
    buffer: deleteOneRowCsvBuffer,
  });
}

function experimentDashboardHeader(page: import("@playwright/test").Page) {
  return page.getByRole("main").locator("header").first();
}

async function openCostDialogAndStart(page: import("@playwright/test").Page) {
  const flow = page.locator('[data-tour-id="experiment-create-flow"]');
  await flow.getByRole("button", { name: /start experiment/i }).click();
  await expect(page.getByRole("dialog", { name: /estimated cost/i })).toBeVisible({
    timeout: 60_000,
  });
  await page
    .getByRole("dialog", { name: /estimated cost/i })
    .getByRole("button", { name: /start experiment/i })
    .click();
}

async function waitForExperimentDashboard(page: import("@playwright/test").Page) {
  await page.waitForURL(
    (url) => {
      const m = url.pathname.match(/^\/experiments\/([^/]+)$/);
      return m != null && m[1] !== "upload";
    },
    { timeout: 90_000 }
  );
}

test.describe.configure({ mode: "serial" });

test.describe("Experiment execution and results", () => {
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
    await signInAsTestUser(page, userId);
  });

  test("dashboard shows completed, results, detail dialog, and export", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await page.route("**/api/experiments/run-item", async (route) => {
      const body = route.request().postDataJSON() as {
        input_query?: string;
        models?: string[];
      };
      const models = Array.isArray(body.models) ? body.models : [];
      const q = body.input_query ?? "";
      const delayMs = q.toLowerCase().includes("france") ? 80 : 900;
      await new Promise((r) => setTimeout(r, delayMs));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockRunItemTwoModels(models)),
      });
    });

    const titleBase = uniqueExperimentTitle("experiment-query");

    await page.goto("/experiments/upload");
    await setExperimentQueryCsv(page, titleBase);
    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();

    await flow.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "expected_answer" }).click();

    await flow.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: /GPT-5\.4/i }).click();
    await page.getByRole("option", { name: /GPT-5\.2/i }).click();
    await page.keyboard.press("Escape");

    await flow.getByRole("combobox").nth(4).click();
    await page.getByRole("option", { name: /one-shot prompt-based scoring/i }).click();

    await openCostDialogAndStart(page);
    await waitForExperimentDashboard(page);

    await expect(
      experimentDashboardHeader(page).getByText("Completed", { exact: true })
    ).toBeVisible({
      timeout: 120_000,
    });

    await expect(page.getByRole("heading", { name: /average score by model/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /queries won by model/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /model performance summary/i })).toBeVisible();

    const summaryTable = page
      .locator("div.rounded-xl")
      .filter({ has: page.getByRole("heading", { name: /model performance summary/i }) })
      .first();
    await expect(summaryTable.getByRole("columnheader", { name: /metric/i })).toBeVisible();
    await expect(summaryTable.getByRole("cell", { name: /average score/i })).toBeVisible();
    await expect(summaryTable.getByRole("cell", { name: /win rate/i })).toBeVisible();

    await page.getByRole("row", { name: /France/i }).click();
    const detail = page.getByRole("dialog", { name: /experiment item details/i });
    await expect(detail.getByRole("heading", { name: /^query$/i })).toBeVisible();
    await expect(detail.getByText(/What is the capital of France/i)).toBeVisible();
    await expect(detail.getByRole("heading", { name: /expected output/i })).toBeVisible();
    await expect(detail.getByText("Paris")).toBeVisible();
    await expect(detail.getByRole("heading", { name: /model outputs/i })).toBeVisible();
    await expect(detail.locator(".prose strong")).toContainText(/bold/i);
    await expect(detail.locator(".prose em")).toBeVisible();
    await expect(detail.getByRole("heading", { name: /^reasoning$/i })).toBeVisible();
    await expect(detail.getByText(/clearer for this query/i)).toBeVisible();
    await detail.getByRole("button", { name: "Close" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /export report/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename().toLowerCase().endsWith(".pdf")).toBe(true);
  });

  test("experiment list shows title, status, created date, and row opens dashboard", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await page.route("**/api/experiments/run-item", async (route) => {
      const body = route.request().postDataJSON() as { models?: string[] };
      const models = Array.isArray(body.models) ? body.models : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockRunItemTwoModels(models)),
      });
    });

    const titleBase = uniqueExperimentTitle("experiment-query");

    await page.goto("/experiments/upload");
    await setExperimentQueryCsv(page, titleBase);
    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();
    await flow.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: /GPT-5\.4/i }).click();
    await page.getByRole("option", { name: /GPT-5\.2/i }).click();
    await page.keyboard.press("Escape");

    await openCostDialogAndStart(page);
    await waitForExperimentDashboard(page);
    await expect(
      experimentDashboardHeader(page).getByText("Completed", { exact: true })
    ).toBeVisible({
      timeout: 120_000,
    });
    const dashboardUrl = page.url();

    await page.goto("/experiments");
    const overview = page.locator('[data-tour-id="experiments-overview"]');
    await expect(overview.getByRole("columnheader", { name: /^title$/i })).toBeVisible();
    await expect(overview.getByRole("columnheader", { name: /^status$/i })).toBeVisible();
    await expect(overview.getByRole("columnheader", { name: /^created$/i })).toBeVisible();

    const row = overview.getByRole("row").filter({ hasText: titleBase }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText("Completed", { exact: true })).toBeVisible({ timeout: 120_000 });
    await expect(row.getByText(/\w{3}\s+\d{1,2},\s+\d{4}/)).toBeVisible();

    await row.click();
    await expect(page).toHaveURL(dashboardUrl);
  });

  test("Kendall's tau-b section with four models shows judge pair table", async ({ page }) => {
    test.setTimeout(180_000);

    await page.route("**/api/experiments/run-item", async (route) => {
      const body = route.request().postDataJSON() as { models?: string[] };
      const models = Array.isArray(body.models) ? body.models : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockRunItemFourModels(models)),
      });
    });

    const titleBase = uniqueExperimentTitle("experiment-query");

    await page.goto("/experiments/upload");
    await setExperimentQueryCsv(page, titleBase);
    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();

    await flow.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: /GPT-5\.4/i }).click();
    await page.getByRole("option", { name: /GPT-5\.2/i }).click();
    await page.getByRole("option", { name: /GPT-5\.1/i }).click();
    await page.getByRole("option", { name: /GPT-5 Mini/i }).click();
    await page.keyboard.press("Escape");

    await expect(flow.getByText(/kendall.*tau-b.*enabled/i)).toBeVisible();

    await openCostDialogAndStart(page);
    await waitForExperimentDashboard(page);

    await expect(
      experimentDashboardHeader(page).getByText("Completed", { exact: true })
    ).toBeVisible({
      timeout: 120_000,
    });

    const kendall = page.getByRole("heading", { name: /judge agreement.*kendall/i });
    await expect(kendall).toBeVisible();
    const kSection = page
      .locator("div.rounded-xl")
      .filter({ has: kendall })
      .first();
    await expect(kSection.getByRole("columnheader", { name: /^judge a$/i })).toBeVisible();
    await expect(kSection.getByRole("columnheader", { name: /^judge b$/i })).toBeVisible();
    await expect(kSection.getByRole("columnheader", { name: /^tau-b$/i })).toBeVisible();
    await expect(kSection.getByRole("cell").filter({ hasText: /^\d+\.\d{3}$/ }).first()).toBeVisible();
  });

  test("delete experiment confirms in dialog and removes row", async ({ page }) => {
    test.setTimeout(180_000);

    await page.route("**/api/experiments/run-item", async (route) => {
      const body = route.request().postDataJSON() as { models?: string[] };
      const models = Array.isArray(body.models) ? body.models : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockRunItemTwoModels(models)),
      });
    });

    const titleBase = uniqueExperimentTitle("e2e-delete-one-row");

    await page.goto("/experiments/upload");
    await setDeleteOneRowCsv(page, titleBase);
    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();
    await flow.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: /GPT-5\.4/i }).click();
    await page.getByRole("option", { name: /GPT-5\.2/i }).click();
    await page.keyboard.press("Escape");

    await openCostDialogAndStart(page);
    await waitForExperimentDashboard(page);

    await expect(
      experimentDashboardHeader(page).getByText("Completed", { exact: true })
    ).toBeVisible({
      timeout: 120_000,
    });

    await page.goto("/experiments");
    const overview = page.locator('[data-tour-id="experiments-overview"]');
    const row = overview.getByRole("row").filter({ hasText: titleBase }).first();
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: /delete experiment/i }).click();
    await expect(page.getByRole("alertdialog", { name: /delete experiment/i })).toBeVisible();
    await expect(page.getByText(/permanently delete this experiment/i)).toBeVisible();

    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /^delete$/i })
      .click();
    await expect(overview.getByRole("row").filter({ hasText: titleBase })).toHaveCount(0);
  });

  test("partial run-item failures complete experiment and show per-row error state", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await page.route("**/api/experiments/run-item", async (route) => {
      const body = route.request().postDataJSON() as {
        input_query?: string;
        models?: string[];
      };
      const models = Array.isArray(body.models) ? body.models : [];
      const q = body.input_query ?? "";
      if (q.includes("2+2")) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Simulated partial failure for E2E." }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockRunItemTwoModels(models)),
      });
    });

    const titleBase = uniqueExperimentTitle("experiment-query");

    await page.goto("/experiments/upload");
    await setExperimentQueryCsv(page, titleBase);
    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();
    await flow.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: /GPT-5\.4/i }).click();
    await page.getByRole("option", { name: /GPT-5\.2/i }).click();
    await page.keyboard.press("Escape");

    await openCostDialogAndStart(page);
    await waitForExperimentDashboard(page);

    await expect(
      experimentDashboardHeader(page).getByText("Completed", { exact: true })
    ).toBeVisible({
      timeout: 120_000,
    });

    await expect(page.getByRole("row", { name: /2\+2/i }).getByText("Error", { exact: true })).toBeVisible();
    await expect(page.getByRole("row", { name: /France/i }).getByText("Completed", { exact: true })).toBeVisible();

    await page.getByRole("row", { name: /2\+2/i }).click();
    const detail = page.getByRole("dialog", { name: /experiment item details/i });
    await expect(detail.getByRole("heading", { name: /row error/i })).toBeVisible();
    await expect(detail.getByText(/simulated partial failure/i)).toBeVisible();
  });
});
