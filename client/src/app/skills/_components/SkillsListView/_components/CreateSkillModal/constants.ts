import type { SkillType } from "@devdigest/shared";

/** Selectable skill types in the create form. */
export const SKILL_TYPE_OPTIONS: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Default type for a new skill. */
export const DEFAULT_SKILL_TYPE: SkillType = "custom";

/** Modal width (px) — same as CreateAgentModal. */
export const MODAL_WIDTH = 480;
