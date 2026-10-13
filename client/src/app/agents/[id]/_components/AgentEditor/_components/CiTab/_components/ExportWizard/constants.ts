import type { CiPostAs, CiTrigger } from "@devdigest/shared";

/** Step label keys under `ci.exportWizard.steps`, in wizard order. */
export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;

export const STEP_PREVIEW = 1;
export const STEP_CONFIGURE = 2;
export const STEP_INSTALL = 3;

/** Trigger chips, in the order the server renders `types: [...]`. */
export const TRIGGER_VALUES: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];
export const DEFAULT_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize"];

/** "Post results as" radios. `labelKey` resolves under `exportWizard.postAs`. */
export const POST_AS_OPTIONS: readonly {
  value: CiPostAs;
  labelKey: "githubReview" | "prComment" | "none";
}[] = [
  { value: "github_review", labelKey: "githubReview" },
  { value: "pr_comment", labelKey: "prComment" },
  { value: "none", labelKey: "none" },
];

/** Static "Secrets expected" rows — names only, never values. */
export const SECRET_ROWS = [
  { name: "OPENROUTER_API_KEY", descKey: "secretOpenRouterDesc" },
  { name: "GITHUB_TOKEN", descKey: "secretGithubDesc" },
] as const;

export type InstallAction = "open_pr" | "files";

export const SHA_PREVIEW_LENGTH = 12;
