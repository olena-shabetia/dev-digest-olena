import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../messages/en/skills.json";
import shellMessages from "../../../messages/en/shell.json";
import { ToastProvider } from "@/lib/toast";

// Mock the data hooks so the editor renders without a network/query client,
// same pattern as AgentEditor.test.tsx.
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillStats: () => ({ data: { skill_id: "sk1", agents_using: [] }, isLoading: false, isError: false }),
  useSkillVersions: () => ({ data: [], isLoading: false, isError: false }),
}));

// The Context tab (L05) pulls its own repo/doc hooks — mock them so the
// default (Config) render stays a pure smoke test.
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: null, setRepoId: vi.fn(), repos: [], activeRepo: null, reposLoaded: true }),
}));
vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocs: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkillContextDocs: () => ({ data: undefined, isLoading: false, isError: false }),
  useSetSkillContextDocs: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillEditor } from "./SkillEditor";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "Uncovered branches",
  description: "Flag tests that assert only the happy path.",
  type: "rubric",
  source: "manual",
  body: "# Rule\nCheck branch coverage.",
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, shell: shellMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillEditor (smoke)", () => {
  it("renders the header and Config tab fields by default", () => {
    renderWithIntl(<SkillEditor skill={SKILL} />);
    expect(screen.getByText("Uncovered branches")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("renders all 5 tabs", () => {
    renderWithIntl(<SkillEditor skill={SKILL} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Context")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.queryByText("Evals")).not.toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("Versions")).toBeInTheDocument();
  });
});
