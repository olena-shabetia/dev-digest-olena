import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting.
 *
 * Budget: 7 Claude sessions total.
 *   - 1 × dispatch                                        = 1
 *   - 1 × contrast (treatment + control)                  = 2
 *   - 2 × trace     → 1 session each                      = 2
 *   - 1 × activation pair (positive + near-miss negative) = 2
 *
 * Every expectation is checked against the trace the runner recorded (actual tool_use blocks and
 * Read paths), never against the model's prose.
 */
export const cases: WorkflowCase[] = [
  // --- dispatch (1 session): an architecture-review task must actually launch the subagent -----
  {
    kind: "dispatch",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    name: "architecture-review task dispatches the architecture-reviewer subagent",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). ОБОВʼЯЗКОВО запусти сабагента architecture-reviewer, щоб він оцінив мій план на " +
      "відповідність onion-шарам — не рецензуй сам.",
    expectSubagent: "architecture-reviewer",
    maxTurns: 6,
  },

  // --- contrast (2 sessions): CLAUDE.md "Read When" routing, treatment vs. control --------------
  {
    kind: "contrast",
    // Treatment runs in the repo, where CLAUDE.md routes "working inside one package" to
    // server/AGENTS.md. Control runs in an empty tmpdir with no project config, so it has no way
    // to know that file exists. The prompt deliberately does not name the file.
    name: "CLAUDE.md routes a server/ API-route task to server/AGENTS.md",
    // Observed on Gemini (PR #11): the model sometimes answers in prose — "I will read X" — and
    // stops without an actual tool_use block, which ends the session at 1 turn with 0 tool calls
    // (the SDK has nothing to continue on). Making the read an explicit first STEP, not a
    // consequence of "before writing code", measurably reduces that: don't give the model room to
    // treat narrating the plan as having completed the instruction.
    prompt:
      "Я додаю новий HTTP-маршрут у server/. Твій перший крок, перш ніж будь-що інше: відкрий і " +
      "прочитай інструментом Read той файл документації з настанов цього репо (CLAUDE.md), який " +
      "описує, що треба прочитати для роботи в цьому пакеті. Не описуй план — виконай цю дію зараз.",
    expectFileRead: "server/AGENTS.md",
    maxTurns: 6,
  },

  // --- trace (1 session): CLAUDE.md "Read When" routing for reviewer prompts -------------------
  {
    kind: "trace",
    // Tests the CLAUDE.md "Editing reviewer system prompts" row, so the prompt must push toward
    // CONSULTING the docs, not exploring source. One anchor doc keeps this a deterministic check.
    name: "reviewer-prompt task follows CLAUDE.md routing to docs/agent-prompts",
    prompt:
      "Я збираюся змінити системний промпт одного з ревʼюерів. Перш ніж торкатися коду — звірся з " +
      "настановами цього репо (CLAUDE.md) щодо того, яку документацію треба прочитати для цього, і " +
      "прочитай саме ці документи.",
    expectFilesRead: ["docs/agent-prompts/README.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): CLAUDE.md "A symptom feels familiar" routing -> INSIGHTS.md -----------
  {
    kind: "trace",
    name: "CLAUDE.md routes a known-symptom lookup to INSIGHTS.md",
    prompt:
      "У reviewer-core я стикнувся з несподіваною поведінкою — щось працює не так, як я очікував. " +
      "За настановами цього репо, де це вже могло бути задокументовано? Прочитай той файл.",
    expectFilesRead: ["reviewer-core/INSIGHTS.md"],
    maxTurns: 5,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — a simple question must NOT activate engineering-insights",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },
];
