/* ReadingPathSection — numbered accent circles, mono path, grey rationale. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSection } from "@/lib/types";
import { s } from "../../styles";

type ReadingPath = Extract<OnboardingSection, { kind: "reading_path" }>;

export function ReadingPathSection({ section }: { section: ReadingPath }) {
  const t = useTranslations("onboarding");
  return (
    <>
      {section.ranking === "graph_only" && <p style={s.note}>{t("readingPath.graphOnly")}</p>}
      <ol style={s.readingList}>
        {section.items.map((item, i) => (
          <li key={item.path} style={s.rowTop}>
            <span style={s.circle} aria-hidden>
              {i + 1}
            </span>
            <span style={s.rowText}>
              <span className="mono" style={s.path} title={item.path}>
                {item.path}
              </span>
              {item.rationale && <span style={s.rationale}>{item.rationale}</span>}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
