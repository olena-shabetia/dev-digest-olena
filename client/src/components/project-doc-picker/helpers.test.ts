import { describe, it, expect } from "vitest";
import type { SpecFile } from "@/lib/types";
import { filterDocs, toggleAttached, moveAttached, attachedTokenTotal, splitPath } from "./helpers";

function doc(path: string, tokens?: number): SpecFile {
  return { path, tokens: tokens ?? null };
}

describe("filterDocs", () => {
  it("matches case-insensitively on path contains, and an empty query matches all", () => {
    const docs = [doc("specs/L05-project-context.md"), doc("docs/README.md"), doc("insights/notes.md")];
    expect(filterDocs(docs, "L05").map((d) => d.path)).toEqual(["specs/L05-project-context.md"]);
    expect(filterDocs(docs, "readme").map((d) => d.path)).toEqual(["docs/README.md"]);
    expect(filterDocs(docs, "")).toEqual(docs);
    expect(filterDocs(docs, "nope")).toEqual([]);
  });
});

describe("toggleAttached", () => {
  it("appends on attach and removes on detach", () => {
    expect(toggleAttached(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleAttached(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("moveAttached", () => {
  it("reorders in place and no-ops on out-of-range indices", () => {
    expect(moveAttached(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveAttached(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveAttached(["a", "b", "c"], -1, 1)).toEqual(["a", "b", "c"]);
    expect(moveAttached(["a", "b", "c"], 0, 5)).toEqual(["a", "b", "c"]);
  });
});

describe("attachedTokenTotal", () => {
  it("sums tokens for attached docs only, treating a missing tokens field as 0", () => {
    const docs = [doc("a.md", 10), doc("b.md", 20), doc("c.md")];
    expect(attachedTokenTotal(docs, ["a.md", "c.md"])).toBe(10);
    expect(attachedTokenTotal(docs, ["a.md", "b.md"])).toBe(30);
    expect(attachedTokenTotal(docs, [])).toBe(0);
  });
});

describe("splitPath", () => {
  it("splits into dir and name, with an empty dir for a bare filename", () => {
    expect(splitPath("specs/docs/L05.md")).toEqual({ dir: "specs/docs", name: "L05.md" });
    expect(splitPath("README.md")).toEqual({ dir: "", name: "README.md" });
  });
});
