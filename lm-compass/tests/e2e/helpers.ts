import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

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
