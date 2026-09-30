import type { IconName } from "@devdigest/ui";
import type { OnboardingSectionKind } from "@/lib/types";

/** SPEC-05 AC-2 order. */
export const SECTION_ORDER: readonly OnboardingSectionKind[] = [
  "architecture",
  "critical_paths",
  "run_locally",
  "reading_path",
  "first_tasks",
] as const;

/** Section kind → DOM id / URL hash fragment (plan §3 "Section anchors"). */
export const SECTION_ANCHOR: Record<OnboardingSectionKind, string> = {
  architecture: "architecture",
  critical_paths: "critical-paths",
  run_locally: "run-locally",
  reading_path: "reading-path",
  first_tasks: "first-tasks",
};

export const SECTION_ICON: Record<OnboardingSectionKind, IconName> = {
  architecture: "Layers",
  critical_paths: "Target",
  run_locally: "Play",
  reading_path: "ListChecks",
  first_tasks: "CheckCircle",
};

/** i18n key fragment under `sections.*` for each kind. */
export const SECTION_TITLE_KEY: Record<OnboardingSectionKind, string> = {
  architecture: "sections.architecture",
  critical_paths: "sections.criticalPaths",
  run_locally: "sections.runLocally",
  reading_path: "sections.readingPath",
  first_tasks: "sections.firstTasks",
};

/** How long the "Copied" feedback stays visible (ms). */
export const COPIED_FEEDBACK_MS = 1200;

/** Viewport band (top/bottom root margins) used to decide the section "in view". */
export const ACTIVE_SECTION_ROOT_MARGIN = "-15% 0px -70% 0px";
