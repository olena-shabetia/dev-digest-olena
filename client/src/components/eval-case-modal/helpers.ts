/* Pure helpers for the eval case modal — no React, no I/O. The server owns
   every verdict (pass/fail, matched flags, hunk intersection); this only
   checks the SHAPE of the editable JSON so the badge and buttons can react. */
import { ApiError } from "@/lib/api";

export interface Location {
  file: string;
  start_line: number;
  end_line: number;
}

export type InvalidReason = "notJson" | "notObject" | "missingKeys" | "file" | "lines" | "order" | "extraKeys";

export type ParsedLocation = { ok: true; value: Location } | { ok: false; reason: InvalidReason };

export type FieldKey = "name" | "input_diff" | "expectation";

export interface EditableState {
  name: string;
  diff: string;
  expectationText: string;
}

export type EditableAction =
  | { type: "name"; value: string }
  | { type: "diff"; value: string }
  | { type: "expectation"; value: string };

export function editableReducer(state: EditableState, action: EditableAction): EditableState {
  switch (action.type) {
    case "name":
      return { ...state, name: action.value };
    case "diff":
      return { ...state, diff: action.value };
    case "expectation":
      return { ...state, expectationText: action.value };
  }
}

/** The editable JSON holds exactly the three location keys. */
export function formatLocation(loc: Location): string {
  return JSON.stringify(
    { file: loc.file, start_line: loc.start_line, end_line: loc.end_line },
    null,
    2,
  );
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}

/** Shape check only. Any key beyond the three location keys is rejected. */
export function parseLocation(text: string): ParsedLocation {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "notJson" };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "notObject" };
  }
  const o = raw as Record<string, unknown>;
  if (!("file" in o) || !("start_line" in o) || !("end_line" in o)) {
    return { ok: false, reason: "missingKeys" };
  }
  if (Object.keys(o).some((k) => k !== "file" && k !== "start_line" && k !== "end_line")) {
    return { ok: false, reason: "extraKeys" };
  }
  if (typeof o.file !== "string" || o.file.trim() === "") return { ok: false, reason: "file" };
  if (!isPositiveInt(o.start_line) || !isPositiveInt(o.end_line)) {
    return { ok: false, reason: "lines" };
  }
  if (o.start_line > o.end_line) return { ok: false, reason: "order" };
  return { ok: true, value: { file: o.file, start_line: o.start_line, end_line: o.end_line } };
}

export function sameLocation(a: Location, b: Location): boolean {
  return a.file === b.file && a.start_line === b.start_line && a.end_line === b.end_line;
}

/** Canonical comparison key: parsed location when valid, else the raw text. */
function locationKey(text: string): string {
  const p = parseLocation(text);
  return p.ok ? formatLocation(p.value) : text;
}

/** Unsaved change = name, diff or location differs from the opening snapshot.
 *  Reference info and draft-run results are deliberately not part of this. */
export function isDirty(current: EditableState, opening: EditableState): boolean {
  return (
    current.name !== opening.name ||
    current.diff !== opening.diff ||
    locationKey(current.expectationText) !== locationKey(opening.expectationText)
  );
}

/** Did the diff or the location change from the opening snapshot? */
export function contentChanged(current: EditableState, opening: EditableState): boolean {
  return (
    current.diff !== opening.diff ||
    locationKey(current.expectationText) !== locationKey(opening.expectationText)
  );
}

export interface UsedContent {
  diff: string;
  location: Location;
}

/** A draft-run result is current when the content it used equals the content now. */
export function isResultCurrent(used: UsedContent | null, diff: string, parsed: ParsedLocation): boolean {
  if (!used || !parsed.ok) return false;
  return used.diff === diff && sameLocation(used.location, parsed.value);
}

export interface ServerFieldError {
  field: FieldKey;
  reason: string | null;
  message: string;
}

export const SERVER_REASONS = [
  "empty",
  "unparseable",
  "no_hunk",
  "multiple_files",
  "file_empty",
  "file_mismatch",
  "line_not_positive_integer",
  "start_after_end",
  "outside_hunks",
] as const;

export function isKnownServerReason(r: string | null): r is (typeof SERVER_REASONS)[number] {
  return r !== null && (SERVER_REASONS as readonly string[]).includes(r);
}

/** `eval_invalid_*` errors name their field in `details.field`. */
export function toFieldError(err: unknown): ServerFieldError | null {
  if (!(err instanceof ApiError) || !err.code?.startsWith("eval_invalid_")) return null;
  const d = (err.details ?? {}) as { field?: unknown; reason?: unknown };
  const field = typeof d.field === "string" ? d.field : "";
  const reason = typeof d.reason === "string" ? d.reason : null;
  const key: FieldKey = field === "name" ? "name" : field === "input_diff" ? "input_diff" : "expectation";
  return { field: key, reason, message: err.message };
}

export type RefusalKey =
  | "eval_finding_outdated"
  | "eval_agent_missing"
  | "eval_finding_undecided"
  | "not_found"
  | "generic";

export function refusalKey(err: unknown): RefusalKey {
  if (err instanceof ApiError) {
    if (
      err.code === "eval_finding_outdated" ||
      err.code === "eval_agent_missing" ||
      err.code === "eval_finding_undecided"
    ) {
      return err.code;
    }
    if (err.status === 404) return "not_found";
  }
  return "generic";
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
