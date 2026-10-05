import { REF_MAX_CHARS } from "./constants";

/** Split a `path`, `path:n` or `path:n-m` reference into path + start line. */
export function parseRef(ref: string): { path: string; line: number | null } {
  const m = /^(.*?):(\d+)(?:-\d+)?$/.exec(ref);
  if (!m) return { path: ref, line: null };
  const line = Number(m[2]);
  return { path: m[1] ?? ref, line: line >= 1 ? line : null };
}

/** Middle-truncate long refs, keeping the file name end visible. */
export function truncateMiddle(text: string, max: number = REF_MAX_CHARS): string {
  if (text.length <= max) return text;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}
