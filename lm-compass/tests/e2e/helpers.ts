import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import type { EvaluationMetadata } from "../../lib/evaluation/types";
import type { RL4FIterationResult } from "../../lib/evaluation/rl4f-evaluator";

/**
 * Assert full URL ends with this pathname (e.g. /chat). Avoids Playwright's glob pattern
 * where ** and /chat are concatenated (that pattern does not match root paths like /chat).
 */
export function pathnameUrlRegex(pathSuffix: string): RegExp {
  const pathname = pathSuffix.startsWith("/")
    ? pathSuffix
    : `/${pathSuffix}`;
  const escaped = pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(\\?.*)?(#.*)?$`);
}

export async function expectPagePath(
  page: Page,
  pathSuffix: string,
  options?: { timeout?: number }
) {
  await expect(page).toHaveURL(pathnameUrlRegex(pathSuffix), {
    timeout: options?.timeout ?? 15_000,
  });
}

/**
 * Next.js dev + parallel Playwright workers often abort navigations that wait for "load".
 * Use domcontentloaded + short retries so tests stay stable.
 */
export async function e2eGoto(page: Page, url: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      return;
    } catch (e) {
      lastError = e;
      await page.waitForTimeout(500 * (attempt + 1));
    }
  }
  throw lastError;
}

/**
 * On /chat, first-time users get an onboarding overlay that sits above the sidebar and can
 * swallow clicks, so sidebar `router.push` never runs. Skip the tour before sidebar nav tests.
 *
 * Route-transition steps use a card without role=dialog; handle that Skip too.
 */
export async function dismissOnboardingTourIfPresent(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Onboarding tour" });
  const transition = page.getByText("Press The Highlighted Button");
  await dialog
    .or(transition)
    .waitFor({ state: "visible", timeout: 3_000 })
    .catch(() => {});

  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: /^Skip$/ }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    return;
  }

  if (await transition.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /^Skip$/ }).first().click();
    await expect(transition).toBeHidden({ timeout: 15_000 });
  }
}

/** Navigate to chat and ensure the onboarding overlay is not blocking the sidebar. */
export async function e2eGotoChatReady(page: Page) {
  await e2eGoto(page, "/chat");
  await expect(page.getByTestId("onboarding-eligibility")).toHaveAttribute(
    "data-loading",
    "false",
    { timeout: 15_000 }
  );
  await dismissOnboardingTourIfPresent(page);
}

export const TEST_USER_FILE = path.resolve(__dirname, ".test-user.json");

export function getTestUserId(): string | null {
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
export async function createSignInToken(userId: string): Promise<string> {
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

export async function signInTestUser(page: Page, userId: string) {
  const ticket = await createSignInToken(userId);

  await setupClerkTestingToken({ page });
  await page.goto("/");

  await page.waitForFunction(
    () =>
      (window as unknown as { Clerk?: { loaded: boolean } }).Clerk?.loaded ===
      true,
    null,
    { timeout: 15_000 },
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
}
export async function mockHasApiKey(page: Page) {
  await page.route("**/chat", async (route, request) => {
    const isServerAction =
      request.method() === "POST" &&
      request.headers()["next-action"] !== undefined;

    if (!isServerAction) {
      return route.fallback();
    }

    try {
      const response = await route.fetch();
      const body = await response.text();

      if (body.includes("hasKey")) {
        const rewritten = body.replace(/"hasKey"\s*:\s*false/g, '"hasKey":true');
        await route.fulfill({
          status: response.status(),
          headers: response.headers(),
          body: rewritten,
        }).catch(() => { });
      } else {
        await route.fulfill({ response }).catch(() => { });
      }
    } catch {
      await route.fallback().catch(() => { });
    }
  });
}

export async function mockApiKeyConfigurationFlow(
  page: Page,
  options: { initialHasKey?: boolean } = {},
) {
  let hasKey = options.initialHasKey ?? false;

  await page.route("**/chat", async (route, request) => {
    const isServerAction =
      request.method() === "POST" &&
      request.headers()["next-action"] !== undefined;

    if (!isServerAction) {
      return route.fallback();
    }

    const postBuffer = request.postDataBuffer();
    const postPayload = request.postData() ?? "";
    const postUtf8 =
      postBuffer && postBuffer.length > 0
        ? postBuffer.toString("utf8")
        : postPayload;
    let postScan = postUtf8;
    try {
      const decoded = decodeURIComponent(postUtf8.replace(/\+/g, " "));
      if (decoded !== postUtf8) {
        postScan = `${postUtf8}\n${decoded}`;
      }
    } catch {
      /* ignore */
    }
    const keyMarker = Buffer.from("sk-or-v1-", "utf8");
    /** OpenRouter keys in multipart / binary chunks; postData() is often empty. */
    const looksLikeSaveKeyPost =
      (postBuffer != null && postBuffer.indexOf(keyMarker) >= 0) ||
      /sk-or-v1-[A-Za-z0-9]{16,}/.test(postScan) ||
      postScan.includes("sk-or-v1-");

    try {
      const response = await route.fetch();
      const body = await response.text();
      let rewritten = body;
      let changed = false;

      const saveSucceeded = /"success"\s*:\s*true/.test(rewritten);

      // saveOpenRouterKey: invalid keys are rejected client-side, so a false
      // success here is a server-side failure we simulate as OK for e2e without DB.
      if (rewritten.includes('"success":false')) {
        rewritten = rewritten.replace(
          /"success"\s*:\s*false/,
          '"success":true',
        );
        hasKey = true;
        changed = true;
      } else if (looksLikeSaveKeyPost && saveSucceeded) {
        // Real Supabase save returns success without going through the branch above.
        // If we do not flip `hasKey`, the next hasApiKey mock still forces false and
        // the "API key required" banner never clears.
        hasKey = true;
      }

      // Server-action responses are often a React Flight stream. Global string
      // replacement can corrupt unrelated chunks and surface the Next.js dev error
      // overlay (blocking Playwright clicks). Only touch the first clear match.
      if (rewritten.includes("hasKey")) {
        rewritten = rewritten.replace(
          /"hasKey"\s*:\s*(true|false)/,
          `"hasKey":${hasKey}`,
        );
        changed = true;
      }

      if (changed) {
        await route.fulfill({
          status: response.status(),
          headers: response.headers(),
          body: rewritten,
        });
      } else {
        await route.fulfill({ response });
      }
    } catch {
      await route.fallback().catch(() => { });
    }
  });
}

export async function waitForChatReady(page: Page) {
  await expect(page.getByRole("textbox")).toBeVisible({ timeout: 20_000 });
}

export async function selectModels(page: Page, modelLabels: string[]) {
  const trigger = page.getByRole("combobox").first();
  await trigger.click();

  for (const label of modelLabels) {
    const searchInput = page.getByPlaceholder("Search models...");
    await searchInput.fill(label);
    await page.waitForTimeout(100);

    const option = page.getByRole("option", { name: new RegExp(label, "i") }).first();
    await expect(option).toBeVisible();
    await option.click({ force: true });

    await searchInput.fill("");
    await page.waitForTimeout(100);
  }

  await page.keyboard.press("Escape");
}

export type MockSSEOptions = {
  results: Array<{
    model: string;
    message?: { role: string; content: string };
    error?: string;
  }>;
  /** Optional evaluation metadata */
  evaluationMetadata?: EvaluationMetadata;
  /** Optional iteration results for rl4f */
  iterationResults?: RL4FIterationResult[];
  /** Whether to include the "refining" phase (for rl4f) */
  includeRefiningPhase?: boolean;
  phaseDelay?: number;
  slowResponse?: boolean;
};

export async function mockChatSSE(page: Page, options: MockSSEOptions) {
  const optionsJson = JSON.stringify(options);

  await page.evaluate((optsStr) => {
    const opts = JSON.parse(optsStr);
    const delayMs = opts.phaseDelay ?? 500;

    if (!window.__originalFetch) {
      window.__originalFetch = window.fetch;
    }
    const OriginalFetch = window.__originalFetch;

    window.fetch = async (input, init) => {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : "";
      const pathname = (() => {
        try {
          return new URL(rawUrl, window.location.origin).pathname;
        } catch {
          return "";
        }
      })();

      if (pathname === "/api/chat" && init?.method === "POST") {
        if (init?.signal?.aborted) {
          return Promise.reject(new DOMException('Aborted', 'AbortError'));
        }

        let cancelStream = () => { };

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            let timerId: ReturnType<typeof setTimeout> | null = null;
            let rejectDelay: ((reason?: Error | DOMException) => void) | null = null;
            let isCancelled = false;

            cancelStream = () => {
              isCancelled = true;
              if (timerId) clearTimeout(timerId);
              if (rejectDelay) rejectDelay(new DOMException('Aborted', 'AbortError'));
            };

            const handleAbort = () => {
              cancelStream();
              try { controller.error(new DOMException('Aborted', 'AbortError')); } catch { }
            };

            if (init?.signal) {
              init.signal.addEventListener('abort', handleAbort);
            }

            const delay = (ms: number) => new Promise((resolve, reject) => {
              if (isCancelled) return reject(new DOMException('Aborted', 'AbortError'));
              rejectDelay = reject;
              timerId = setTimeout(() => {
                rejectDelay = null;
                resolve(undefined);
              }, ms);
            });

            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ phase: "querying" })}\n\n`));

              if (opts.slowResponse) {
                await delay(60000);
              } else {
                await delay(delayMs);
              }

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ phase: "evaluating" })}\n\n`));
              await delay(delayMs);

              if (opts.includeRefiningPhase) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ phase: "refining" })}\n\n`));
                await delay(delayMs);
              }

              if (opts.results) {
                const completePayload: Record<string, unknown> = {
                  phase: "complete",
                  results: opts.results,
                };
                if (opts.evaluationMetadata) {
                  completePayload.evaluationMetadata = opts.evaluationMetadata;
                }
                if (opts.iterationResults) {
                  completePayload.iterationResults = opts.iterationResults;
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(completePayload)}\n\n`));
              }

              controller.close();
            } catch {
            } finally {
              if (init?.signal) {
                init.signal.removeEventListener('abort', handleAbort);
              }
            }
          },
          cancel() {
            cancelStream();
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          }
        });
      }

      return OriginalFetch(input, init);
    };
  }, optionsJson);
}

export async function mockChatHanging(page: Page) {
  await mockChatSSE(page, { results: [], slowResponse: true });
}

declare global {
  interface Window {
    __originalFetch?: typeof fetch;
  }
}

export async function mockModelPricing(page: Page) {
  await page.route("**/api/models/pricing", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pricingStatus: "unavailable",
        pricingByModel: {},
      }),
    });
  });
}

export async function submitPrompt(page: Page, text: string) {
  const textbox = page.getByRole("textbox");
  await textbox.fill(text);
  await page.keyboard.press("Enter");
}
