/* CiTab — agent CI deployment (L07 crit. 1–5, 20). Reads the overview over
   `useCiAgentOverview`; ingest happens server-side on read, so Refresh is just
   a refetch. The Export wizard always targets the active (sidebar) repo. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, FormField, SelectInput, Skeleton } from "@devdigest/ui";
import type { Agent, CiFailOn, CiInstallation } from "@devdigest/shared";
import { CiRunsTable } from "@/components/ci-runs-table";
import { useCiAgentOverview } from "@/lib/hooks/ci";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { useActiveRepo } from "@/lib/repo-context";
import { safeHttpUrl } from "@/lib/github-urls";
import { ExportWizard } from "./_components/ExportWizard";
import { CI_FAIL_ON_OPTIONS } from "./constants";
import { s } from "./styles";

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci.ciTab");
  const tr = useTranslations("ci.runs");
  const ta = useTranslations("agents");
  const { activeRepo } = useActiveRepo();
  const overview = useCiAgentOverview(agent.id);
  const update = useUpdateAgent();
  const { refetch: reload } = overview;
  const [wizardOpen, setWizardOpen] = React.useState(false);

  const installations = overview.data?.installations ?? [];
  const noRepo = activeRepo === null;
  const failOnOptions = CI_FAIL_ON_OPTIONS.map((v) => ({ value: v, label: ta(`config.ciFailOnOptions.${v}`) }));

  const latestRunText = (i: CiInstallation) => {
    const r = i.latest_run;
    if (!r) return t("noRunYet");
    const state = r.status === "failed" ? tr("status.failed") : r.verdict ? tr(`verdict.${r.verdict}`) : "—";
    return `${state} · ${new Date(r.ran_at).toLocaleString()}`;
  };

  if (overview.isError) {
    return <ErrorState title={t("title")} body={overview.error.message} onRetry={() => void reload()} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.title}>{t("title")}</h2>
        {overview.data && <Badge color="var(--ok)">{t("activeIn", { count: installations.length })}</Badge>}
        <span style={s.spacer} />
        <Button kind="secondary" size="sm" icon="RefreshCw" loading={overview.isFetching} onClick={() => void reload()}>
          {tr("refresh")}
        </Button>
        <Button kind="secondary" size="sm" disabled={noRepo} title={noRepo ? t("noRepo") : undefined} onClick={() => setWizardOpen(true)}>
          {t("updateConfig")}
        </Button>
        <Button kind="primary" size="sm" icon="Plus" disabled={noRepo} title={noRepo ? t("noRepo") : undefined} onClick={() => setWizardOpen(true)}>
          {t("addToCi")}
        </Button>
      </div>
      {noRepo && <div style={s.hint}>{t("noRepo")}</div>}

      {overview.isLoading ? (
        <Skeleton height={120} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {installations.map((i) => {
            const prUrl = safeHttpUrl(i.pr_url);
            return (
              <div key={i.id} style={s.row}>
                <span style={s.repo} title={i.repo}>
                  {i.repo}
                </span>
                <Badge icon="Workflow">{t("githubActions")}</Badge>
                <span style={s.meta}>{t("deployedVersion", { version: i.agent_version })}</span>
                {prUrl && (
                  <a href={prUrl} target="_blank" rel="noreferrer" style={s.link}>
                    {t("exportPr")}
                  </a>
                )}
                <span style={s.meta}>{latestRunText(i)}</span>
              </div>
            );
          })}
          <div style={s.addRow}>
            <Button kind="ghost" size="sm" icon="Plus" disabled={noRepo} onClick={() => setWizardOpen(true)}>
              {t("addRepository")}
            </Button>
          </div>
        </div>
      )}

      <div style={s.failOn}>
        <FormField label={t("failOnLabel")} hint={t("failOnHelp")}>
          <SelectInput
            value={agent.ci_fail_on}
            onChange={(v) => update.mutate({ id: agent.id, patch: { ci_fail_on: v as CiFailOn } })}
            options={failOnOptions}
          />
        </FormField>
      </div>

      <div>
        <h3 style={{ ...s.section, marginBottom: 10 }}>{t("historyTitle")}</h3>
        <CiRunsTable
          runs={overview.data?.runs ?? []}
          ingestErrors={overview.data?.ingest_errors ?? []}
          emptyTitle={t("noRunsYet")}
        />
      </div>

      {wizardOpen && activeRepo && (
        <ExportWizard agent={agent} repo={activeRepo.full_name} onClose={() => setWizardOpen(false)} />
      )}
    </div>
  );
}
