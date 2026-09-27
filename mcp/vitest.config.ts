import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Single-sourced contracts live in the server's vendored shared (the
      // MCP client borrows them; see tsconfig paths).
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared'),
      // Force a single zod instance shared with the SDK's own peer dependency.
      zod: path.resolve(__dirname, 'node_modules/zod'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
