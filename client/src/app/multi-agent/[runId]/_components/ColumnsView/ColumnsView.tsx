/* ColumnsView — one AgentColumn per child, in submission/array order. Wraps
   onto new rows rather than a fixed column count (criterion 47). */
"use client";

import type { MultiAgentChild } from "@devdigest/shared";
import { AgentColumn } from "./_components/AgentColumn";
import { s } from "./styles";

export function ColumnsView({
  runChildren,
  onOpenTrace,
  onSettled,
}: {
  runChildren: readonly MultiAgentChild[];
  onOpenTrace: (runId: string, agentName: string | null) => void;
  onSettled: () => void;
}) {
  return (
    <div style={s.root}>
      {runChildren.map((c) => (
        <AgentColumn key={c.run.run_id} child={c} onOpenTrace={onOpenTrace} onSettled={onSettled} />
      ))}
    </div>
  );
}

export default ColumnsView;
