/* AgentColumn/helpers.ts — pure mapping of RunEvents to LiveLogStream lines.
   Mirrors run-trace-drawer's own eventsToLog (that file is a consume-only
   dependency here — criterion 60 forbids editing it), kept tiny on purpose. */
import type { LogLine } from "@devdigest/ui";
import type { RunEvent } from "@devdigest/shared";

export function runEventsToLog(events: readonly RunEvent[]): LogLine[] {
  return events.map((e) => ({ t: e.t, k: e.kind, m: e.msg }));
}
