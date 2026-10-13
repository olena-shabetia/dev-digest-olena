/* AgentPickerPopover — the PR page's "Run Review" control (L07). Lets a
   reviewer pick any subset of agents and kick off one multi-agent run.
   Unlike the vendor Dropdown (which closes on every click and has no
   checkbox items), this is a feature-local popover that stays open while
   agents are (de)selected, and closes only on an outside click, Escape, or
   a successful run. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, EmptyState, Icon } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentRunEstimates, useStartMultiAgentReview } from "@/lib/hooks/multi-agent";
import { formatEstimateDuration, multiAgentRunHref } from "@/lib/multi-agent";
import { PANEL_WIDTH } from "./constants";
import { s } from "./styles";

export function AgentPickerPopover({
  prId,
  warnMerged = false,
  onRunsStarted,
}: {
  prId: string;
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired once the run has been kicked off (before it completes). */
  onRunsStarted?: () => void;
}) {
  const t = useTranslations("multiAgentPicker");
  const tReview = useTranslations("prReview");
  const router = useRouter();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  // null = no user override yet; falls back to the enabled-agents default so
  // toggling one agent doesn't need to "seed" the rest from a useEffect.
  const [overrides, setOverrides] = React.useState<Set<string> | null>(null);

  const { data: agentsData } = useAgents();
  const agents = agentsData ?? [];
  const { data: estimates } = useAgentRunEstimates();
  const estimateByAgent = React.useMemo(() => {
    const m = new Map<string, number | null>();
    for (const e of estimates ?? []) m.set(e.agent_id, e.avg_duration_ms);
    return m;
  }, [estimates]);

  const defaultSelected = React.useMemo(
    () => new Set((agentsData ?? []).filter((a) => a.enabled).map((a) => a.id)),
    [agentsData],
  );
  const selected = overrides ?? defaultSelected;
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOverrides(next);
  };
  const clear = () => setOverrides(new Set());

  const start = useStartMultiAgentReview();

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const run = async () => {
    const agentIds = Array.from(selected);
    if (agentIds.length === 0) return;
    const res = await start.mutateAsync({ prId, agentIds });
    if (!res.multi_agent_run_id) {
      throw new Error("multi-agent review response is missing multi_agent_run_id");
    }
    onRunsStarted?.();
    setOpen(false);
    router.push(multiAgentRunHref(res.multi_agent_run_id));
  };

  return (
    <div ref={rootRef} style={s.root}>
      <span
        title={warnMerged ? tReview("runReview.mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
      >
        <Button
          kind="primary"
          size="sm"
          icon="Sparkles"
          iconRight="ChevronDown"
          loading={start.isPending}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((o) => !o)}
        >
          {start.isPending ? tReview("runReview.running") : tReview("runReview.runReview")}
        </Button>
      </span>
      {open && (
        <div role="dialog" aria-label={t("panel.label")} style={{ ...s.panel, width: PANEL_WIDTH }}>
          {warnMerged && (
            <div style={s.warning}>
              <Icon.AlertTriangle size={13} />
              <span>{tReview("runReview.mergedWarning")}</span>
            </div>
          )}
          {agents.length === 0 ? (
            <EmptyState
              icon="Cpu"
              title={t("empty.title")}
              body={t("empty.body")}
              cta={t("empty.cta")}
              onCta={() => router.push("/agents")}
            />
          ) : (
            <>
              <div style={s.list}>
                {agents.map((a) => {
                  const est = formatEstimateDuration(estimateByAgent.get(a.id) ?? null);
                  return (
                    <Checkbox
                      key={a.id}
                      checked={selected.has(a.id)}
                      onChange={() => toggle(a.id)}
                      label={
                        <span style={s.row}>
                          <Icon.Cpu size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                          <span style={s.name}>{a.name}</span>
                          <span style={s.estimate}>{est ?? t("estimate.none")}</span>
                        </span>
                      }
                    />
                  );
                })}
              </div>
              <div style={s.actions}>
                <Button kind="ghost" size="sm" onClick={clear}>
                  {t("clear")}
                </Button>
                <Button
                  kind="primary"
                  size="sm"
                  disabled={selected.size === 0 || start.isPending}
                  loading={start.isPending}
                  onClick={run}
                >
                  {t("run", { count: selected.size })}
                </Button>
              </div>
              <button type="button" onClick={() => router.push("/agents")} style={s.configure}>
                {t("configureAgents")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AgentPickerPopover;
