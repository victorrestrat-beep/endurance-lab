import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    benchmark: {
      include: ['packages/*/bench/**/*.bench.ts'],
    },
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        statements: 98,
        branches: 95,
        functions: 100,
        lines: 98,
      },
    },
  },
});
