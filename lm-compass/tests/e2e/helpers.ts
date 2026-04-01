import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { type Page, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const TEST_USER_FILE = path.resolve(__dirname, ".test-user.json");

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

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
 * Bypasses all configured auth strategies (password, OAuth, etc.)
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

/**
 * Full sign-in flow: sets up the Clerk testing token, navigates to "/",
 * waits for Clerk to load, then authenticates via the ticket strategy.
 */
export async function signInTestUser(page: Page, userId: string) {
  const ticket = await createSignInToken(userId);

  await setupClerkTestingToken({ page });
  await page.goto("/");

  // Wait for Clerk to fully initialize
  await page.waitForFunction(
    () =>
      (window as unknown as { Clerk?: { loaded: boolean } }).Clerk?.loaded ===
      true,
    null,
    { timeout: 15_000 },
  );

  // Sign in via the ticket strategy
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
}

// ---------------------------------------------------------------------------
// Chat page helpers
// ---------------------------------------------------------------------------

/**
 * Intercepts the `hasApiKey` Next.js server action so that it always
 * reports that the user has an API key. This ensures the prompt input
 * is shown instead of the "API key required" banner.
 *
 * Next.js server actions are POST-ed to the page URL with a `Next-Action`
 * header. The response is in React Server Components (RSC) Flight format.
 * We intercept responses that contain `"hasKey"` and rewrite them to
 * return `{"hasKey":true}`.
 */
export async function mockHasApiKey(page: Page) {
  await page.route("**/chat", async (route, request) => {
    // Only intercept server-action POST requests (they carry a Next-Action header)
    const isServerAction =
      request.method() === "POST" &&
      request.headers()["next-action"] !== undefined;

    if (!isServerAction) {
      return route.fallback();
    }

    // Let the real request go through so we can inspect the response
    try {
      const response = await route.fetch();
      const body = await response.text();

      // Only rewrite the hasApiKey action response
      if (body.includes("hasKey")) {
        // RSC flight format: the payload is on the last line after a prefix like `0:`
        // Replace any `"hasKey":false` with `"hasKey":true`
        const rewritten = body.replace(/"hasKey"\s*:\s*false/g, '"hasKey":true');
        await route.fulfill({
          status: response.status(),
          headers: response.headers(),
          body: rewritten,
        }).catch(() => {});
      } else {
        // Not the hasApiKey action — pass through untouched
        await route.fulfill({ response }).catch(() => {});
      }
    } catch (e) {
      // The browser/page might be closing, ignore the error
      await route.fallback().catch(() => {});
    }
  });
}

/**
 * Waits until the chat page is ready for an authenticated user
 * (the prompt textbox is visible).
 */
export async function waitForChatReady(page: Page) {
  await expect(page.getByRole("textbox")).toBeVisible({ timeout: 20_000 });
}

/**
 * Opens the multi-model selector popover, searches for each label, and
 * toggles it on. Closes the popover when done.
 */
export async function selectModels(page: Page, modelLabels: string[]) {
  // Click the model selector trigger button
  const trigger = page.getByRole("combobox").first();
  await trigger.click();

  for (const label of modelLabels) {
    // Type in the search input to find the model
    const searchInput = page.getByPlaceholder("Search models...");
    await searchInput.fill(label);
    await page.waitForTimeout(100);

    // Click the matching option
    const option = page.getByRole("option", { name: new RegExp(label, "i") }).first();
    await expect(option).toBeVisible();
    await option.click({ force: true });

    // Clear the search for the next model
    await searchInput.fill("");
    await page.waitForTimeout(100);
  }

  // Close the popover by pressing Escape
  await page.keyboard.press("Escape");
}

// ---------------------------------------------------------------------------
// SSE mock helpers
// ---------------------------------------------------------------------------

export type MockSSEOptions = {
  /** Model results to return in the "complete" phase */
  results: Array<{
    model: string;
    message?: { role: string; content: string };
    error?: string;
  }>;
  /** Optional evaluation metadata */
  evaluationMetadata?: {
    winnerModel: string | null;
    scores: Array<{
      judgeModel: string;
      evaluatedModel: string;
      score: number | null;
      reasoning: string | null;
    }>;
    meanScores: Record<string, number>;
    modelReasoning: Record<string, string[]>;
    tiedModels: string[];
  };
  /** Optional iteration results for rl4f */
  iterationResults?: Array<{
    iteration: number;
    scores: Array<{
      judgeModel: string;
      evaluatedModel: string;
      score: number | null;
      reasoning: string | null;
    }>;
    meanScores: Record<string, number>;
    winner: { model: string; meanScore: number } | null;
  }>;
  /** Whether to include the "refining" phase (for rl4f) */
  includeRefiningPhase?: boolean;
  /** Delay in ms between each SSE phase (default: 100) */
  phaseDelay?: number;
  /** If true, delay the response significantly (for stop/cancel tests) */
  slowResponse?: boolean;
};

/**
 * Mocks `fetch` for `/api/chat` using a custom ReadableStream to simulate an SSE connection
 * with true chunk-by-chunk delays.
 */
export async function mockChatSSE(page: Page, options: MockSSEOptions) {
  const delay = options.phaseDelay ?? 500;
  
  // We need to pass options into the browser context, so we stringify it
  const optionsJson = JSON.stringify(options);
  
  await page.evaluate((optsStr) => {
    const opts = JSON.parse(optsStr);
    const delayMs = opts.phaseDelay ?? 500;
    
    // Store original fetch if not already stored
    if (!window.__originalFetch) {
      window.__originalFetch = window.fetch;
    }
    const OriginalFetch = window.__originalFetch;
    
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input instanceof Request ? input.url : "");
      
      if (url.includes("/api/chat") && init?.method === "POST") {
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            
            // 1. Querying phase
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ phase: "querying" })}\n\n`));
            
            if (opts.slowResponse) {
              await new Promise(r => setTimeout(r, 60000)); // Hang indefinitely
            } else {
              await new Promise(r => setTimeout(r, delayMs));
            }
            
            // 2. Evaluating phase
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ phase: "evaluating" })}\n\n`));
            await new Promise(r => setTimeout(r, delayMs));
            
            // 3. Refining phase
            if (opts.includeRefiningPhase) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ phase: "refining" })}\n\n`));
              await new Promise(r => setTimeout(r, delayMs));
            }
            
            // 4. Complete
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

/**
 * Installs a mock fetch that hangs indefinitely during the querying phase.
 */
export async function mockChatHanging(page: Page) {
  await mockChatSSE(page, { results: [], slowResponse: true });
}

// Add type for window.__originalFetch
declare global {
  interface Window {
    __originalFetch?: typeof fetch;
  }
}


/** Also mock the model pricing endpoint to avoid real API calls */
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

/**
 * Submit a prompt in the chat input and press Enter.
 */
export async function submitPrompt(page: Page, text: string) {
  const textbox = page.getByRole("textbox");
  await textbox.fill(text);
  await page.keyboard.press("Enter");
}
