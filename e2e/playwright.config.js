const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  outputDir: 'results/test-results',
  reporter: 'line',
  // En serie (D-54): empleado y admin usan a Luis y limpian sus reservas antes de cada test.
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || 'http://web',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
