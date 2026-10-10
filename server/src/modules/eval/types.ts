import { z } from 'zod';
import {
  EvalCasePrMeta,
  EvalExpectation,
  EvalRunCaseRef,
  EvalSetRunCaseResult,
  EvalSkillSnapshot,
  type EvalSetRunStatus,
} from '@devdigest/shared';

export interface StoredEvalCase {
  id: string;
  workspaceId: string;
  agentId: string;
  sourceFindingId: string | null;
  name: string;
  inputDiff: string;
  pr: EvalCasePrMeta;
  expectation: EvalExpectation;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredEvalSetRun {
  id: string;
  workspaceId: string;
  agentId: string;
  status: EvalSetRunStatus;
  error: string | null;
  agentVersion: number;
  provider: string;
  model: string;
  strategy: string;
  systemPrompt: string;
  skills: EvalSkillSnapshot[];
  cases: EvalRunCaseRef[];
  results: EvalSetRunCaseResult[];
  casesTotal: number;
  casesDone: number;
  casesPassed: number | null;
  casesErrored: number | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export const StoredExpectedOutput = z.array(EvalExpectation).length(1); // eval_cases.expected_output
export const StoredPrMeta = EvalCasePrMeta; // eval_cases.input_meta
export const StoredSkills = z.array(EvalSkillSnapshot);
export const StoredCaseRefs = z.array(EvalRunCaseRef);
export const StoredResults = z.array(EvalSetRunCaseResult);
