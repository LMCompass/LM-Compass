import { test, expect } from "@playwright/test";
import path from "node:path";
import { getTestUserId, signInAsTestUser } from "./clerk-auth";

const FIXTURES = path.resolve(__dirname, "fixtures");

const experimentCsv = path.join(FIXTURES, "experiment-query.csv");
const noValidQueriesCsv = path.join(FIXTURES, "no-valid-queries.csv");
const emptyCsv = path.join(FIXTURES, "empty.csv");
const sampleParquet = path.join(FIXTURES, "alltypes_plain.parquet");

test.describe("Experiment upload wizard (authenticated)", () => {
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

  test("CSV upload via file picker lists column headers and maps preview", async ({
    page,
  }) => {
    await page.goto("/experiments/upload");

    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await expect(flow.getByRole("heading", { name: /upload dataset/i })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(experimentCsv);

    await expect(flow.getByText(/experiment-query\.csv/i)).toBeVisible();
    await expect(flow.getByText(/2 rows.*2 columns/i)).toBeVisible();

    await expect(flow.getByRole("heading", { name: /^preview$/i })).not.toBeVisible();

    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();

    await expect(flow.getByRole("heading", { name: /preview/i })).toBeVisible();
    await expect(flow.getByText(/showing the first 2 of 2 rows/i)).toBeVisible();
    await expect(flow.getByText("What is 2+2?", { exact: false })).toBeVisible();
    await expect(flow.getByText("What is the capital of France?", { exact: false })).toBeVisible();
  });

  test("CSV upload via drag-and-drop parses file", async ({ page }) => {
    await page.goto("/experiments/upload");

    const dropZone = page
      .locator('[data-tour-id="experiment-create-flow"]')
      .locator(".border-dashed")
      .filter({ hasText: /drag & drop/i });
    const fileBuffer = await import("node:fs/promises").then((fs) =>
      fs.readFile(experimentCsv)
    );

    await dropZone.evaluate(
      (el, { bytes }: { bytes: number[] }) => {
        const u8 = new Uint8Array(bytes);
        const file = new File([u8], "experiment-query.csv", { type: "text/csv" });
        const dt = new DataTransfer();
        dt.items.add(file);
        el.dispatchEvent(
          new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt })
        );
      },
      { bytes: Array.from(fileBuffer) }
    );

    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await expect(flow.getByText(/experiment-query\.csv/i)).toBeVisible();
    await expect(flow.getByText(/2 rows.*2 columns/i)).toBeVisible();
  });

  test("Parquet upload lists column headers from schema", async ({ page }) => {
    await page.goto("/experiments/upload");

    await page.locator('input[type="file"]').setInputFiles(sampleParquet);

    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await expect(flow.getByText(/alltypes_plain\.parquet/i)).toBeVisible();

    await flow.getByRole("combobox").nth(0).click();
    await expect(
      page.getByRole("option", { name: "string_col", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("option", { name: "id", exact: true })).toBeVisible();
  });

  test("ground truth mapping is optional; preview adds column when GT is selected", async ({
    page,
  }) => {
    await page.goto("/experiments/upload");

    await page.locator('input[type="file"]').setInputFiles(experimentCsv);

    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();

    await expect(flow.getByRole("columnheader", { name: /ground truth/i })).not.toBeVisible();

    await flow.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "expected_answer" }).click();

    await expect(flow.getByRole("columnheader", { name: /ground truth/i })).toBeVisible();
    await expect(flow.getByRole("cell", { name: "4" })).toBeVisible();
    await expect(flow.getByRole("cell", { name: "Paris" })).toBeVisible();
  });

  test("model count 2–4: helper shows validation until two models are selected", async ({
    page,
  }) => {
    await page.goto("/experiments/upload");

    await page.locator('input[type="file"]').setInputFiles(experimentCsv);
    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();

    const hint = flow.getByText(/select between 2 and 4 models/i);
    await expect(hint).toBeVisible();

    await flow.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: /GPT-5\.4/i }).click();
    await page.keyboard.press("Escape");

    await expect(hint).toHaveClass(/text-destructive/);

    await flow.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: /GPT-5\.2/i }).click();
    await page.keyboard.press("Escape");

    await expect(hint).not.toHaveClass(/text-destructive/);
  });

  test("evaluation method options exclude HITL", async ({ page }) => {
    await page.goto("/experiments/upload");

    await page.locator('input[type="file"]').setInputFiles(experimentCsv);
    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();

    await flow.getByRole("combobox").nth(4).click();
    const options = page.getByRole("option");
    await expect(options).toHaveCount(3);
    await expect(page.getByRole("option", { name: /hitl/i })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("RL4F shows refinement iterations selector", async ({ page }) => {
    await page.goto("/experiments/upload");

    await page.locator('input[type="file"]').setInputFiles(experimentCsv);
    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();

    await expect(flow.getByText(/refinement iterations/i)).not.toBeVisible();

    await flow.getByRole("combobox").nth(4).click();
    await page
      .getByRole("option", { name: /rationale based self critique loops/i })
      .click();

    await expect(flow.getByText(/refinement iterations/i)).toBeVisible();
    await expect(flow.getByRole("combobox").nth(5)).toBeVisible();
  });

  test("Start Experiment opens cost dialog with per-model breakdown", async ({
    page,
  }) => {
    await page.goto("/experiments/upload");

    await page.locator('input[type="file"]').setInputFiles(experimentCsv);
    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();

    await flow.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: /GPT-5\.4/i }).click();
    await page.getByRole("option", { name: /GPT-5\.2/i }).click();
    await page.keyboard.press("Escape");

    const estimatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/experiments/estimate") && res.status() === 200
    );

    await flow.getByRole("button", { name: /start experiment/i }).click();
    const res = await estimatePromise;
    const body = (await res.json()) as { perModelEstimates?: unknown[] };
    expect(Array.isArray(body.perModelEstimates)).toBe(true);
    expect(body.perModelEstimates?.length).toBeGreaterThanOrEqual(2);

    await expect(page.getByRole("dialog", { name: /estimated cost/i })).toBeVisible();
    await expect(page.getByText(/per-model estimate/i)).toBeVisible();
    await expect(page.getByTestId("experiment-estimate-per-model-row")).toHaveCount(
      body.perModelEstimates?.length ?? 0
    );

    await page
      .getByRole("dialog", { name: /estimated cost/i })
      .getByRole("button", { name: /^cancel$/i })
      .click();
    await expect(page.getByRole("dialog", { name: /estimated cost/i })).not.toBeVisible();
  });

  test("starting an experiment navigates to the dashboard with Running status", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/experiments/upload");

    await page.locator('input[type="file"]').setInputFiles(experimentCsv);
    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();

    await flow.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: /GPT-5\.4/i }).click();
    await page.getByRole("option", { name: /GPT-5\.2/i }).click();
    await page.keyboard.press("Escape");

    await flow.getByRole("button", { name: /start experiment/i }).click();
    await expect(page.getByRole("dialog", { name: /estimated cost/i })).toBeVisible({
      timeout: 60_000,
    });

    await page
      .getByRole("dialog", { name: /estimated cost/i })
      .getByRole("button", { name: /start experiment/i })
      .click();

    await page.waitForURL(
      (url) => {
        const m = url.pathname.match(/^\/experiments\/([^/]+)$/);
        return m != null && m[1] !== "upload";
      },
      { timeout: 90_000 }
    );

    await expect(page.getByText(/running/i).first()).toBeVisible({ timeout: 45_000 });
  });

  test("no valid query rows: estimate shows error", async ({ page }) => {
    await page.goto("/experiments/upload");

    await page.locator('input[type="file"]').setInputFiles(noValidQueriesCsv);
    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();

    await flow.getByRole("combobox").nth(2).click();
    await page.getByRole("option", { name: /GPT-5\.4/i }).click();
    await page.getByRole("option", { name: /GPT-5\.2/i }).click();
    await page.keyboard.press("Escape");

    await flow.getByRole("button", { name: /start experiment/i }).click();

    await expect(
      page.getByText(/no valid rows found/i)
    ).toBeVisible({ timeout: 60_000 });
  });

  test("empty file upload shows validation error", async ({ page }) => {
    await page.goto("/experiments/upload");

    await page.locator('input[type="file"]').setInputFiles(emptyCsv);

    await expect(page.getByText(/file is empty/i)).toBeVisible();
  });

  test("cannot start without required selections: Start Experiment disabled", async ({
    page,
  }) => {
    await page.goto("/experiments/upload");

    await page.locator('input[type="file"]').setInputFiles(experimentCsv);
    const flow = page.locator('[data-tour-id="experiment-create-flow"]');
    await flow.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "question" }).click();

    const startBtn = flow.getByRole("button", { name: /start experiment/i });
    await expect(startBtn).toBeDisabled();
  });
});
