/* ReviewFocus — "read these first" list of file:line rows. Plain text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Badge } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { s } from "./styles";

export function ReviewFocus({
  items,
  knownPaths,
  onOpenFile,
}: {
  items: ReviewFocusItem[];
  knownPaths: ReadonlySet<string>;
  onOpenFile: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  if (items.length === 0) return null;
  return (
    <Card>
      <div style={{ padding: "12px 16px 14px" }}>
        <SectionLabel icon="ListChecks">
          <span style={s.headerRow}>
            {t("block.reviewFocus")}
            <Badge color="var(--accent-text)" bg="var(--accent-bg)">
              {t("focusCount", { count: items.length })}
            </Badge>
          </span>
        </SectionLabel>
        <ol style={s.list}>
          {items.map((item, i) => {
            const label = `${item.file}:${item.line}`;
            return (
              <li key={`${label}-${i}`} style={s.item}>
                <span style={s.bullet} aria-hidden>
                  {i + 1}.
                </span>
                {knownPaths.has(item.file) ? (
                  <button type="button" style={s.link} onClick={() => onOpenFile(item.file, item.line)}>
                    {label}
                  </button>
                ) : (
                  <span style={s.ref} title={t("fileNotInDiff")}>{label} · {t("fileNotInDiff")}</span>
                )}
                <span style={s.reason}>&mdash; {item.reason}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
