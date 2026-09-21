/** Default metadata for the generated `repo-conventions` skill — matches the
 *  server's own default (`server/src/modules/conventions/constants.ts`'s
 *  `CONVENTION_SKILL_NAME`), so the modal's prefilled Name matches what the
 *  server will actually name the skill when the user doesn't change it. */
export const DEFAULT_SKILL_NAME = "repo-conventions";
export const DEFAULT_SKILL_TYPE = "convention" as const;

/** Wider than the plain create-skill modal — this one carries a markdown body editor. */
export const MODAL_WIDTH = 640;

/** Evidence links rendered per rule in the generated skill body — mirrors the
 *  server's own cap (`MAX_EVIDENCES_PER_CANDIDATE`-independent; the skill
 *  body itself caps at 3 per rule regardless of how many evidences a
 *  candidate carries — see `server/src/modules/conventions/helpers.ts#buildSkillMarkdown`). */
export const MAX_EVIDENCE_LINKS_PER_RULE = 3;
