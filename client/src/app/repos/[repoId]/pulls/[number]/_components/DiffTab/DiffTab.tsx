"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
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
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  // Smart Diff (L03) — best-effort enrichment. While loading or errored, the
  // flat view below renders unchanged; the tab must never break on a
  // smart-diff fetch failure.
  const { data: smartDiff, isLoading: smartDiffLoading, isError: smartDiffErrored } = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
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

  const findingsByPath = React.useMemo(
    () => computeFindingsByPath(reviews?.[0]?.findings ?? []),
    [reviews],
  );

  const findingsApi: DiffFindingsApi = {
    byPath: findingsByPath,
    lineLabels: {
      CRITICAL: t("smartDiff.blockerLabel"),
      WARNING: t("smartDiff.warningLabel"),
      SUGGESTION: t("smartDiff.suggestionLabel"),
    },
    fileFindingsLabel: (count) => t("smartDiff.findingsCount", { count }),
    repoFullName,
    headSha,
    pendingFindingId: findingAction.isPending ? (findingAction.variables?.findingId ?? null) : null,
    onAction: (findingId, action, reply) => {
      findingAction.mutate({ findingId, action, reply, prId: prId ?? undefined });
    },
  };

  const commentCount = comments?.length ?? 0;

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
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      <DiffViewer
        files={files}
        commenting={commenting}
        groups={canRenderGrouped ? groups : undefined}
        findings={canRenderGrouped ? findingsApi : undefined}
      />
    </section>
  );
}
