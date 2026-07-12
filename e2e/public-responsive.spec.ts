import { expect, test } from '@playwright/test';

for (const route of ['/login', '/quote', '/book', '/linen-portal']) {
  test(`${route} has no horizontal page overflow`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('body')).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
}

test('login controls have accessible names and useful touch sizes', async ({ page }) => {
  await page.goto('/login');
  const phone = page.getByRole('textbox');
  const submit = page.getByRole('button', { name: /code|continue|send/i });
  await expect(phone).toBeVisible();
  await expect(submit).toBeVisible();
  const box = await submit.boundingBox();
  expect(box?.height || 0).toBeGreaterThanOrEqual(40);
});
