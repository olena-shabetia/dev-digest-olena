import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import type { SpecFile, ProjectContextListing, ContextAttachmentList } from "@/lib/types";
import contextTabsMessages from "../../../../../messages/en/contextTabs.json";
import projectDocsMessages from "../../../../../messages/en/projectDocs.json";
import { ToastProvider } from "@/lib/toast";

const useActiveRepo = vi.fn();
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => useActiveRepo(),
}));

const useProjectDocs = vi.fn();
const useSkillContextDocs = vi.fn();
const useSetSkillContextDocs = vi.fn();
vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocs: (...args: unknown[]) => useProjectDocs(...args),
  useSkillContextDocs: (...args: unknown[]) => useSkillContextDocs(...args),
  useSetSkillContextDocs: (...args: unknown[]) => useSetSkillContextDocs(...args),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  useActiveRepo.mockReset();
  useProjectDocs.mockReset();
  useSkillContextDocs.mockReset();
  useSetSkillContextDocs.mockReset();
});

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

const DOCS: SpecFile[] = [
  { path: "specs/a.md", type: "specs", tokens: 10, truncated: false, used_by_agents: 0 },
  { path: "docs/b.md", type: "docs", tokens: 5, truncated: false, used_by_agents: 0 },
];
const LISTING: ProjectContextListing = { status: "ok", roots: ["**/{specs,docs,insights}/**/*.md"], docs: DOCS };

function renderTab() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ contextTabs: contextTabsMessages, projectDocs: projectDocsMessages }}
    >
      <ToastProvider>
        <ContextTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("skill-editor ContextTab", () => {
  it("renders the Serializes-as list in attached order", () => {
    useActiveRepo.mockReturnValue({ repoId: "repo-1", setRepoId: vi.fn(), repos: [], activeRepo: null, reposLoaded: true });
    useProjectDocs.mockReturnValue({ data: LISTING, isLoading: false, isError: false, refetch: vi.fn() });
    const linked: ContextAttachmentList = { repo_id: "repo-1", paths: ["docs/b.md", "specs/a.md"] };
    useSkillContextDocs.mockReturnValue({ data: linked, isLoading: false, isError: false });
    useSetSkillContextDocs.mockReturnValue({ mutate: vi.fn(), isPending: false });

    const { container } = renderTab();

    const pre = container.querySelector("pre");
    expect(pre?.textContent).toBe("## Project context\n- docs/b.md\n- specs/a.md");
  });

  it("shows no Serializes-as block when nothing is attached", () => {
    useActiveRepo.mockReturnValue({ repoId: "repo-1", setRepoId: vi.fn(), repos: [], activeRepo: null, reposLoaded: true });
    useProjectDocs.mockReturnValue({ data: LISTING, isLoading: false, isError: false, refetch: vi.fn() });
    const linked: ContextAttachmentList = { repo_id: "repo-1", paths: [] };
    useSkillContextDocs.mockReturnValue({ data: linked, isLoading: false, isError: false });
    useSetSkillContextDocs.mockReturnValue({ mutate: vi.fn(), isPending: false });

    const { container } = renderTab();

    expect(container.querySelector("pre")).toBeNull();
  });
});
