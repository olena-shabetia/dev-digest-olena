/* /skills — Skills master-detail shell (L02). Left rail lists every
   workspace skill (SkillCard: name, type/source badges, enabled Toggle); the
   right pane renders SkillEditor for the selected skill, or a "select a
   skill" empty state.

   Selection mechanism: specs/pages.md rules out a nested `/skills/:id`
   route ("no nested route per skill... tab state lives in the client
   view"), so this can't mirror `/agents/:id`'s full route-per-item pattern
   literally. The closest equivalent that stays bookmarkable/shareable (the
   property that made a route attractive in the first place) is a query
   param on this same route, `?id=`, updated with `router.replace` — the
   same mechanic `/agents/:id` already uses for its OWN `?tab=` sub-state.
   Plain component state would also satisfy the spec but loses the
   shareable-link property for free.

   The list card intentionally omits a "N agents" line — `useSkills()`
   returns no per-skill usage count, and adding one would mean an extra
   request per card. That count is shown once, cheaply, in SkillEditor's
   StatsTab via `useSkillStats(id)` (see plan Part 3 "StatsTab" note). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useSkill, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "./_components/SkillCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ImportSkillDrawer } from "./_components/ImportSkillDrawer";
import { SkillEditor } from "../SkillEditor";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selectedId = search.get("id");
  const selectSkill = (id: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (id) sp.set("id", id);
    else sp.delete("id");
    router.replace(`/skills${sp.toString() ? `?${sp.toString()}` : ""}`);
  };

  const { data: selectedSkill, isLoading: isSkillLoading } = useSkill(selectedId);
  const list = filterSkills(skills ?? [], query);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {creating && (
        <CreateSkillModal
          onClose={() => setCreating(false)}
          onCreated={(id) => selectSkill(id)}
        />
      )}
      {importing && <ImportSkillDrawer onClose={() => setImporting(false)} onImported={(id) => selectSkill(id)} />}
      <div style={s.shell}>
        <div style={s.rail}>
          <div style={s.railHeader}>
            <div style={s.railHeaderRow}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <Dropdown
                width={220}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
                  { label: t("create.title"), icon: "Edit", onClick: () => setCreating(true) },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.railList}>
            {isLoading && (
              <>
                <Skeleton height={64} />
                <Skeleton height={64} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && list.length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => setImporting(true)}
              />
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === selectedId}
                onClick={() => selectSkill(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {!selectedId ? (
          <div style={s.rightEmpty}>
            <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
          </div>
        ) : isSkillLoading || !selectedSkill ? (
          <div style={s.skeletonWrap}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.right}>
            <SkillEditor skill={selectedSkill} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
