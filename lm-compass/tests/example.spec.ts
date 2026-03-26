import { test, expect } from '@playwright/test';

test('landing page -> chat navigation works', async ({ page }) => {
  await page.goto('/');

  // Stable hero content on the landing page
  await expect(
    page.getByRole('heading', {
      name: /Find the Best LLM Response.*for Your Data/i,
    }),
  ).toBeVisible();

  // Navigate into the app
  await page.getByRole('link', { name: /Start Evaluating/i }).click();

  // Unauthenticated users should see the sign-in required banner on /chat
  await expect(page.getByText('Sign in required')).toBeVisible();
});
