/* RunLocallySection — numbered mono command rows with a per-row copy icon. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingCommand, OnboardingSection } from "@/lib/types";
import { COPIED_FEEDBACK_MS } from "../../constants";
import { commandCopyText } from "../../helpers";
import { s } from "../../styles";

type RunLocally = Extract<OnboardingSection, { kind: "run_locally" }>;

function CommandRow({ index, cmd }: { index: number; cmd: OnboardingCommand }) {
  const t = useTranslations("onboarding");
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(commandCopyText(cmd));
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  };
  return (
    <li style={s.commandRow}>
      <span className="mono" style={s.commandIndex} aria-hidden>
        {index + 1}
      </span>
      <code className="mono" style={s.command}>
        {cmd.command}
        {cmd.comment ? ` # ${cmd.comment}` : ""}
      </code>
      {copied && <span style={s.copiedLabel}>{t("copy.done")}</span>}
      <button type="button" style={s.copyBtn} aria-label={t("copy.aria", { command: cmd.command })} onClick={copy}>
        {copied ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
      </button>
    </li>
  );
}

export function RunLocallySection({ section }: { section: RunLocally }) {
  return (
    <ol style={s.list}>
      {section.items.map((cmd, i) => (
        <CommandRow key={`${i}-${cmd.command}`} index={i} cmd={cmd} />
      ))}
    </ol>
  );
}
