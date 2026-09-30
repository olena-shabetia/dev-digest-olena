/* SectionCard — collapsible shell (aria-expanded), expanded by default. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "../../styles";

export function SectionCard({
  id,
  icon,
  title,
  active,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("onboarding");
  const [open, setOpen] = React.useState(true);
  const SectionIcon = Icon[icon];
  const bodyId = `${id}-body`;
  return (
    <section id={id} style={s.card(active)} aria-label={title}>
      <button
        type="button"
        style={s.cardHead}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        <SectionIcon size={16} />
        <span style={s.cardTitle}>{title}</span>
        <span aria-label={open ? t("card.collapse", { title }) : t("card.expand", { title })} role="img">
          {open ? <Icon.ChevronDown size={16} /> : <Icon.ChevronRight size={16} />}
        </span>
      </button>
      {open && (
        <div id={bodyId} style={s.cardBody}>
          {children}
        </div>
      )}
    </section>
  );
}
