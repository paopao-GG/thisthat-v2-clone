import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Use global test, expect, etc. (no need to import)
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        '**/*.config.ts',
        '**/index.ts', // Entry points
      ],
    },
  },
});

