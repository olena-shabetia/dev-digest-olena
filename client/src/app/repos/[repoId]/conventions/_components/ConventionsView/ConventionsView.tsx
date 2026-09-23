/* ConventionsView — Skills Lab → Conventions (HW2 criteria 45-51). Header
   (title, "N of M accepted", Run Scan/Re-scan, Create skill once >=1
   accepted, "Scanning repository…" while a scan is in flight), then the
   merged-candidate card list, sorted accepted -> pending -> rejected
   (helpers.ts#sortByStatus) so accepting/rejecting a card visibly moves it
   instead of leaving decided and undecided rows interleaved; confidence
   order (the server's own sort) is preserved within each group. Rejected
   candidates stay in the list rather than disappearing — see
   CandidateCard's header comment for why. `useConventions` polls GET while
   the latest scan is queued/running so this page self-updates without a
   manual refresh (criterion 38's restart-durability is a server-side
   property; this is just riding the same GET). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useConventions, useExtractConventions, usePatchConvention } from "@/lib/hooks/conventions";
import { ApiError } from "@/lib/api";
import { CandidateCard } from "./_components/CandidateCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { sortByStatus } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const patch = usePatchConvention(repoId);
  const [creatingSkill, setCreatingSkill] = React.useState(false);
  const [patchingId, setPatchingId] = React.useState<string | null>(null);

  const repoLabel = activeRepo?.full_name ?? t("page.repoFallback");
  const scan = data?.scan ?? null;
  const candidates = React.useMemo(() => sortByStatus(data?.candidates ?? []), [data?.candidates]);
  const acceptedCandidates = candidates.filter((c) => c.status === "accepted");
  const isScanning = scan?.status === "queued" || scan?.status === "running";
  const hasEverScanned = scan != null;

  if (repoNotFound) {
    return (
      <AppShell crumb={[{ label: repoLabel, mono: true }, { label: t("page.crumbConventions") }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const crumb = [
    { label: t("page.crumbLab") },
    { label: repoLabel, mono: true },
    { label: t("page.crumbConventions") },
  ];

  const runScan = () => extract.mutate();

  return (
    <AppShell crumb={crumb}>
      {creatingSkill && (
        <CreateSkillModal
          repoId={repoId}
          repoLabel={repoLabel}
          accepted={acceptedCandidates}
          onClose={() => setCreatingSkill(false)}
          onCreated={() => setCreatingSkill(false)}
        />
      )}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>
            {t("page.headingPrefix")}
            {repoLabel}
          </h1>
          <p style={s.pageSubtitle}>
            {candidates.length > 0
              ? t("page.acceptedCount", { accepted: acceptedCandidates.length, total: candidates.length })
              : t("page.subtitle")}
          </p>
          {candidates.length > 0 && (
            <p style={s.candidateCount}>{t("page.candidateCount", { count: candidates.length })}</p>
          )}
          {isScanning && <p style={s.scanningNote}>{t("page.scanning")}</p>}
          {scan?.status === "failed" && <p style={s.degradedNote}>{t("page.extractionFailed")}</p>}
          {scan?.degraded && scan.status !== "failed" && (
            <p style={s.degradedNote}>{t("page.degraded", { reason: scan.degraded_reason ?? "" })}</p>
          )}
        </div>
        <div style={s.headerActions}>
          {acceptedCandidates.length > 0 && (
            <Button kind="secondary" icon="Sparkles" onClick={() => setCreatingSkill(true)}>
              {t("page.createSkill")}
            </Button>
          )}
          <Button kind="primary" icon="RefreshCw" onClick={runScan} disabled={isScanning || extract.isPending}>
            {hasEverScanned ? t("page.rescan") : t("page.runScan")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div style={s.loadingStack}>
          <Skeleton height={140} />
          <Skeleton height={140} />
        </div>
      ) : isError ? (
        <div style={s.list}>
          <ErrorState
            title={t("page.loadError")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        </div>
      ) : candidates.length === 0 ? (
        <div style={s.list}>
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={runScan}
          />
        </div>
      ) : (
        <div style={s.list}>
          {candidates.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              saving={patchingId === c.id && patch.isPending}
              onAccept={() => {
                setPatchingId(c.id);
                patch.mutate(
                  { id: c.id, patch: { status: "accepted" } },
                  { onSettled: () => setPatchingId(null) },
                );
              }}
              onReject={() => {
                setPatchingId(c.id);
                patch.mutate(
                  { id: c.id, patch: { status: "rejected" } },
                  { onSettled: () => setPatchingId(null) },
                );
              }}
              onSave={(p) => patch.mutate({ id: c.id, patch: p })}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
