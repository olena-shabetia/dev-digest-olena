/* CompareRunsModal — two-run Compare (U-52…U-57). The server decides which run
   is older and returns every delta; this only formats and colors them. */
"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import { useEvalCompare } from "@/lib/hooks/eval";
import { formatDeltaPoints, formatPercent } from "@/lib/eval-format";
import { formatCost } from "@/lib/format";
import { useDialogKeys } from "@/lib/hooks";
import { LINE_PREFIX, deltaDirection, promptDiffLines, skillsLabel } from "./helpers";
import { s } from "./styles";

const GOOD = "var(--ok)";
const BAD = "var(--crit)";
const FLAT = "var(--text-muted)";

function deltaColor(direction: "up" | "down" | "flat", higherIsBetter: boolean) {
  if (direction === "flat") return FLAT;
  return (direction === "up") === higherIsBetter ? GOOD : BAD;
}

export function CompareRunsModal({ idA, idB, onClose }: { idA: string; idB: string; onClose: () => void }) {
  const t = useTranslations("evalDashboard.compare");
  const te = useTranslations("eval.shared");
  const { data, isLoading, isError, refetch } = useEvalCompare(idA, idB, true);
  const anchor = useRef<HTMLDivElement>(null);
  useDialogKeys(anchor, { onEscape: onClose, active: true });
  const na = te("notApplicable");

  const metrics = data
    ? ([
        ["recall", data.base.recall, data.head.recall, data.delta.recall],
        ["precision", data.base.precision, data.head.precision, data.delta.precision],
        ["citationAccuracy", data.base.citation_accuracy, data.head.citation_accuracy, data.delta.citation_accuracy],
      ] as const)
    : [];
  const costDir = data ? deltaDirection(data.delta.cost_usd) : null;

  return (
    <Modal
      width={860}
      title={data ? t("title", { base: data.base.version_label, head: data.head.version_label }) : t("titlePending")}
      subtitle={t("subtitle")}
      onClose={onClose}
      footer={
        <Button kind="secondary" onClick={onClose}>
          {t("close")}
        </Button>
      }
    >
      <div ref={anchor} style={s.body}>
        {isError ? (
          <ErrorState title={t("loadFailed")} onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <>
            <Skeleton height={80} />
            <Skeleton height={160} />
          </>
        ) : (
          <>
            {!data.comparable && (
              <div role="alert" style={s.warning}>
                {t("warning", {
                  onlyBase: data.cases_only_in_base.length,
                  onlyHead: data.cases_only_in_head.length,
                  edited: data.cases_edited.length,
                })}
              </div>
            )}

            <div style={s.cards}>
              {metrics.map(([key, base, head, delta]) => {
                const d = formatDeltaPoints(delta);
                const text = d ? te("metrics.deltaLabel", { direction: d.direction, points: d.text }) : null;
                return (
                  <div key={key} style={s.card}>
                    <div style={s.label}>{te(`metrics.${key}`)}</div>
                    <div style={s.values}>
                      <span className="tnum" style={s.base}>{formatPercent(base) ?? na}</span>
                      <span aria-hidden>→</span>
                      <span className="tnum" style={s.head}>{formatPercent(head) ?? na}</span>
                      {d && text && (
                        <span className="tnum" style={{ ...s.delta, color: deltaColor(d.direction, true) }}>{text}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div style={s.card}>
                <div style={s.label}>{t("cost")}</div>
                <div style={s.values}>
                  <span className="tnum" style={s.base}>{formatCost(data.base.cost_usd)}</span>
                  <span aria-hidden>→</span>
                  <span className="tnum" style={s.head}>{formatCost(data.head.cost_usd)}</span>
                  {costDir && data.delta.cost_usd != null && (
                    <span className="tnum" style={{ ...s.delta, color: deltaColor(costDir, false) }}>
                      {t("costDelta", { direction: costDir, amount: formatCost(Math.abs(data.delta.cost_usd)) })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={s.heading}>{t("promptHeading")}</div>
            {data.prompt_changed ? (
              <pre style={s.pre}>
                {promptDiffLines(data.base.system_prompt, data.head.system_prompt).map((l, i) => (
                  <span key={i} style={{ ...s.line, ...(l.kind === "added" ? s.added : l.kind === "removed" ? s.removed : {}) }}>
                    {LINE_PREFIX[l.kind]}
                    {l.text}
                  </span>
                ))}
              </pre>
            ) : (
              <>
                <div style={s.muted}>{t("promptUnchanged")}</div>
                <ul style={s.list}>
                  <li>
                    {data.model_changed
                      ? t("modelChanged", {
                          base: `${data.base.provider}/${data.base.model}`,
                          head: `${data.head.provider}/${data.head.model}`,
                        })
                      : t("modelSame")}
                  </li>
                  <li>
                    {data.skills_changed
                      ? t("skillsChanged", {
                          base: skillsLabel(data.base.skills, t("noSkills")),
                          head: skillsLabel(data.head.skills, t("noSkills")),
                        })
                      : t("skillsSame")}
                  </li>
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
