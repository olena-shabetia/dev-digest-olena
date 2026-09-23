import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const SKILLS: Skill[] = [
  {
    id: "sk-uncovered",
    name: "Uncovered branches",
    description: "Flag branches with no test",
    type: "rubric",
    source: "manual",
    body: "…",
    enabled: true,
    version: 1,
  },
  {
    id: "sk-mock-overuse",
    name: "Mock overuse",
    description: "Tests asserting on mocks, not behavior",
    type: "convention",
    source: "manual",
    body: "…",
    enabled: true,
    version: 1,
  },
];

const LINKS: AgentSkillLink[] = [{ agent_id: "ag1", skill_id: "sk-mock-overuse", order: 0 }];

const setSkillsMutate = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false }),
}));

vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkillLinks: () => ({ data: LINKS, isLoading: false }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Test Quality Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ agents: messages }}>{ui}</NextIntlClientProvider>);
}

describe("SkillsTab", () => {
  it("shows the linked-skill count and lists linked skills first", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();
    expect(screen.getByText("Uncovered branches")).toBeInTheDocument();
    expect(screen.getByText("Mock overuse")).toBeInTheDocument();
  });

  it("filters the list by name", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const input = screen.getByPlaceholderText("Filter skills…");
    fireEvent.change(input, { target: { value: "uncovered" } });
    expect(screen.getByText("Uncovered branches")).toBeInTheDocument();
    expect(screen.queryByText("Mock overuse")).not.toBeInTheDocument();
  });

  it("attaching a skill calls the set-skills mutation with the full ordered id set", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const checkboxes = screen.getAllByRole("checkbox");
    // Second row is the unlinked "Uncovered branches" skill (linked rows sort first).
    fireEvent.click(checkboxes[1]!);
    expect(setSkillsMutate).toHaveBeenCalledWith(
      ["sk-mock-overuse", "sk-uncovered"],
      expect.anything(),
    );
  });
});
