/* ConfigureRun — step 1 (pick a PR) + step 2 (pick agents) + the run footer,
   for the standalone /multi-agent screen. Mirrors AgentPickerPopover's
   selection model but as a full page section rather than a popover. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, SearchableSelect } from "@devdigest/ui";
import { useActiveRepo } from "@/lib/repo-context";
import { useAgents, usePulls, usePrReviews } from "@/lib/hooks";
import { useAgentRunEstimates, useStartMultiAgentReview } from "@/lib/hooks/multi-agent";
import { formatCost } from "@/lib/format";
import { formatEstimateDuration, multiAgentRunHref } from "@/lib/multi-agent";
import type { AgentRunEstimate } from "@devdigest/shared";
import { AgentCard } from "./_components/AgentCard";
import { aggregateEstimate, previewForAgent } from "./helpers";
import { s } from "./styles";

export function ConfigureRun() {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const search = useSearchParams();
  const { activeRepo } = useActiveRepo();

  const { data: pulls } = usePulls(activeRepo?.id ?? null);
  const { data: agentsData } = useAgents();
  const agents = agentsData ?? [];
  const { data: estimatesData } = useAgentRunEstimates();
  const estimateByAgent = React.useMemo(() => {
    const m = new Map<string, AgentRunEstimate>();
    for (const e of estimatesData ?? []) m.set(e.agent_id, e);
    return m;
  }, [estimatesData]);

  const prParam = search.get("pr");
  const [prOverride, setPrOverride] = React.useState<string | null>(null);
  const prId =
    prOverride ?? (prParam && (pulls ?? []).some((p) => p.id === prParam) ? prParam : null);

  const { data: reviews } = usePrReviews(prId);

  const agentsParam = search.get("agents");
  const paramSelected = React.useMemo(() => {
    if (!agentsParam) return null;
    const ids = new Set(
      agentsParam.split(",").filter((id) => (agentsData ?? []).some((a) => a.id === id)),
    );
    return ids.size > 0 ? ids : null;
  }, [agentsParam, agentsData]);
  const defaultSelected = React.useMemo(
    () => new Set((agentsData ?? []).filter((a) => a.enabled).map((a) => a.id)),
    [agentsData],
  );
  const [overrides, setOverrides] = React.useState<Set<string> | null>(null);
  const selected = overrides ?? paramSelected ?? defaultSelected;
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOverrides(next);
  };
  const selectAll = () => setOverrides(new Set(agents.map((a) => a.id)));

  const start = useStartMultiAgentReview();
  const agg = aggregateEstimate(Array.from(selected), estimateByAgent);

  const run = async () => {
    if (!prId || selected.size === 0) return;
    const res = await start.mutateAsync({ prId, agentIds: Array.from(selected) });
    if (!res.multi_agent_run_id) {
      throw new Error("multi-agent review response is missing multi_agent_run_id");
    }
    router.push(multiAgentRunHref(res.multi_agent_run_id));
  };

  const prOptions = (pulls ?? [])
    .filter((p): p is typeof p & { id: string } => p.id != null)
    .map((p) => ({ value: p.id, label: t("prItem", { number: p.number, title: p.title }) }));

  const durationText =
    agg.durationMs == null
      ? t("estimate.none")
      : `${agg.durationPartial ? "≥" : ""}${formatEstimateDuration(agg.durationMs)}`;
  const costText =
    agg.costUsd == null ? t("estimate.none") : `${agg.costPartial ? "≥" : ""}${formatCost(agg.costUsd)}`;

  return (
    <section style={s.root}>
      <div>
        <div style={s.heading}>{t("configure.step1")}</div>
        {prOptions.length === 0 ? (
          <EmptyState icon="GitPullRequest" title={t("configure.noPrs.title")} body={t("configure.noPrs.body")} />
        ) : (
          <SearchableSelect
            value={prId ?? ""}
            onChange={setPrOverride}
            options={prOptions}
            placeholder={t("configure.selectPr")}
            mono={false}
          />
        )}
      </div>

      <div>
        <div style={s.heading}>{t("configure.step2")}</div>
        {!prId ? (
          <div style={s.placeholder}>{t("configure.pickPrFirst")}</div>
        ) : agents.length === 0 ? (
          <EmptyState
            icon="Cpu"
            title={t("noAgents.title")}
            body={t("noAgents.body")}
            cta={t("noAgents.cta")}
            onCta={() => router.push("/agents")}
          />
        ) : (
          <>
            <div style={s.selectAllRow}>
              <button type="button" onClick={selectAll} style={s.selectAllBtn}>
                {t("configure.selectAll")}
              </button>
            </div>
            <div style={s.cards}>
              {agents.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  checked={selected.has(a.id)}
                  onToggle={() => toggle(a.id)}
                  estimate={estimateByAgent.get(a.id)}
                  preview={previewForAgent(a, reviews)}
                />
              ))}
            </div>
            <div style={s.footer}>
              <span style={s.footerText}>
                {t("configure.footerPrefix")} {durationText} · {costText} · {t("configure.inParallel")}
              </span>
              <Button
                kind="primary"
                disabled={selected.size === 0 || start.isPending}
                loading={start.isPending}
                onClick={run}
              >
                {t("configure.run")}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default ConfigureRun;
