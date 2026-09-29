import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SpecFile, ProjectContextListing } from "@/lib/types";
import messages from "../../../messages/en/projectDocs.json";

const useProjectDocs = vi.fn();

vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocs: (...args: unknown[]) => useProjectDocs(...args),
}));

import { ProjectDocPicker } from "./ProjectDocPicker";

afterEach(() => {
  cleanup();
  useProjectDocs.mockReset();
});

const DOCS: SpecFile[] = [
  { path: "specs/L05-project-context.md", type: "specs", tokens: 40, truncated: false, used_by_agents: 1 },
  { path: "docs/README.md", type: "docs", tokens: 12, truncated: false, used_by_agents: 0 },
];

const LISTING: ProjectContextListing = { status: "ok", roots: ["**/{specs,docs,insights}/**/*.md"], docs: DOCS };

function renderPicker(props: Partial<React.ComponentProps<typeof ProjectDocPicker>> = {}) {
  const onChange = vi.fn();
  const onPreview = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ projectDocs: messages }}>
      <ProjectDocPicker
        repoId="repo-1"
        attached={[]}
        onChange={onChange}
        header={<h2>Attach docs</h2>}
        onPreview={onPreview}
        contextPageHref="/repos/repo-1/context"
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onChange, onPreview };
}

describe("ProjectDocPicker", () => {
  it("renders the doc list, toggles attachment, and filters by path", () => {
    useProjectDocs.mockReturnValue({ data: LISTING, isLoading: false, isError: false, refetch: vi.fn() });
    const { onChange } = renderPicker();

    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("L05-project-context.md")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /attach specs\/l05-project-context\.md/i }));
    expect(onChange).toHaveBeenCalledWith(["specs/L05-project-context.md"]);

    fireEvent.change(screen.getByPlaceholderText("Filter by path…"), { target: { value: "README" } });
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.queryByText("L05-project-context.md")).not.toBeInTheDocument();
  });

  it("shows a no-matches message when the filter matches nothing", () => {
    useProjectDocs.mockReturnValue({ data: LISTING, isLoading: false, isError: false, refetch: vi.fn() });
    renderPicker();

    fireEvent.change(screen.getByPlaceholderText("Filter by path…"), {
      target: { value: "nope-does-not-exist" },
    });
    expect(screen.getByText('No documents match "nope-does-not-exist".')).toBeInTheDocument();
  });

  it("shows the select-repo prompt with no controls when repoId is null", () => {
    useProjectDocs.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
    renderPicker({ repoId: null });

    expect(screen.getByText("Select a repository to see its documents.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows an error state with retry on load failure", () => {
    const refetch = vi.fn();
    useProjectDocs.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderPicker();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });
});
