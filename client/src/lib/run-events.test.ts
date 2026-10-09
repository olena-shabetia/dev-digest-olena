import { describe, it, expect } from "vitest";
import type { RunEvent } from "@devdigest/shared";
import { orderRunEvents } from "./run-events";

const ev = (runId: string, seq: number, t: string, msg: string, kind: RunEvent["kind"] = "info"): RunEvent => ({
  runId,
  seq,
  t,
  kind,
  msg,
});

describe("orderRunEvents", () => {
  it("orders by time even when a later stream replays older events after newer live ones", () => {
    // Stream A is live; stream B connects late and replays its buffer afterwards.
    const arrival = [
      ev("A", 5, "10:00:09", "A late"),
      ev("B", 1, "10:00:01", "B early"),
      ev("A", 4, "10:00:05", "A mid"),
    ];
    expect(orderRunEvents(arrival, ["A", "B"]).map((e) => e.msg)).toEqual(["B early", "A mid", "A late"]);
  });

  it("breaks ties inside one second by run order, then by seq", () => {
    const arrival = [
      ev("B", 1, "10:00:00", "B1"),
      ev("A", 2, "10:00:00", "A2"),
      ev("A", 1, "10:00:00", "A1"),
    ];
    expect(orderRunEvents(arrival, ["A", "B"]).map((e) => e.msg)).toEqual(["A1", "A2", "B1"]);
  });

  it("drops fan-out copies of shared pre-work that arrive on several streams", () => {
    const arrival = [
      ev("A", 1, "10:00:00", "Loading PR diff…"),
      ev("B", 1, "10:00:00", "Loading PR diff…"),
      ev("C", 1, "10:00:00", "Loading PR diff…"),
      ev("A", 2, "10:00:01", "Diff ready"),
      ev("B", 2, "10:00:01", "Diff ready"),
    ];
    expect(orderRunEvents(arrival, ["A", "B", "C"]).map((e) => e.msg)).toEqual([
      "Loading PR diff…",
      "Diff ready",
    ]);
  });

  it("keeps repeated identical lines from the SAME run", () => {
    const arrival = [ev("A", 1, "10:00:00", "retry"), ev("A", 2, "10:00:00", "retry")];
    expect(orderRunEvents(arrival, ["A"])).toHaveLength(2);
  });

  it("keeps identical lines from different runs when they happened at different times", () => {
    const arrival = [ev("A", 9, "10:00:10", "Run complete"), ev("B", 9, "10:00:40", "Run complete")];
    expect(orderRunEvents(arrival, ["A", "B"])).toHaveLength(2);
  });

  it("does not mutate its input", () => {
    const arrival = [ev("A", 2, "10:00:02", "b"), ev("A", 1, "10:00:01", "a")];
    const copy = [...arrival];
    orderRunEvents(arrival, ["A"]);
    expect(arrival).toEqual(copy);
  });
});
