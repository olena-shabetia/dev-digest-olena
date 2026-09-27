import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    // bin/*.mjs runs directly under Node, outside the TS project — give it
    // the handful of Node globals it needs without pulling in a new
    // dependency (same inline-globals pattern as server/eslint.config.mjs).
    files: ['bin/**/*.mjs'],
    languageOptions: {
      globals: { URL: 'readonly', process: 'readonly' },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // stdout is the JSON-RPC channel; all logging goes through src/log.ts (stderr only).
      'no-console': 'error',
      // MCP talks to the server only over HTTP — never import its internals or reviewer-core directly.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '**/server/src/modules/**',
            '**/server/src/platform/**',
            '**/server/src/db/**',
            '**/server/src/adapters/**',
            '@devdigest/reviewer-core',
          ],
        },
      ],
    },
  },
);
