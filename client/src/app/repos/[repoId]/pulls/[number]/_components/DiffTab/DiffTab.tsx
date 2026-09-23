"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Icon } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingsApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useSmartDiff, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile, SmartDiffRole } from "@/lib/types";
import { toDiffGroupViews, findingsByPath as computeFindingsByPath } from "./helpers";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function DiffTab({ prId, filesCount, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // One toggle for both GitHub comment threads and finding cards. Findings
  // must be visible without any interaction (client/specs/L03-smart-diff.ui.md),
  // so the shared flag starts true; toggling off clears both for a clean diff.
  const [showComments, setShowComments] = React.useState(true);

  // Smart Diff (L03) — best-effort enrichment. While loading or errored, the
  // flat view below renders unchanged; the tab must never break on a
  // smart-diff fetch failure.
  const { data: smartDiff, isLoading: smartDiffLoading, isError: smartDiffErrored } = useSmartDiff(prId);
  const { data: reviews, isLoading: reviewsLoading } = usePrReviews(prId);
  const findingAction = useFindingAction();
  const [smartOrder, setSmartOrder] = React.useState(true);

  const roleLabels: Record<SmartDiffRole, string> = React.useMemo(
    () => ({
      core: t("smartDiff.coreLabel"),
      tests: t("smartDiff.testsLabel"),
      wiring: t("smartDiff.wiringLabel"),
      docs: t("smartDiff.docsLabel"),
      boilerplate: t("smartDiff.boilerplateLabel"),
    }),
    [t],
  );

  const roleDescriptions: Record<SmartDiffRole, string> = React.useMemo(
    () => ({
      core: t("smartDiff.coreDescription"),
      tests: t("smartDiff.testsDescription"),
      wiring: t("smartDiff.wiringDescription"),
      docs: t("smartDiff.docsDescription"),
      boilerplate: t("smartDiff.boilerplateDescription"),
    }),
    [t],
  );

  const filesWithFindingsLabel = React.useCallback(
    (count: number) => t("smartDiff.filesWithFindings", { count }),
    [t],
  );

  const filesCountLabel = React.useCallback(
    (count: number) => t("smartDiff.filesCount", { count }),
    [t],
  );

  const groups = React.useMemo(
    () => toDiffGroupViews(smartDiff, files, roleLabels, roleDescriptions, filesWithFindingsLabel, filesCountLabel),
    [smartDiff, files, roleLabels, roleDescriptions, filesWithFindingsLabel, filesCountLabel],
  );

  const canRenderGrouped = smartOrder && !smartDiffLoading && !smartDiffErrored && groups.length > 0;
  // No review has ever run for this PR — the group/file finding dots simply
  // never appear (D-item: `filesWithFindings > 0` gates each one), which
  // reads as "nothing to review" rather than "not reviewed yet". Surface
  // that distinction explicitly instead of leaving it to silent absence.
  const noReviewYet = canRenderGrouped && !reviewsLoading && (reviews?.length ?? 0) === 0;

  // Aggregated across EVERY review, matching page.tsx's `allFindings` (the
  // Findings tab) — "Run all enabled agents" creates one review per agent, so
  // restricting to reviews[0] ("the latest") would arbitrarily hide every
  // sibling agent's findings whenever the most-recently-created review
  // happened to be a clean one.
  const allFindings = React.useMemo(() => (reviews ?? []).flatMap((r) => r.findings), [reviews]);
  const findingsByPath = React.useMemo(() => computeFindingsByPath(allFindings), [allFindings]);

  const findingsApi: DiffFindingsApi = {
    byPath: findingsByPath,
    lineLabels: {
      CRITICAL: t("smartDiff.blockerLabel"),
      WARNING: t("smartDiff.warningLabel"),
      SUGGESTION: t("smartDiff.suggestionLabel"),
    },
    fileFindingsLabel: (count) => t("smartDiff.findingsCount", { count }),
    outsidePatchLabel: (count) => t("smartDiff.outsidePatchTitle", { count }),
    showFindings: showComments,
    repoFullName,
    headSha,
    pendingFindingId: findingAction.isPending ? (findingAction.variables?.findingId ?? null) : null,
    onAction: (findingId, action, reply) => {
      findingAction.mutate({ findingId, action, reply, prId: prId ?? undefined });
    },
  };

  const commentCount = comments?.length ?? 0;
  const findingsCount = allFindings.length;
  // Same toggle hides both, so its visibility and its count cover both kinds.
  const annotationsCount = commentCount + findingsCount;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {groups.length > 0 && (
              <Button kind="ghost" size="sm" onClick={() => setSmartOrder((v) => !v)}>
                {smartOrder ? t("smartDiff.originalOrderToggle") : t("smartDiff.smartOrderToggle")}
              </Button>
            )}
            {annotationsCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {t(showComments ? "diffTab.hideComments" : "diffTab.showComments", { count: annotationsCount })}
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      {noReviewYet && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 4px 14px",
            fontSize: 12.5,
            color: "var(--text-muted)",
          }}
        >
          <Icon.Info size={14} />
          {t("smartDiff.noReviewYet")}
        </div>
      )}
      <DiffViewer
        files={files}
        commenting={commenting}
        groups={canRenderGrouped ? groups : undefined}
        findings={canRenderGrouped ? findingsApi : undefined}
      />
    </section>
  );
}
