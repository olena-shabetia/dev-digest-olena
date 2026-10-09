/* EvalCaseModal — loads the draft (finding) or the stored case, handles the
   loading and refusal states, then hands a normalised source to CaseEditor. */
"use client";

import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { EvalCaseDetail, EvalCaseDraftResponse } from "@devdigest/shared";
import { useEvalCase, useEvalDraft } from "@/lib/hooks/eval";
import { CaseEditor, type EditorSource } from "./CaseEditor";
import { errorMessage, refusalKey } from "./helpers";
import { s } from "./styles";

export type ModalTarget = { mode: "finding" | "case"; id: string };

function fromCase(c: EvalCaseDetail, alreadyInSet: boolean): EditorSource {
  return {
    findingId: null,
    caseId: c.id,
    agentName: c.agent_name,
    name: c.name,
    diff: c.input_diff,
    pr: c.pr,
    expectation: c.expectation,
    needsRelocation: false,
    lastResult: c.last_result,
    alreadyInSet,
  };
}

function fromDraft(r: EvalCaseDraftResponse): EditorSource {
  if (r.kind === "existing") return fromCase(r.case, true);
  const d = r.draft;
  return {
    findingId: d.finding_id,
    caseId: null,
    agentName: d.agent_name,
    name: d.name,
    diff: d.input_diff,
    pr: d.pr,
    expectation: d.expectation,
    needsRelocation: d.needs_relocation,
    lastResult: null,
    alreadyInSet: false,
  };
}

export function EvalCaseModal({ target, onClose }: { target: ModalTarget; onClose: () => void }) {
  const t = useTranslations("evalCase");
  const ce = useTranslations("eval.caseEditor");
  const common = useTranslations("common");

  const draft = useEvalDraft(target.mode === "finding" ? target.id : null);
  const stored = useEvalCase(target.mode === "case" ? target.id : null);
  const query = target.mode === "finding" ? draft : stored;

  if (query.isError) {
    const key = refusalKey(query.error);
    return (
      <Modal
        width={520}
        title={ce("newCase")}
        onClose={onClose}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button kind="secondary" onClick={onClose}>
              {common("actions.close")}
            </Button>
          </div>
        }
      >
        <div role="alert" style={s.centered}>
          {key === "generic"
            ? t("refusal.generic", { message: errorMessage(query.error) })
            : t(`refusal.${key}`)}
        </div>
      </Modal>
    );
  }

  const source =
    target.mode === "finding"
      ? draft.data
        ? fromDraft(draft.data)
        : null
      : stored.data
        ? fromCase(stored.data, false)
        : null;

  if (!source) {
    return (
      <Modal
        width={520}
        title={ce("newCase")}
        onClose={onClose}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Button kind="ghost" onClick={onClose}>
              {common("actions.cancel")}
            </Button>
            <Button kind="secondary" disabled>
              {ce("runCase")}
            </Button>
            <Button kind="primary" disabled>
              {ce("save")}
            </Button>
          </div>
        }
      >
        <div role="status" style={s.centered}>
          {t("loading")}
        </div>
      </Modal>
    );
  }

  return <CaseEditor source={source} onClose={onClose} />;
}
