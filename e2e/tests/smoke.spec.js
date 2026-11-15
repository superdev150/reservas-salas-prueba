const { test, expect } = require('@playwright/test');

test('la página inicial muestra API: ok', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('api-status')).toHaveText('API: ok');
  await page.screenshot({ path: 'results/smoke.png', fullPage: true });
});
