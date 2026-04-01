import { setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const TEST_USER_FILE = path.resolve(__dirname, ".test-user.json");

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
 * Signs in as the Clerk user from global setup (ticket strategy).
 */
export async function signInAsTestUser(page: Page, userId: string): Promise<void> {
  const ticket = await createSignInToken(userId);

  await setupClerkTestingToken({ page });
  await page.goto("/");

  await page.waitForFunction(
    () => (window as unknown as { Clerk?: { loaded: boolean } }).Clerk?.loaded === true,
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
}
