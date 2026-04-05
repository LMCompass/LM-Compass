import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { type Page, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type { EvaluationMetadata } from "../../lib/evaluation/types";
import type { RL4FIterationResult } from "../../lib/evaluation/rl4f-evaluator";

const TEST_USER_FILE = path.resolve(__dirname, ".test-user.json");

export function getTestUserId(): string | null {
  try {
    const data = JSON.parse(fs.readFileSync(TEST_USER_FILE, "utf-8"));
    return data.userId ?? null;
  } catch {
    return null;
  }
}

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

    try {
      const response = await route.fetch();
      const body = await response.text();
      let rewritten = body;
      let changed = false;

      if (rewritten.includes("hasKey")) {
        rewritten = rewritten.replace(
          /"hasKey"\s*:\s*(true|false)/g,
          `"hasKey":${hasKey}`,
        );
        changed = true;
      }

      if (rewritten.includes('"success"')) {
        rewritten = rewritten.replace(/"success"\s*:\s*false/g, '"success":true');
        hasKey = true;
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
      const url = typeof input === "string" ? input : (input instanceof Request ? input.url : "");

      if (url.includes("/api/chat") && init?.method === "POST") {
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
