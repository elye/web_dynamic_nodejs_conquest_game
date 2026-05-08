import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    exclude: ['dist/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@conquest/shared': new URL('../shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
