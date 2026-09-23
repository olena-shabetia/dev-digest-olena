/* SkillFullPage — the /skills/:id view (HW2 criterion 25): full-width
   Skill Editor reached from the side panel's "Open full page" link
   (criterion 10, unchanged — the /skills list still opens a skill in the
   panel via ?id= first). Colocated here so the route's page.tsx stays thin. */
"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { SkillEditor } from "@/components/skill-editor";
import { useSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { s } from "./styles";

export function SkillFullPage() {
  const t = useTranslations("skills");
  const params = useParams<{ id: string }>();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(params.id);

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.notFound.title")}
          body={error instanceof ApiError ? error.message : t("detail.loadError")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.shell}>
        <div style={s.backRow}>
          <Link href="/skills" style={s.backLink}>
            {t("detail.back")}
          </Link>
        </div>
        {isLoading || !skill ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <SkillEditor skill={skill} />
        )}
      </div>
    </AppShell>
  );
}
