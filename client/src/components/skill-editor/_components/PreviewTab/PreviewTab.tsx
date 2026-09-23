/* PreviewTab — renders the skill body as the reviewing agent receives it
   (Markdown), plus the untrusted-source notice for a wrapped skill. Must
   mirror `resolveSkillBodies` (server/src/platform/prompt.ts) exactly:
   'manual' AND 'extracted' pass through unwrapped ('extracted' bodies are
   our own template over code-verified evidence from the conventions
   extractor, not third-party text); only 'imported_url'/'community' are
   actually delimiter-wrapped at review time. Showing this banner for
   'extracted' would tell the user the opposite of what really happens. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown, Badge } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const untrusted = skill.source !== "manual" && skill.source !== "extracted";

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{t("preview.caption")}</div>
      {untrusted && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--border-strong)",
            background: "var(--bg-elevated)",
            marginBottom: 16,
          }}
        >
          <Badge color="var(--warn)" icon="AlertTriangle">
            {t("preview.untrustedBadge")}
          </Badge>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("preview.untrustedNotice")}</span>
        </div>
      )}
      <Markdown>{skill.body}</Markdown>
    </div>
  );
}
