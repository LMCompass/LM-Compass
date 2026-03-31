import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

setup.describe.configure({ mode: "serial" });

export const TEST_USER_FILE = path.resolve(__dirname, ".test-user.json");

setup("global setup", async ({}) => {
  await clerkSetup();

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is required for E2E tests");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  };

  // Find the first existing user in the Clerk dev instance
  const listRes = await fetch("https://api.clerk.com/v1/users?limit=1", {
    headers,
  });
  const users = await listRes.json();

  if (!Array.isArray(users) || users.length === 0) {
    fs.writeFileSync(TEST_USER_FILE, JSON.stringify({ userId: null }));
    console.warn(
      "No users found in Clerk instance — authenticated E2E tests will be skipped."
    );
    return;
  }

  fs.writeFileSync(
    TEST_USER_FILE,
    JSON.stringify({ userId: users[0].id })
  );
});
