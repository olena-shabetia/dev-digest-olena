import type { CiFailOn } from "@devdigest/shared";

/** Fail-CI-on values, in display order. Declared locally with a type-only import:
 *  a runtime import of `CiFailOn` pulls the vendored barrel (`.js` re-exports)
 *  into the Next webpack build, which cannot resolve them. */
export const CI_FAIL_ON_OPTIONS: readonly CiFailOn[] = ["never", "critical", "warning", "any"];
