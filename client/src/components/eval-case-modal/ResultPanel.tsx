/* ResultPanel — the strip under the expected output plus the surviving
   findings list. Everything shown (status, matched flags, cost) is what the
   server returned; nothing is computed here. All text renders as plain text. */
"use client";

import { useTranslations } from "next-intl";
import { SeverityBadge, type Severity } from "@devdigest/ui";
import type { EvalCaseLastResult, EvalDraftRunResult, EvalExpectationType } from "@devdigest/shared";
import { formatCost, formatSeconds } from "@/lib/format";
import { s } from "./styles";

export function ResultPanel({
  result,
  stale,
  runError,
  lastResult,
  expectationType,
}: {
  result: EvalDraftRunResult | null;
  stale: boolean;
  runError: string | null;
  lastResult: EvalCaseLastResult | null;
  expectationType: EvalExpectationType;
}) {
  const t = useTranslations("evalCase");
  const ce = useTranslations("eval.caseEditor");
  const shared = useTranslations("eval.shared");

  // A same-size error strip replaces the result strip when a run fails (U-16d).
  if (runError !== null) {
    return (
      <div
        role="alert"
        style={{ ...s.strip, borderColor: "var(--crit)", color: "var(--crit)" }}
      >
        {t("result.runFailed", { message: runError })}
      </div>
    );
  }

  if (result) {
    const passed = result.status === "passed";
    return (
      <>
        <div
          role="status"
          style={{
            ...s.strip,
            borderColor: passed ? "var(--ok)" : "var(--crit)",
            opacity: stale ? 0.55 : 1,
          }}
        >
          <strong>{passed ? ce("lastRunPassed") : ce("lastRunFailed")}</strong>
          <span>
            {expectationType === "must_find"
              ? t("result.summary", { expected: result.expected, matched: result.matched })
              : t("result.mustNotFlag", { matched: result.matched })}
          </span>
          <span>{formatSeconds(result.duration_ms)}</span>
          <span>{result.cost_usd == null ? shared("costUnknown") : formatCost(result.cost_usd)}</span>
          {stale && <em>{t("editedSinceRun")}</em>}
        </div>
        <div style={{ opacity: stale ? 0.55 : 1 }}>
          <div style={s.sectionLabel}>{t("result.findingsHeading")}</div>
          {result.findings.length === 0 ? (
            <div style={s.footerHint}>{t("result.noFindings")}</div>
          ) : (
            <ul style={s.findingsList}>
              {result.findings.map((f, i) => (
                <li key={`${f.file}:${f.start_line}:${f.end_line}:${i}`} style={s.findingRow}>
                  <SeverityBadge severity={f.severity as Severity} compact />
                  <span className="mono">
                    {f.file} · {t("result.lines", { start: f.start_line, end: f.end_line })}
                  </span>
                  <span>{f.title}</span>
                  <em>{f.matched ? t("result.matched") : t("result.notMatched")}</em>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  if (lastResult) {
    const passed = lastResult.status === "passed";
    return (
      <div
        role="status"
        style={{ ...s.strip, borderColor: passed ? "var(--ok)" : "var(--crit)" }}
      >
        <strong>{shared(`status.${lastResult.status}`)}</strong>
        {lastResult.status === "errored" ? (
          <span>{lastResult.error ?? ""}</span>
        ) : (
          <span>
            {expectationType === "must_find"
              ? t("result.summary", { expected: lastResult.expected, matched: lastResult.matched })
              : t("result.mustNotFlag", { matched: lastResult.matched })}
          </span>
        )}
        {lastResult.duration_ms != null && <span>{formatSeconds(lastResult.duration_ms)}</span>}
        <span>
          {lastResult.cost_usd == null ? shared("costUnknown") : formatCost(lastResult.cost_usd)}
        </span>
      </div>
    );
  }

  return null;
}
