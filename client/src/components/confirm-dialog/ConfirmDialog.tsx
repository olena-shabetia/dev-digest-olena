/* ConfirmDialog — shared Cancel/Confirm/✕ modal built on the vendored Modal
   primitive. Promoted straight to client/src/components/ (not a page-local
   _components/ folder) because it lands with two consumers in the same
   change — skill delete (SkillCard) and agent delete (AgentCard) — which is
   exactly client/INSIGHTS.md's "promote on second consumer" trigger, not a
   speculative first-write promotion. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = true,
  loading = false,
  onConfirm,
  onClose,
}: {
  title: React.ReactNode;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the Confirm button as `kind="danger"`. Defaults to true — every
   *  consumer today is a delete confirmation. */
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("common");
  return (
    <Modal
      width={420}
      title={title}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button kind="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel ?? t("actions.cancel")}
          </Button>
          <Button kind={danger ? "danger" : "primary"} onClick={onConfirm} disabled={loading}>
            {confirmLabel ?? t("actions.confirm")}
          </Button>
        </div>
      }
    >
      <div style={{ padding: "18px 24px", fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {body}
      </div>
    </Modal>
  );
}
