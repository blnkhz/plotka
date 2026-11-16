import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // One app at a time on CI: its small runners make the responsiveness timings fail when two
  // apps share the CPU. Locally the files run in parallel.
  workers: process.env['CI'] ? 1 : undefined,
  outputDir: './test-results',
});
