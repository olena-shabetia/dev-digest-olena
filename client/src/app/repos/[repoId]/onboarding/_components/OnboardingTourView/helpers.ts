import type { OnboardingCommand, OnboardingSkeletonReason } from "@/lib/types";

export function formatFileCount(n: number): string {
  return n.toLocaleString();
}

/** First 7 chars of a commit SHA. */
export function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : "";
}

export function buildShareUrl(origin: string, repoId: string, anchor: string): string {
  return `${origin}/repos/${repoId}/onboarding#${anchor}`;
}

/** The text copied for one command row: `command` + ` # comment` when present. */
export function commandCopyText(cmd: OnboardingCommand): string {
  return cmd.comment ? `${cmd.command} # ${cmd.comment}` : cmd.command;
}

/** i18n key prefix for a skeleton reason (`<prefix>.title` / `<prefix>.next`). */
export function skeletonReasonKey(reason: OnboardingSkeletonReason | null): string {
  return `skeleton.${reason ?? "llm_failed"}`;
}

export function repoFullName(repo: { full_name?: string } | null | undefined, fallback: string): string {
  return repo?.full_name ?? fallback;
}

/** Open a repo file pinned to `sha` in a new tab (caller supplies the URL). */
export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener");
}
