/* EvalCaseModalProvider — one modal instance per page. Consumers call
   useEvalCaseModal(); it returns null outside a provider so components that
   render bare (tests, other pages) simply show no entry point. */
"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useEvalCaseIndex, type EvalCaseRef } from "@/lib/hooks/eval";
import { EvalCaseModal, type ModalTarget } from "./EvalCaseModal";

export interface EvalCaseModalApi {
  openForFinding(findingId: string): void;
  openForCase(caseId: string): void;
  /** The saved eval case made from this finding, if any (PR page only). */
  caseForFinding(findingId: string): EvalCaseRef | undefined;
}

const Ctx = createContext<EvalCaseModalApi | null>(null);

export function useEvalCaseModal(): EvalCaseModalApi | null {
  return useContext(Ctx);
}

export function EvalCaseModalProvider({
  children,
  prId,
}: {
  children: ReactNode;
  /** Set on the PR page so finding cards can show which findings already have a case. */
  prId?: string | null;
}) {
  const [target, setTarget] = useState<ModalTarget | null>(null);
  const caseIndex = useEvalCaseIndex(prId);
  const caseForFinding = useCallback((findingId: string) => caseIndex.get(findingId), [caseIndex]);
  const openForFinding = useCallback((id: string) => setTarget({ mode: "finding", id }), []);
  const openForCase = useCallback((id: string) => setTarget({ mode: "case", id }), []);
  const close = useCallback(() => setTarget(null), []);
  const api = useMemo(
    () => ({ openForFinding, openForCase, caseForFinding }),
    [openForFinding, openForCase, caseForFinding],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {target && <EvalCaseModal key={`${target.mode}:${target.id}`} target={target} onClose={close} />}
    </Ctx.Provider>
  );
}
