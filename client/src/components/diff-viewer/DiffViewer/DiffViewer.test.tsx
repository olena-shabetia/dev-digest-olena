import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import shellMessages from "../../../../messages/en/shell.json";
import prReviewMessages from "../../../../messages/en/prReview.json";
import { DiffViewer, type DiffFindingsApi, type DiffCommentApi } from "..";
import type { DiffGroupView } from "../groups";

afterEach(cleanup);

function renderWithMessages(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ shell: shellMessages, prReview: prReviewMessages }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

const FILE_WITH_FINDING: PrFile = {
  path: "src/core.ts",
  additions: 2,
  deletions: 0,
  patch: "@@ -1,2 +1,3 @@\n ctx line\n+added line one\n+added line two",
};

const FILE_WITHOUT_FINDING: PrFile = {
  path: "src/other.ts",
  additions: 1,
  deletions: 0,
  patch: "@@ -1,1 +1,2 @@\n ctx line\n+added line",
};

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "bug",
  title: "Off-by-one in loop bound",
  file: "src/core.ts",
  start_line: 2,
  end_line: 2,
  rationale: "This loop iterates one time too many.",
  suggestion: null,
  confidence: 0.9,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

// A second finding on the SAME file as FINDING — so "1 file with findings"
// (the group/file dot) and "2 findings total" are distinguishable in the test.
const SECOND_FINDING: FindingRecord = {
  ...FINDING,
  id: "f2",
  severity: "WARNING",
  title: "Missing null check",
  rationale: "user could be undefined here if the lookup fails.",
  start_line: 1,
};

function makeGroups(): DiffGroupView[] {
  return [
    {
      role: "core",
      label: "Core",
      description: "The substance of the change — review closely",
      files: [FILE_WITH_FINDING, FILE_WITHOUT_FINDING],
      filesWithFindings: 1,
      filesWithFindingsLabel: "1 files with findings",
      filesCountLabel: "2 files",
      defaultCollapsed: false,
    },
  ];
}

function makeFindingsApi(): DiffFindingsApi {
  return {
    byPath: new Map([["src/core.ts", [FINDING, SECOND_FINDING]]]),
    lineLabels: { CRITICAL: "blocker", WARNING: "warning", SUGGESTION: "suggestion" },
    fileFindingsLabel: (count) => `${count} findings`,
    outsidePatchLabel: (count) => `${count} finding(s) outside this diff`,
    showFindings: true,
    repoFullName: "acme/widgets",
    headSha: "abc123",
    pendingFindingId: null,
    onAction: () => {},
  };
}

function makeCommenting(): DiffCommentApi {
  return {
    comments: [
      {
        id: 1,
        path: "src/core.ts",
        line: 1,
        original_line: 1,
        side: "RIGHT",
        body: "A GitHub reviewer comment — a different concept from a finding.",
        user: "reviewer1",
        created_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/acme/widgets/pull/1#discussion_r1",
        in_reply_to_id: null,
        is_outdated: false,
      },
    ],
    canComment: false,
    showComments: true,
    posting: false,
    onSubmit: async () => {
      throw new Error("not used in this test");
    },
  };
}

describe("DiffViewer — grouped rendering with inline findings", () => {
  it("shows a findings dot only on the file that has one — counting FILES, not total findings — distinct from the comment-count icon, and renders both finding cards", () => {
    renderWithMessages(
      <DiffViewer
        files={[]}
        groups={makeGroups()}
        findings={makeFindingsApi()}
        commenting={makeCommenting()}
      />,
    );

    // Group header shows "1 file with findings" even though 2 findings exist
    // on that one file — the dot counts files, not findings (plan §3, D-item).
    const groupDot = screen.getByTestId("group-findings-dot");
    expect(groupDot).toHaveTextContent("●1");

    // The file with findings shows its own dot (count = 2, its own findings);
    // the other file shows none.
    const fileDots = screen.getAllByTestId("file-findings-dot");
    expect(fileDots).toHaveLength(1);
    expect(fileDots[0]).toHaveTextContent("2");

    // The GitHub comment-count icon is a separate element from the findings
    // dot — both render on the same file card without merging into one.
    const commentIcon = document.querySelector(".lucide-message-square");
    expect(commentIcon?.parentElement).toHaveTextContent("1");

    // Both finding cards render (start_line 1 and 2 — one line apart, so
    // FINDING_CLUSTER_MAX_GAP clusters them under the same anchor; see the
    // dedicated clustering test below for that behaviour itself).
    expect(screen.getByText("Off-by-one in loop bound")).toBeInTheDocument();
    expect(screen.getByText(/This loop iterates one time too many/)).toBeInTheDocument();
    expect(screen.getByText("Missing null check")).toBeInTheDocument();
  });

  it("clusters findings a couple of lines apart under one anchor — independent agents flagging the same defect routinely disagree on its exact start_line", () => {
    // Same underlying issue, reported by three different agents at lines
    // 5/6/7 of the SAME file (mirrors the real ReDoS-in-matchesTitleQuery
    // report: three agents, three adjacent lines, one defect).
    const THREE_LINE_FILE: PrFile = {
      path: "src/query.ts",
      additions: 4,
      deletions: 0,
      patch: "@@ -1,1 +1,5 @@\n ctx line\n+line four\n+line five\n+line six\n+line seven",
    };
    const clusterFinding = (id: string, title: string, line: number): FindingRecord => ({
      ...FINDING,
      id,
      title,
      file: "src/query.ts",
      start_line: line,
    });
    const groups: DiffGroupView[] = [
      {
        role: "core",
        label: "Core",
        description: "The substance of the change — review closely",
        files: [THREE_LINE_FILE],
        filesWithFindings: 1,
        filesWithFindingsLabel: "1 files with findings",
        filesCountLabel: "1 files",
        defaultCollapsed: false,
      },
    ];
    const findingsApi: DiffFindingsApi = {
      ...makeFindingsApi(),
      byPath: new Map([
        [
          "src/query.ts",
          [
            clusterFinding("c1", "ReDoS via unescaped regex (agent A)", 5),
            clusterFinding("c2", "ReDoS in matchesTitleQuery (agent B)", 6),
            clusterFinding("c3", "Regex injection in query param (agent C)", 7),
          ],
        ],
      ]),
    };

    renderWithMessages(
      <DiffViewer files={[]} groups={groups} findings={findingsApi} commenting={makeCommenting()} />,
    );

    // All three still render...
    expect(screen.getByText("ReDoS via unescaped regex (agent A)")).toBeInTheDocument();
    expect(screen.getByText("ReDoS in matchesTitleQuery (agent B)")).toBeInTheDocument();
    expect(screen.getByText("Regex injection in query param (agent C)")).toBeInTheDocument();
    // ...but anchored under the SAME code line (one CodeLine row wraps all
    // three cards), not scattered across lines 5/6/7 as three separate rows.
    const anchors = document.querySelectorAll("[data-finding-id]");
    expect(anchors).toHaveLength(3);
    // Each card sits in its own `cs.thread` div; the row that HOSTS them
    // (the card's grandparent) must be the same element for all three.
    const rows = new Set(Array.from(anchors).map((el) => el.parentElement?.parentElement));
    expect(rows.size).toBe(1);
  });

  it("falls back to the flat file list, byte-identical, when groups is omitted", () => {
    renderWithMessages(<DiffViewer files={[FILE_WITH_FINDING]} />);

    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
    // No grouping UI, and no finding card (findings prop unused in flat mode).
    expect(screen.queryByTestId("group-findings-dot")).not.toBeInTheDocument();
    expect(screen.queryByText("Off-by-one in loop bound")).not.toBeInTheDocument();
  });
});
