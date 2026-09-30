import type { SpecFile } from "@/lib/types";

/** Case-insensitive path-contains filter. Empty query matches everything. */
export function filterDocs(docs: SpecFile[], q: string): SpecFile[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return docs;
  return docs.filter((d) => d.path.toLowerCase().includes(needle));
}

/** Toggles `path` in the ordered attachment set — appended at the end when
 *  attaching, removed in place when detaching. */
export function toggleAttached(attached: string[], path: string): string[] {
  return attached.includes(path) ? attached.filter((p) => p !== path) : [...attached, path];
}

/** Moves the item at `from` to `to`, preserving the rest of the order. Out-of-
 *  range indices are a no-op (returns the input array unchanged). */
export function moveAttached(attached: string[], from: number, to: number): string[] {
  if (from < 0 || from >= attached.length || to < 0 || to >= attached.length || from === to) {
    return attached;
  }
  const next = [...attached];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Sums each attached doc's server-computed `tokens` estimate (the docs
 *  passed in are whatever set the caller wants totalled — typically the
 *  currently visible/filtered rows). Docs without a `tokens` value (should
 *  not happen for a listing response) contribute 0. */
export function attachedTokenTotal(docs: SpecFile[], attached: string[]): number {
  const attachedSet = new Set(attached);
  return docs.reduce((sum, d) => (attachedSet.has(d.path) ? sum + (d.tokens ?? 0) : sum), 0);
}

/** Splits a repo-relative doc path into its directory and file name, for
 *  two-line row rendering. A path with no `/` has an empty dir. */
export function splitPath(path: string): { dir: string; name: string } {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? { dir: "", name: path } : { dir: path.slice(0, idx), name: path.slice(idx + 1) };
}
