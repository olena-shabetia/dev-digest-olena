/* TourToc — "On this page" anchor list; highlights the section in view. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SECTION_ANCHOR, SECTION_ORDER, SECTION_TITLE_KEY } from "../../constants";
import { s } from "../../styles";

export function TourToc({ active, onSelect }: { active: string; onSelect: (anchor: string) => void }) {
  const t = useTranslations("onboarding");
  return (
    <nav style={s.toc} aria-label={t("toc.title")}>
      <div style={s.tocTitle}>{t("toc.title")}</div>
      {SECTION_ORDER.map((kind) => {
        const anchor = SECTION_ANCHOR[kind];
        return (
          <button
            key={kind}
            type="button"
            style={s.tocItem(active === anchor)}
            aria-current={active === anchor ? "true" : undefined}
            onClick={() => onSelect(anchor)}
          >
            {t(SECTION_TITLE_KEY[kind])}
          </button>
        );
      })}
    </nav>
  );
}
