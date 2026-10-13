/* lib/multi-agent.ts — pure route builders + the estimate duration formatter.
   Shared by the PR page's AgentPickerPopover and the /multi-agent routes
   (Configure run, the run list, and the results page) — two routes consume
   this, so it lives in lib rather than in either route's helpers.ts. */
import { formatSeconds } from "./format";

/** The results page for one multi-agent run. */
export function multiAgentRunHref(id: string): string {
  return `/multi-agent/${id}`;
}

/** The Configure run screen, optionally pre-filled from a PR page launch. */
export function multiAgentConfigureHref(opts?: { prId?: string; agentIds?: string[] }): string {
  const sp = new URLSearchParams();
  if (opts?.prId) sp.set("pr", opts.prId);
  if (opts?.agentIds && opts.agentIds.length > 0) sp.set("agents", opts.agentIds.join(","));
  const qs = sp.toString();
  return qs ? `/multi-agent?${qs}` : "/multi-agent";
}

/** `null` duration means "unknown" — the caller renders its own "no estimate"
 *  copy; this never collapses that into "0s". */
export function formatEstimateDuration(ms: number | null): string | null {
  if (ms == null) return null;
  return `~${formatSeconds(ms)}`;
}
