import type { RunEvent } from "@devdigest/shared";

/**
 * Merge the events of several run streams into ONE chronological log.
 *
 * The Live Log subscribes to one SSE stream per run and receives events in
 * network-arrival order, which is not chronological: every stream first replays
 * its whole buffer on connect (so an older line of run B can land after a newer
 * live line of run A), and the shared pre-work (diff load, intent) is fanned out
 * to EVERY run, so the same lines arrive once per stream.
 *
 * Order: server wall-clock `t` (HH:MM:SS), then the run's position in `runIds`
 * (agents execute one after another in that order), then the per-run `seq`.
 * An event identical in (t, kind, msg) to one already kept from a DIFFERENT run
 * is a fan-out copy and is dropped.
 */
export function orderRunEvents(events: RunEvent[], runIds: string[]): RunEvent[] {
  const runOrder = new Map(runIds.map((id, i) => [id, i]));
  const rank = (e: RunEvent) => runOrder.get(e.runId) ?? runIds.length;

  const sorted = [...events].sort(
    (a, b) => a.t.localeCompare(b.t) || rank(a) - rank(b) || a.seq - b.seq,
  );

  const firstRunFor = new Map<string, string>();
  return sorted.filter((e) => {
    const sig = `${e.t}\u0000${e.kind}\u0000${e.msg}`;
    const owner = firstRunFor.get(sig);
    if (owner === undefined) {
      firstRunFor.set(sig, e.runId);
      return true;
    }
    return owner === e.runId;
  });
}
