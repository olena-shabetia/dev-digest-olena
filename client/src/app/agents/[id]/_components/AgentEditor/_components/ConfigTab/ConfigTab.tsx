"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, SearchableSelect, Textarea, Toggle, Button } from "@devdigest/ui";
import type { Agent, CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";
import { useUpdateAgent, useProviderModels } from "../../../../../../../lib/hooks/agents";
import { useToast } from "../../../../../../../lib/toast";
import { toModelOptions } from "../../../../../../../lib/model-label";
import {
  CI_FAIL_ON_VALUES,
  OUTPUT_SCHEMA_VALUE,
  PROVIDER_OPTIONS,
  STRATEGY_VALUES,
  SYSTEM_PROMPT_TOKEN_BUDGET,
} from "./constants";
import { s } from "./styles";

/** Config tab — name/description/provider/model/system-prompt + enabled toggle. */
export function ConfigTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  const [name, setName] = React.useState(agent.name);
  const [description, setDescription] = React.useState(agent.description);
  const [provider, setProvider] = React.useState<Provider>(agent.provider);
  const [model, setModel] = React.useState(agent.model);
  const [systemPrompt, setSystemPrompt] = React.useState(agent.system_prompt);
  const [strategy, setStrategy] = React.useState<ReviewStrategy>(agent.strategy);
  const [ciFailOn, setCiFailOn] = React.useState<CiFailOn>(agent.ci_fail_on);
  const [repoIntel, setRepoIntel] = React.useState(agent.repo_intel);
  const [enabled, setEnabled] = React.useState(agent.enabled);

  // Reset local form when switching agents.
  React.useEffect(() => {
    setName(agent.name);
    setDescription(agent.description);
    setProvider(agent.provider);
    setModel(agent.model);
    setSystemPrompt(agent.system_prompt);
    setStrategy(agent.strategy);
    setCiFailOn(agent.ci_fail_on);
    setRepoIntel(agent.repo_intel);
    setEnabled(agent.enabled);
  }, [agent.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: models } = useProviderModels(provider);
  // Show the price (USD per 1M in/out tokens) in the label when the provider
  // exposes it (OpenRouter) so a cheap model is easy to pick; value stays the id.
  const modelOptions = toModelOptions(models);
  const hasModel = modelOptions.some((o) => (typeof o === "string" ? o : o.value) === model);
  if (!hasModel) modelOptions.unshift(model);
  // Empty list after load = provider key missing/invalid (listModels failed) —
  // guide the user instead of showing a silent one-item dropdown.
  const noModels = models !== undefined && models.length === 0;

  // Rough client-side estimate (chars/4) against a soft authoring budget —
  // not real tokenization, no js-tiktoken in the client bundle for this.
  const systemPromptTokens = Math.ceil(systemPrompt.length / 4);

  // Friendly labels for the strategy select (values come from constants).
  const strategyOptions = STRATEGY_VALUES.map((v) => ({ value: v, label: t(`config.strategyOptions.${v}`) }));
  const ciFailOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: t(`config.ciFailOnOptions.${v}`) }));

  // Nothing to save — keep the button disabled here too, not just while a
  // save is in flight, so a no-op click can't fire a PUT and bump
  // agent_versions for zero actual change (mirrors the same fix on the
  // skill editor's ConfigTab).
  const hasChanges =
    name !== agent.name ||
    description !== agent.description ||
    provider !== agent.provider ||
    model !== agent.model ||
    systemPrompt !== agent.system_prompt ||
    strategy !== agent.strategy ||
    ciFailOn !== agent.ci_fail_on ||
    repoIntel !== agent.repo_intel ||
    enabled !== agent.enabled;

  const save = () =>
    update.mutate(
      {
        id: agent.id,
        patch: {
          name,
          description,
          provider,
          model,
          system_prompt: systemPrompt,
          strategy,
          ci_fail_on: ciFailOn,
          repo_intel: repoIntel,
          enabled,
        },
      },
      {
        // Failures are surfaced by the global mutation error toast; confirm the
        // save with a success toast (not just the inline "Saved (vN)" note).
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.provider")}>
        <SelectInput
          value={provider}
          onChange={(v) => setProvider(v as Provider)}
          options={[...PROVIDER_OPTIONS]}
        />
      </FormField>
      <FormField
        label={t("config.model")}
        hint={noModels ? t("config.modelEmptyHint", { provider }) : t("config.modelHint")}
      >
        <SearchableSelect
          value={model}
          onChange={setModel}
          options={modelOptions}
          placeholder={t("config.modelSearch")}
        />
      </FormField>
      <FormField label={t("config.strategy")} hint={t("config.strategyHint")}>
        <SelectInput
          value={strategy}
          onChange={(v) => setStrategy(v as ReviewStrategy)}
          options={strategyOptions}
        />
      </FormField>
      <FormField label={t("config.ciFailOn")} hint={t("config.ciFailOnHint")}>
        <SelectInput
          value={ciFailOn}
          onChange={(v) => setCiFailOn(v as CiFailOn)}
          options={ciFailOnOptions}
        />
      </FormField>
      <FormField label={t("config.repoIntel")} hint={t("config.repoIntelHint")}>
        <label style={s.enabledLabel}>
          <Toggle on={repoIntel} onChange={setRepoIntel} size={16} />
        </label>
      </FormField>
      <FormField
        label={t("config.systemPrompt")}
        hint={t("config.systemPromptHint")}
        right={
          <span style={s.tokenCounter}>
            {t("config.systemPromptTokens", {
              count: systemPromptTokens.toLocaleString(),
              budget: SYSTEM_PROMPT_TOKEN_BUDGET.toLocaleString(),
            })}
          </span>
        }
      >
        <Textarea value={systemPrompt} onChange={setSystemPrompt} rows={8} mono />
      </FormField>
      <FormField label={t("config.outputSchema")}>
        <SelectInput value={OUTPUT_SCHEMA_VALUE} options={[OUTPUT_SCHEMA_VALUE]} />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || !hasChanges}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
