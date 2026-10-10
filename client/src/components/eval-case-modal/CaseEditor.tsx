/* CaseEditor — the modal body for a loaded draft (new case) or existing case.
   Editable state is exactly three values: name, diff, expectation JSON text
   (file / start_line / end_line). Severity, category, title and the
   expectation type are a read-only reference line and are never sent. */
"use client";

import { useId, useReducer, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  FormField,
  Modal,
  SeverityBadge,
  Tabs,
  Textarea,
  TextInput,
  type Severity,
} from "@devdigest/ui";
import type {
  EvalCaseLastResult,
  EvalCasePrMeta,
  EvalDraftRunResult,
  EvalExpectation,
} from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCreateEvalCase, useEvalDraftRun, useUpdateEvalCase } from "@/lib/hooks/eval";
import { useToast } from "@/lib/toast";
import {
  contentChanged,
  editableReducer,
  errorMessage,
  formatLocation,
  isDirty,
  isKnownServerReason,
  isResultCurrent,
  parseLocation,
  sameLocation,
  toFieldError,
  type EditableState,
  type ServerFieldError,
  type UsedContent,
} from "./helpers";
import { ResultPanel } from "./ResultPanel";
import { s } from "./styles";
import { useDialogKeys } from "@/lib/hooks";

/** A loaded draft or case, normalised for the editor. */
export interface EditorSource {
  /** Set for a new case (from a draft); null when editing a stored case. */
  findingId: string | null;
  /** Set when editing a stored case. */
  caseId: string | null;
  agentName: string;
  name: string;
  diff: string;
  pr: EvalCasePrMeta;
  expectation: EvalExpectation;
  needsRelocation: boolean;
  lastResult: EvalCaseLastResult | null;
  alreadyInSet: boolean;
}

type PanelTab = "diff" | "prMeta";

export function CaseEditor({ source, onClose }: { source: EditorSource; onClose: () => void }) {
  const t = useTranslations("evalCase");
  const ce = useTranslations("eval.caseEditor");
  const shared = useTranslations("eval.shared");
  const common = useTranslations("common");
  const toast = useToast();

  const isNew = source.caseId === null;
  const openingLocation = {
    file: source.expectation.file,
    start_line: source.expectation.start_line,
    end_line: source.expectation.end_line,
  };

  const [opening] = useState<EditableState>(() => ({
    name: source.name,
    diff: source.diff,
    expectationText: formatLocation(openingLocation),
  }));
  const [state, dispatch] = useReducer(editableReducer, opening);
  const [tab, setTab] = useState<PanelTab>("diff");
  const [run, setRun] = useState<{ result: EvalDraftRunResult; used: UsedContent } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<ServerFieldError | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"discard" | "failing" | null>(null);

  const draftRun = useEvalDraftRun();
  const create = useCreateEvalCase();
  const update = useUpdateEvalCase();
  const saving = create.isPending || update.isPending;
  const running = draftRun.isPending;

  const hintId = useId();
  const anchor = useRef<HTMLDivElement>(null);

  const parsed = parseLocation(state.expectationText);
  const relocateBlocked =
    source.needsRelocation && parsed.ok && sameLocation(parsed.value, openingLocation);
  const valid = parsed.ok && !relocateBlocked;
  const invalidKey = !parsed.ok ? parsed.reason : relocateBlocked ? "relocate" : null;

  const nameOk = state.name.trim() !== "";
  const current = isResultCurrent(run?.used ?? null, state.diff, parsed);
  const needsRun = isNew || contentChanged(state, opening);
  const dirty = isDirty(state, opening);
  const canRun = valid && !running && !saving;
  const canSave = nameOk && valid && !running && !saving && (!needsRun || current);
  const showRunFirst = nameOk && valid && needsRun && !current;

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirm("discard");
    else onClose();
  }

  useDialogKeys(anchor, {
    active: confirm === null,
    onEscape: requestClose,
  });

  function onRun() {
    if (!parsed.ok || !valid) return;
    const used: UsedContent = { diff: state.diff, location: parsed.value };
    setFieldError(null);
    setRunError(null);
    draftRun.mutate(
      {
        ...(source.caseId ? { caseId: source.caseId } : { findingId: source.findingId ?? undefined }),
        inputDiff: used.diff,
        expectation: used.location,
      },
      {
        onSuccess: (result) => setRun({ result, used }),
        onError: (err) => {
          const fe = toFieldError(err);
          if (fe) setFieldError(fe);
          else setRunError(errorMessage(err));
        },
      },
    );
  }

  function doSave() {
    if (!parsed.ok || !valid) return;
    setConfirm(null);
    setFieldError(null);
    setSaveError(null);
    const name = state.name.trim();
    const onSuccess = () => {
      toast.success(
        t("saved", {
          name,
          type: shared(`expectation.${source.expectation.type}`),
          agent: source.agentName,
        }),
      );
      onClose();
    };
    const onError = (err: unknown) => {
      const fe = toFieldError(err);
      if (fe) {
        setFieldError(fe);
        return;
      }
      const code = (err as { code?: string }).code;
      setSaveError(
        code === "eval_expectation_type_changed" || code === "eval_case_exists"
          ? t(`saveError.${code}`)
          : t("saveError.generic", { message: errorMessage(err) }),
      );
    };
    if (source.caseId) {
      update.mutate(
        { caseId: source.caseId, name, inputDiff: state.diff, expectation: parsed.value },
        { onSuccess, onError },
      );
    } else if (source.findingId) {
      create.mutate(
        {
          findingId: source.findingId,
          name,
          inputDiff: state.diff,
          expectation: parsed.value,
          displayedType: source.expectation.type,
        },
        { onSuccess, onError },
      );
    }
  }

  function onSave() {
    if (current && run?.result.status === "failed") setConfirm("failing");
    else doSave();
  }

  const reasonText = (fe: ServerFieldError) =>
    isKnownServerReason(fe.reason) ? t(`serverReason.${fe.reason}`) : fe.message;

  return (
    <>
      <Modal
        width={1080}
        title={ce("caseTitle", { name: state.name })}
        subtitle={source.agentName}
        onClose={requestClose}
        footer={
          <div style={s.footer}>
            <div id={hintId} style={s.footerHint}>
              {saveError ? (
                <span role="alert" style={s.errorBanner}>
                  {saveError}
                </span>
              ) : showRunFirst ? (
                <>
                  {t("runFirst")} {t("spendNote")}
                </>
              ) : (
                t("spendNote")
              )}
            </div>
            <Button kind="ghost" onClick={requestClose} disabled={saving}>
              {common("actions.cancel")}
            </Button>
            <Button
              kind="secondary"
              icon="Play"
              loading={running}
              disabled={!canRun}
              onClick={onRun}
              aria-describedby={hintId}
            >
              {running ? ce("running") : ce("runCase")}
            </Button>
            <Button
              kind="primary"
              icon="Check"
              loading={saving}
              disabled={!canSave}
              onClick={onSave}
              aria-describedby={hintId}
            >
              {saving ? ce("saving") : ce("save")}
            </Button>
          </div>
        }
      >
        <div ref={anchor} style={s.body}>
          <div style={s.left}>
            {source.alreadyInSet && (
              <div role="note" style={s.notice}>
                {t("alreadyInSet")}
              </div>
            )}
            <FormField label={ce("nameLabel")} required>
              <TextInput
                value={state.name}
                onChange={(v) => dispatch({ type: "name", value: v })}
                placeholder={ce("namePlaceholder")}
                mono
                aria-required="true"
                aria-label={ce("nameLabel")}
              />
              {fieldError?.field === "name" && (
                <div role="alert" style={s.fieldError}>
                  {reasonText(fieldError)}
                </div>
              )}
            </FormField>
            <div style={s.sectionLabel}>{ce("inputLabel")}</div>
            <Tabs
              pad="0"
              value={tab}
              onChange={(k) => setTab(k as PanelTab)}
              tabs={[
                { key: "diff", label: ce("tabs.diff") },
                { key: "prMeta", label: ce("tabs.prMeta") },
              ]}
            />
            <div style={{ marginTop: 12 }}>
              {tab === "diff" ? (
                <div role="group" aria-label={t("diffAria")}>
                  <Textarea
                    mono
                    rows={14}
                    value={state.diff}
                    placeholder={ce("diffPlaceholder")}
                    onChange={(v) => dispatch({ type: "diff", value: v })}
                  />
                  {fieldError?.field === "input_diff" && (
                    <div role="alert" style={s.fieldError}>
                      {reasonText(fieldError)}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div style={s.metaLabel}>{t("prMeta.number")}</div>
                  <div style={s.metaValue}>#{source.pr.number}</div>
                  <div style={s.metaLabel}>{t("prMeta.title")}</div>
                  <div style={s.metaValue}>{source.pr.title}</div>
                  <div style={s.metaLabel}>{t("prMeta.body")}</div>
                  <div style={s.metaValue}>{source.pr.body ?? t("prMeta.noBody")}</div>
                </div>
              )}
            </div>
          </div>

          <div style={s.right}>
            <div style={s.headingRow}>
              <span style={s.heading}>{ce("expectedOutput")}</span>
              <span style={s.typeLabel}>{shared(`expectation.${source.expectation.type}`)}</span>
              <span
                aria-live="polite"
                style={{ fontSize: 12, color: valid ? "var(--ok)" : "var(--crit)" }}
              >
                {valid ? ce("validJson") : ce("invalidJson")}
              </span>
              {invalidKey && <span style={s.reasonText}>{t(`invalidReason.${invalidKey}`)}</span>}
            </div>
            <div style={s.referenceLine} aria-label={t("referenceAria")} role="group">
              <SeverityBadge severity={source.expectation.severity as Severity} compact />
              <span>{source.expectation.category}</span>
              <span>{source.expectation.title}</span>
            </div>
            <div role="group" aria-label={t("expectedAria")}>
              <Textarea
                mono
                rows={7}
                value={state.expectationText}
                onChange={(v) => dispatch({ type: "expectation", value: v })}
              />
              {fieldError?.field === "expectation" && (
                <div role="alert" style={s.fieldError}>
                  {reasonText(fieldError)}
                </div>
              )}
            </div>
            <ResultPanel
              result={run?.result ?? null}
              stale={!!run && !current}
              runError={runError}
              lastResult={source.lastResult}
              expectationType={source.expectation.type}
            />
          </div>
        </div>
      </Modal>
      {confirm === "discard" && (
        <ConfirmDialog
          danger
          title={t("discard.title")}
          body={t("discard.body")}
          confirmLabel={t("discard.confirm")}
          cancelLabel={t("discard.keep")}
          onConfirm={onClose}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "failing" && (
        <ConfirmDialog
          danger={false}
          title={t("saveFailing.title")}
          body={t("saveFailing.body")}
          confirmLabel={t("saveFailing.confirm")}
          onConfirm={doSave}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}
