/* OnboardingTourView — L05b Onboarding Tour page (SPEC-07). Container: owns the
   hooks and the loading / error / empty / generating states; the header, banners,
   TOC and the five section cards are presentational children. Every list arrives
   ordered from the server — nothing is ranked or filtered here. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { useGenerateOnboardingTour, useOnboardingTour } from "@/lib/hooks/onboarding";
import type { OnboardingSection } from "@/lib/types";
import { ArchitectureSection } from "./_components/ArchitectureSection";
import { CriticalPathsSection } from "./_components/CriticalPathsSection";
import { FirstTasksSection } from "./_components/FirstTasksSection";
import { ReadingPathSection } from "./_components/ReadingPathSection";
import { RunLocallySection } from "./_components/RunLocallySection";
import { SectionCard } from "./_components/SectionCard";
import { TourBanner } from "./_components/TourBanner";
import { TourHeader } from "./_components/TourHeader";
import { TourToc } from "./_components/TourToc";
import { SECTION_ANCHOR, SECTION_ICON, SECTION_ORDER, SECTION_TITLE_KEY } from "./constants";
import { buildShareUrl, repoFullName } from "./helpers";
import { s } from "./styles";
import { useActiveSection } from "./useActiveSection";

const ANCHORS = SECTION_ORDER.map((k) => SECTION_ANCHOR[k]);

export function OnboardingTourView() {
  const t = useTranslations("onboarding");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const toast = useToast();

  const { data, isLoading, isError, error, refetch: reload } = useOnboardingTour(repoId);
  const generate = useGenerateOnboardingTour(repoId);

  const tour = data?.tour ?? null;
  const { active, goTo } = useActiveSection(ANCHORS, tour !== null);

  // C-23: scroll to a #section hash once the sections have rendered.
  React.useEffect(() => {
    if (tour === null) return;
    const hash = window.location.hash.slice(1);
    if (hash && ANCHORS.includes(hash)) goTo(hash);
  }, [tour === null, goTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const fullName = repoFullName(activeRepo, repoId);
  const crumb = [{ label: fullName, mono: true }, { label: t("title") }];

  const regenerate = () =>
    generate.mutate(undefined, {
      onError: (e) => toast.error(e instanceof ApiError ? e.message : t("unknownError")),
    });

  const share = () => {
    const url = buildShareUrl(window.location.origin, repoId, active);
    void navigator.clipboard?.writeText(url);
    toast.success(t("share.copied"));
  };

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.loadingStack}>
          <Skeleton height={64} />
          {SECTION_ORDER.map((k) => (
            <Skeleton key={k} height={140} />
          ))}
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.center}>
          <ErrorState
            title={t("loadError.title")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => reload()}
          />
        </div>
      </AppShell>
    );
  }

  const generating = data?.state === "generating" || generate.isPending;

  if (tour === null) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.center}>
          <EmptyState
            icon="FileText"
            title={t("generate.title")}
            body={t("generate.body")}
            cta={generating ? t("generate.generating") : t("generate.cta")}
            onCta={generating ? undefined : regenerate}
            ctaLoading={generating}
          />
        </div>
      </AppShell>
    );
  }

  const renderSection = (section: OnboardingSection) => {
    switch (section.kind) {
      case "architecture":
        return <ArchitectureSection section={section} />;
      case "critical_paths":
        return <CriticalPathsSection section={section} fullName={fullName} indexSha={tour.index_sha} />;
      case "run_locally":
        return <RunLocallySection section={section} />;
      case "reading_path":
        return <ReadingPathSection section={section} />;
      case "first_tasks":
        return <FirstTasksSection section={section} fullName={fullName} indexSha={tour.index_sha} />;
    }
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <TourToc active={active} onSelect={goTo} />
        <div style={s.main}>
          <TourHeader
            repoName={fullName}
            filesIndexed={tour.files_indexed}
            generatedAt={tour.generated_at}
            partial={tour.index_partial}
            regenerating={generating}
            onRegenerate={regenerate}
            onShare={share}
          />
          {tour.status === "skeleton" && <TourBanner kind="skeleton" reason={tour.reason} />}
          {tour.stale && (
            <TourBanner kind="stale" tourSha={tour.index_sha} currentSha={data?.index.last_indexed_sha ?? null} />
          )}
          {tour.sections.map((section) => {
            const anchor = SECTION_ANCHOR[section.kind];
            return (
              <SectionCard
                key={section.kind}
                id={anchor}
                icon={SECTION_ICON[section.kind]}
                title={t(SECTION_TITLE_KEY[section.kind])}
                active={active === anchor}
              >
                {renderSection(section)}
              </SectionCard>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
