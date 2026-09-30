import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SpecFile } from "@/lib/types";
import messages from "../../../messages/en/projectDocs.json";

const useProjectDoc = vi.fn();

vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDoc: (...args: unknown[]) => useProjectDoc(...args),
}));

import { ProjectDocPreview } from "./ProjectDocPreview";

afterEach(() => {
  cleanup();
  useProjectDoc.mockReset();
});

function renderPreview(props: Partial<React.ComponentProps<typeof ProjectDocPreview>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ projectDocs: messages }}>
      <ProjectDocPreview repoId="repo-1" path="specs/L05-project-context.md" {...props} />
    </NextIntlClientProvider>,
  );
}

const DOC: SpecFile = {
  path: "specs/L05-project-context.md",
  content: "# Project Context\n\nSome body text.",
  type: "specs",
  tokens: 40,
  truncated: false,
  used_by_agents: 0,
};

describe("ProjectDocPreview", () => {
  it("loads and shows the path, usage count, and markdown body", () => {
    useProjectDoc.mockReturnValue({ data: DOC, isLoading: false, isError: false, refetch: vi.fn() });
    renderPreview();

    expect(screen.getByText("specs/L05-project-context.md")).toBeInTheDocument();
    expect(screen.getByText("Used by 0 agents")).toBeInTheDocument();
    expect(screen.getByText("Project Context")).toBeInTheDocument();
  });

  it("shows an error state with retry and no partial content on load failure", () => {
    const refetch = vi.fn();
    useProjectDoc.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderPreview();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("specs/L05-project-context.md")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders an attach toggle and calls onToggle when clicked", () => {
    useProjectDoc.mockReturnValue({ data: DOC, isLoading: false, isError: false, refetch: vi.fn() });
    const onToggle = vi.fn();
    renderPreview({ attachToggle: { attached: false, onToggle } });

    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    expect(onToggle).toHaveBeenCalled();
  });

  it("shows loading skeletons before data arrives", () => {
    useProjectDoc.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    renderPreview();

    expect(screen.queryByText("specs/L05-project-context.md")).not.toBeInTheDocument();
  });
});
