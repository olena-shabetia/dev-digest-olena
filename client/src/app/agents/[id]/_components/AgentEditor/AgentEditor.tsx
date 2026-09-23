/* AgentEditor — Config/Skills/Stats tabs (L02 adds Skills + Stats; Evals/CI
   are still unbuilt). Tab state lives in ?tab= for forward-compatibility. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { SkillsTab } from "./_components/SkillsTab";
import { StatsTab } from "./_components/StatsTab";
import { TABS } from "./constants";
import { s } from "./styles";

function renderTab(tab: string, agent: Agent) {
  if (tab === "skills") return <SkillsTab agent={agent} />;
  if (tab === "stats") return <StatsTab agent={agent} />;
  return <ConfigTab agent={agent} />;
}

export function AgentEditor({ agent, tab, onTab }: { agent: Agent; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>{renderTab(tab, agent)}</div>
    </div>
  );
}
