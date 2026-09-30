/* ArchitectureSection — prose (Markdown), optional diagram, structure + stack lists. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import type { OnboardingSection } from "@/lib/types";
import { formatFileCount } from "../../helpers";
import { s } from "../../styles";

type Architecture = Extract<OnboardingSection, { kind: "architecture" }>;

export function ArchitectureSection({ section }: { section: Architecture }) {
  const t = useTranslations("onboarding");
  return (
    <>
      {section.prose && <Markdown>{section.prose}</Markdown>}
      {section.diagram && <MermaidDiagram chart={section.diagram} />}
      {section.structure.length > 0 && (
        <div>
          <div style={s.sublabel}>{t("architecture.structure")}</div>
          <ul style={s.bullets}>
            {section.structure.map((d) => (
              <li key={d.dir}>
                <span className="mono">{d.dir}/</span> — {t("architecture.files", { count: formatFileCount(d.files) })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {section.stack.length > 0 && (
        <div>
          <div style={s.sublabel}>{t("architecture.stack")}</div>
          <ul style={s.bullets}>
            {section.stack.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
