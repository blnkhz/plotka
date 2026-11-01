import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'plotter', include: ['test/**/*.test.ts'], passWithNoTests: true },
});
