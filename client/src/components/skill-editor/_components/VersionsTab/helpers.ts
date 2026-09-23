import { diffLines } from "diff";

/** Line-level diff between two version bodies, `diff`'s `diffLines` — added/
 *  removed line groups, in order. Plain data in, plain data out; the
 *  component decides how to render each part. */
export function computeLineDiff(a: string, b: string) {
  return diffLines(a, b);
}

/** Format an ISO timestamp for the versions list — locale date + time,
 *  no external date lib. */
export function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
