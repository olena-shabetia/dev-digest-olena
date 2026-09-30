/* FirstTasksSection — responsive grid of task cards (title, path line, complexity badge). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import type { OnboardingSection } from "@/lib/types";
import { openExternal } from "../../helpers";
import { s } from "../../styles";
import { COMPLEXITY_TONE } from "./constants";

type FirstTasks = Extract<OnboardingSection, { kind: "first_tasks" }>;

export function FirstTasksSection({
  section,
  fullName,
  indexSha,
}: {
  section: FirstTasks;
  fullName: string;
  indexSha: string | null;
}) {
  const t = useTranslations("onboarding");
  if (section.items.length === 0) return <p style={s.note}>{t("firstTasks.unavailable")}</p>;
  return (
    <div style={s.taskGrid}>
      {section.items.map((task, i) => {
        const path = task.paths[0];
        const tone = COMPLEXITY_TONE[task.complexity];
        return (
          <div key={`${i}-${task.title}`} style={s.taskCard} title={task.detail}>
            <span style={s.taskTitle}>{task.title}</span>
            {path !== undefined && (
              <button
                type="button"
                className="mono"
                style={s.taskPath}
                title={path}
                aria-label={t("open.aria", { path })}
                disabled={indexSha === null}
                onClick={() => indexSha && openExternal(githubBlobUrl(fullName, indexSha, path))}
              >
                {path}
              </button>
            )}
            <Badge color={tone.color} bg={tone.bg}>
              {t(`firstTasks.complexity.${task.complexity}`)}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
