/* EvalsTab — placeholder. L06 (the eval pipeline) isn't built; reuses the
   app-wide "unbuilt screen" copy (`shell.featurePlaceholder.defaultBody`)
   instead of inventing new copy, same as the agent editor's own Evals tab.
   `eval_cases.owner_kind = 'skill'` exists in the schema but has no
   consuming pipeline yet. The header's "Run on evals" button is
   deliberately not rendered anywhere in SkillEditor for the same reason. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function EvalsTab() {
  const t = useTranslations("shell");
  const tSkills = useTranslations("skills");
  return (
    <EmptyState
      icon="FlaskConical"
      title={tSkills("editor.tabs.evals")}
      body={t("featurePlaceholder.defaultBody", { owner: "L06" })}
    />
  );
}
