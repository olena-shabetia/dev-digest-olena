import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextListing, SpecFile } from "@/lib/types";
import contextMessages from "../../../../../../../messages/en/context.json";
import projectDocsMessages from "../../../../../../../messages/en/projectDocs.json";

const useProjectDocs = vi.fn();
const useProjectDoc = vi.fn();
const useRepoNotFound = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1" }),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo-1", full_name: "acme/widgets" } }),
  useRepoNotFound: (...args: unknown[]) => useRepoNotFound(...args),
}));

vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocs: (...args: unknown[]) => useProjectDocs(...args),
  useProjectDoc: (...args: unknown[]) => useProjectDoc(...args),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ProjectContextView } from "./ProjectContextView";

afterEach(() => {
  cleanup();
  useProjectDocs.mockReset();
  useProjectDoc.mockReset();
  useRepoNotFound.mockReset();
});

const DOCS: SpecFile[] = [
  { path: "specs/L05-project-context.md", type: "specs", tokens: 40, truncated: false, used_by_agents: 1 },
  { path: "docs/README.md", type: "docs", tokens: 12, truncated: false, used_by_agents: 0 },
];

const LISTING: ProjectContextListing = { status: "ok", roots: ["**/{specs,docs,insights}/**/*.md"], docs: DOCS };

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages, projectDocs: projectDocsMessages }}>
      <ProjectContextView />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextView", () => {
  it("auto-selects the first doc, then switches preview on click", () => {
    useRepoNotFound.mockReturnValue(false);
    useProjectDocs.mockReturnValue({ data: LISTING, isLoading: false, isError: false, error: null, refetch: vi.fn() });
    useProjectDoc.mockReturnValue({
      data: { ...DOCS[0], content: "# Hello" },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderView();

    // The first doc is auto-selected — no "select a document" placeholder,
    // and its preview is fetched without a click.
    expect(screen.getByText("docs/README.md")).toBeInTheDocument();
    expect(screen.queryByText("Select a document from the list to preview it.")).not.toBeInTheDocument();
    expect(useProjectDoc).toHaveBeenCalledWith("repo-1", "specs/L05-project-context.md");
    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("docs/README.md"));

    expect(useProjectDoc).toHaveBeenCalledWith("repo-1", "docs/README.md");
  });

  it("shows an empty state naming the discovery roots with no create/upload controls", () => {
    useRepoNotFound.mockReturnValue(false);
    useProjectDocs.mockReturnValue({
      data: { status: "ok", roots: ["**/{specs,docs,insights}/**/*.md"], docs: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderView();

    expect(screen.getByText(/No markdown files found under/)).toBeInTheDocument();
    expect(screen.getByText(/Looked for markdown under:/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new file/i })).not.toBeInTheDocument();
  });

  it("shows a not_cloned message instead of a doc list", () => {
    useRepoNotFound.mockReturnValue(false);
    useProjectDocs.mockReturnValue({
      data: { status: "not_cloned", roots: ["**/{specs,docs,insights}/**/*.md"], docs: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderView();

    expect(screen.getByText(/hasn’t been cloned yet/)).toBeInTheDocument();
  });
});
