import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Never lint vendored code, applied migrations, the self-clone, or build
    // output — see server/AGENTS.md "Do not touch" and root INSIGHTS.md
    // (server/clones/ holds a full copy of this repo).
    ignores: ['src/vendor/**', 'src/db/migrations/**', 'clones/**', 'dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    // .dependency-cruiser.cjs is plain CommonJS (dependency-cruiser's own
    // config format), not part of the ESM `src/` tree.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
  },
  {
    rules: {
      // Unused vars are frequently intentional in narrow catch/destructure
      // patterns in this codebase; keep the check but allow a `_`-prefixed
      // escape hatch instead of disabling it outright.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
