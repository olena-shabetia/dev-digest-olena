import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import eslintConfigPrettier from "eslint-config-prettier";

const __dirname = dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const config = [
  {
    // Never lint vendored/derived/generated output — see client/AGENTS.md
    // ("src/vendor/shared is a DERIVED copy") and the vendor-sync rule.
    ignores: [
      "src/vendor/**",
      ".next/**",
      "node_modules/**",
      "coverage/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  // Must come last: turns off any stylistic rule that could conflict with
  // Prettier. Does not touch react-hooks/exhaustive-deps or any correctness
  // rule — those stay on deliberately (see client/INSIGHTS.md and the
  // pre-existing eslint-disable comments this config is meant to police).
  eslintConfigPrettier,
];

export default config;
