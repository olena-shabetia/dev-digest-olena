/* OutdatedFindings — footer list for findings whose `start_line` isn't in this
   file's patch (outside the fetched hunk range). Mirrors OutdatedComments so a
   finding never silently disappears just because its line isn't rendered. */
"use client";

import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { cs } from "../comments";
import type { DiffFindingsApi } from "../findings";

export function OutdatedFindings({
  findings,
  api,
}: {
  findings: FindingRecord[];
  api: DiffFindingsApi;
}) {
  if (findings.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{api.outsidePatchLabel(findings.length)}</span>
      {findings.map((f) => (
        <FindingCard
          key={f.id}
          f={f}
          defaultExpanded
          pending={api.pendingFindingId === f.id}
          repoFullName={api.repoFullName}
          headSha={api.headSha}
          onAction={(action, reply) => api.onAction?.(f.id, action, reply)}
        />
      ))}
    </div>
  );
}
