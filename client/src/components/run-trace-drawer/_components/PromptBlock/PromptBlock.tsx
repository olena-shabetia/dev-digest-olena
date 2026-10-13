/* PromptBlock — one labelled, collapsible prompt segment with copy + fullscreen
   actions; fullscreen opens PromptModalBody in a Modal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal } from "@devdigest/ui";
import { formatTokenCount } from "@/lib/format";
import { s } from "../../styles";
import { PromptModalBody } from "../PromptModalBody";

const miniBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
  borderRadius: 5,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text-muted)",
  cursor: "pointer",
};

export function PromptBlock({
  label,
  text,
  color,
  tokens,
  displayTransform,
}: {
  label: string;
  text: string;
  color: string;
  /** Approx. token count chip (`~N tok`) shown in the header — passed only
   *  for the Skills block today (`assembly.skills_tokens`, HW2 criterion 19).
   *  Omitted (no chip) when `null`/`undefined`. */
  tokens?: number | null;
  /** L05 (D12) — presentation-only transform applied to `text` before it is
   *  shown inline, in the fullscreen modal, and copied. The persisted
   *  `text` itself is never mutated. Used by the Project-context row only. */
  displayTransform?: (raw: string) => string;
}) {
  const t = useTranslations("runs");
  const [open, setOpen] = React.useState(false);
  const [full, setFull] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const shown = displayTransform ? displayTransform(text) : text;
  const copy = () => {
    void navigator.clipboard?.writeText(shown || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  React.useEffect(() => {
    if (!full) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [full]);
  return (
    <div style={s.promptRow}>
      <div onClick={() => setOpen((o) => !o)} style={s.promptHead}>
        <span style={s.promptDot(color)} />
        <span style={s.promptLabel}>{label}</span>
        {tokens != null && (
          <span className="mono tnum" style={s.promptTokens}>
            {t("trace.prompt.tokens", { count: formatTokenCount(tokens) })}
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            title={t("trace.prompt.copy")}
            aria-label={t("trace.prompt.copy")}
            onClick={(e) => {
              e.stopPropagation();
              copy();
            }}
            style={miniBtnStyle}
          >
            {copied ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
          </button>
          <button
            type="button"
            title={t("trace.prompt.fullscreen")}
            aria-label={t("trace.prompt.fullscreen")}
            onClick={(e) => {
              e.stopPropagation();
              setFull(true);
            }}
            style={miniBtnStyle}
          >
            <Icon.ExternalLink size={12} />
          </button>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {open ? t("trace.collapse") : t("trace.expand")}
          </span>
        </span>
      </div>
      {open && (
        <pre className="mono" style={s.promptPre}>
          {shown || "—"}
        </pre>
      )}
      {full && (
        <Modal
          width={1200}
          title={label}
          onClose={() => setFull(false)}
          footer={
            <Button kind="secondary" size="sm" icon={copied ? "Check" : "Copy"} onClick={copy}>
              {copied ? t("drawer.copied") : t("trace.prompt.copy")}
            </Button>
          }
        >
          <PromptModalBody text={shown} />
        </Modal>
      )}
    </div>
  );
}
