/* CaseRow — one eval case: status (icon + text), name, result line, target,
   severity/category, edit and delete. Everything user-authored (name, path,
   error text) is a plain text node. No per-row run. */
"use client";

import React, { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, type Severity } from "@devdigest/ui";
import type { EvalCaseListItem } from "@devdigest/shared";
import { STATUS_COLOR, STATUS_ICON } from "../../constants";
import { caseStatus, formatTarget } from "../../helpers";
import { s } from "./styles";

export function CaseRow({
  item,
  onEdit,
  onDelete,
}: {
  item: EvalCaseListItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("evalsTab");
  const shared = useTranslations("eval.shared");
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorFocused, setErrorFocused] = useState(false);
  const errorId = useId();

  const status = caseStatus(item);
  const last = item.last_result;
  const StatusIcon = Icon[STATUS_ICON[status]];
  const target = formatTarget(item.expectation);
  const error = status === "errored" ? (last?.error ?? "") : "";

  const resultText = !last
    ? shared("status.neverRun")
    : item.expectation.type === "must_find"
      ? t("resultMustFind", { expected: last.expected, matched: last.matched })
      : t("resultMustNotFlag", { matched: last.matched });

  return (
    <li style={s.row}>
      <div style={s.main}>
        <span style={{ color: STATUS_COLOR[status], display: "inline-flex" }} aria-hidden>
          <StatusIcon size={18} />
        </span>
        <div style={s.text}>
          <span style={s.name} title={item.name}>
            {item.name}
          </span>
          <span style={s.result}>
            <span>{shared(`status.${status === "never" ? "neverRun" : status}`)}</span>
            <span>· {resultText}</span>
            <span>· {shared(`expectation.${item.expectation.type}`)}</span>
            {error && (
              <button
                type="button"
                style={s.errorToggle}
                title={error}
                aria-describedby={errorId}
                onFocus={() => setErrorFocused(true)}
                onBlur={() => setErrorFocused(false)}
                aria-expanded={errorOpen}
                onClick={() => setErrorOpen((v) => !v)}
              >
                {errorOpen ? t("hideError") : t("showError")}
              </button>
            )}
            {error && (
              <span id={errorId} style={srOnly}>
                {error}
              </span>
            )}
          </span>
        </div>
        <div style={s.target}>
          <span style={s.path} title={target}>
            {target}
          </span>
          <SeverityBadge severity={item.expectation.severity as Severity} compact />
          <span style={s.category}>{item.expectation.category}</span>
        </div>
        <div style={s.actions}>
          <button
            type="button"
            aria-label={t("editCase", { name: item.name })}
            title={t("editCase", { name: item.name })}
            onClick={onEdit}
            style={iconButton}
          >
            <Icon.Edit size={15} />
          </button>
          <button
            type="button"
            aria-label={t("deleteCase", { name: item.name })}
            title={t("deleteCase", { name: item.name })}
            onClick={onDelete}
            style={iconButton}
          >
            <Icon.Trash size={15} />
          </button>
        </div>
      </div>
      {error && (errorOpen || errorFocused) && <div style={s.errorLine}>{error}</div>}
    </li>
  );
}

const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const iconButton: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 6,
  cursor: "pointer",
  color: "var(--text-muted)",
  display: "inline-flex",
};
