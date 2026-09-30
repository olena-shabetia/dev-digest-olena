/* CriticalPathsSection — mono path (truncated + tooltip), " — reason", Open on GitHub. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import type { OnboardingSection } from "@/lib/types";
import { openExternal } from "../../helpers";
import { s } from "../../styles";

type CriticalPaths = Extract<OnboardingSection, { kind: "critical_paths" }>;

export function CriticalPathsSection({
  section,
  fullName,
  indexSha,
}: {
  section: CriticalPaths;
  fullName: string;
  indexSha: string | null;
}) {
  const t = useTranslations("onboarding");
  return (
    <ul style={s.list}>
      {section.items.map((item) => (
        <li key={item.path} style={s.pathRow}>
          <Icon.FileText size={14} style={s.pathIcon} aria-hidden />
          <span style={s.pathInline}>
            <span className="mono" style={s.path} title={item.path}>
              {item.path}
            </span>
            {item.reason && <span style={s.reason}>— {item.reason}</span>}
          </span>
          <Button
            kind="secondary"
            size="sm"
            aria-label={t("open.aria", { path: item.path })}
            disabled={indexSha === null}
            onClick={() => indexSha && openExternal(githubBlobUrl(fullName, indexSha, item.path))}
          >
            {t("open.label")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
