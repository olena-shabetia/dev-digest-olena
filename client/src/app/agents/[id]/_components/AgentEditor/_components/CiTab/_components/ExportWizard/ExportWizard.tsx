/* ExportWizard — Target → Preview → Configure → Install (L07 crit. 6–16).
   The server is the validator: every Continue re-runs POST …/ci/preview with
   the current workflow text and only advances when `errors` is empty. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ExportWizardSteps, Modal } from "@devdigest/ui";
import type { Agent, CiPostAs, CiPreview, CiTrigger } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCiExport, useCiPreview } from "@/lib/hooks/ci";
import { TargetStep } from "./_components/TargetStep";
import { PreviewStep } from "./_components/PreviewStep";
import { ConfigureStep } from "./_components/ConfigureStep";
import { InstallStep } from "./_components/InstallStep";
import { base64ToBytes, downloadBytes } from "./helpers";
import {
  DEFAULT_TRIGGERS,
  STEP_CONFIGURE,
  STEP_INSTALL,
  STEP_KEYS,
  STEP_PREVIEW,
  TRIGGER_VALUES,
  type InstallAction,
} from "./constants";
import { s } from "./styles";

export function ExportWizard({ agent, repo, onClose }: { agent: Agent; repo: string; onClose: () => void }) {
  const t = useTranslations("ci.exportWizard");
  const [step, setStep] = React.useState(0);
  const [triggers, setTriggers] = React.useState<CiTrigger[]>([...DEFAULT_TRIGGERS]);
  const [postAs, setPostAs] = React.useState<CiPostAs>("github_review");
  const [action, setAction] = React.useState<InstallAction>("open_pr");
  const [workflow, setWorkflow] = React.useState<string | undefined>(undefined);
  /** Workflow text the last preview response validated. */
  const [checked, setChecked] = React.useState<string | undefined>(undefined);
  const previewMut = useCiPreview();
  const exportMut = useCiExport();
  const preview = previewMut.data ?? null;
  const errors = preview?.errors ?? [];
  const pending = previewMut.isPending || exportMut.isPending;
  const done = exportMut.isSuccess;

  const input = (extra: { action?: InstallAction } = {}) => ({
    repo,
    triggers,
    post_as: postAs,
    ...extra,
    ...(workflow !== undefined ? { workflow } : {}),
  });

  const runPreview = async (): Promise<CiPreview | null> => {
    try {
      const res = await previewMut.mutateAsync({ agentId: agent.id, input: input() });
      const text = res.files.find((f) => f.editable)?.contents;
      if (text != null) {
        setWorkflow(text);
        setChecked(text);
      }
      return res;
    } catch {
      return null; // surfaced via previewMut.error below
    }
  };

  const install = () =>
    exportMut.mutate(
      { agentId: agent.id, input: input({ action }) },
      {
        onSuccess: (res) => {
          if (res.action === "files") downloadBytes(res.filename, base64ToBytes(res.zip_base64));
        },
      },
    );

  const next = async () => {
    if (step === STEP_INSTALL) return install();
    const res = await runPreview();
    if (!res) return;
    if (step === 0 || res.errors.length === 0) setStep(step + 1);
  };

  const toggleTrigger = (tr: CiTrigger) =>
    setTriggers((cur) =>
      TRIGGER_VALUES.filter((v) => (v === tr ? !cur.includes(v) : cur.includes(v))),
    );

  const stuckOnErrors = errors.length > 0 && workflow === checked;
  const continueDisabled =
    pending ||
    (step === STEP_PREVIEW && stuckOnErrors) ||
    (step === STEP_CONFIGURE && triggers.length === 0) ||
    (step === STEP_INSTALL && (!preview || errors.length > 0 || !!preview.conflict_agent_name));
  const errorOf = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : String(e));

  const footer = (
    <div style={s.footer}>
      {done ? (
        <>
          <span style={s.spacer} />
          <Button kind="primary" onClick={onClose}>
            {t("close")}
          </Button>
        </>
      ) : (
        <>
          <Button kind="secondary" disabled={step === 0 || pending} onClick={() => setStep(step - 1)}>
            {t("back")}
          </Button>
          <span style={s.spacer} />
          <Button kind="primary" disabled={continueDisabled} loading={pending} onClick={next}>
            {step === STEP_INSTALL ? (exportMut.isPending ? t("installing") : t("install")) : t("continue")}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <Modal
      width={760}
      title={t("title")}
      subtitle={t("subtitle", { agentName: agent.name })}
      onClose={onClose}
      footer={footer}
    >
      <div style={s.stepper}>
        <ExportWizardSteps step={step} labels={STEP_KEYS.map((k) => t(`steps.${k}`))} />
      </div>
      <div style={s.body}>
        {step > 0 && step < STEP_INSTALL && errors.length > 0 && (
          <div role="alert" style={s.errorBox}>
            <strong>{t("previewErrorsTitle")}</strong>
            {errors.map((e) => (
              <div key={`${e.path}:${e.message}`}>{t("fileError", { path: e.path, message: e.message })}</div>
            ))}
          </div>
        )}
        {previewMut.error && (
          <div role="alert" style={s.errorBox}>
            {errorOf(previewMut.error)}
          </div>
        )}
        {step === 0 && <TargetStep repo={repo} />}
        {step === STEP_PREVIEW && (
          <PreviewStep
            files={preview?.files ?? null}
            loading={previewMut.isPending}
            workflow={workflow ?? ""}
            onWorkflowChange={setWorkflow}
          />
        )}
        {step === STEP_CONFIGURE && (
          <ConfigureStep triggers={triggers} onToggleTrigger={toggleTrigger} postAs={postAs} onPostAs={setPostAs} />
        )}
        {step === STEP_INSTALL && (
          <InstallStep
            repo={repo}
            fileCount={preview?.files.length ?? 0}
            conflictAgentName={preview?.conflict_agent_name ?? null}
            action={action}
            onAction={setAction}
            result={exportMut.data}
            errorMessage={exportMut.error ? errorOf(exportMut.error) : null}
          />
        )}
      </div>
    </Modal>
  );
}
