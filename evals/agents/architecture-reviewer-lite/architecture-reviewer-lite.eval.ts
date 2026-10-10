import { describeAgent, runAgentCases } from "../../src/index.js";
// Deliberately reuses the strict variant's cases — same fixtures, same practices, same
// thresholds. Only the injected agent artifact differs (fewer skills, cheaper model — see
// .claude/agents/architecture-reviewer-lite.md). That is what makes this pair a controlled A/B
// rather than two unrelated evals: pnpm eval:repeat both with labels, then pnpm eval:delta them
// to see exactly which practice moved and by how much.
import { cases } from "../architecture-reviewer/architecture-reviewer.cases.js";

describeAgent("architecture-reviewer-lite", () => runAgentCases("architecture-reviewer-lite", cases));
