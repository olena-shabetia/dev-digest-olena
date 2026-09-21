/* SkillsTab — attach/detach workspace skills to this agent, drag-reorder the
   attached ones. Reads join client-side: `GET /agents/:id/skills` (ids+order
   only) against the full `useSkills()` catalog. Both toggle and reorder call
   the same `POST /agents/:id/skills { skill_ids }`, which assigns
   `order = index` server-side. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Badge, Checkbox, Icon, TextInput, Skeleton, EmptyState } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { useAgentSkillLinks, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { DRAG_ACTIVATION_DISTANCE } from "./constants";
import { joinSkills, matchesFilter, type JoinedSkillRow } from "./helpers";
import { s } from "./styles";

function SkillRow({
  row,
  draggable,
  onToggle,
}: {
  row: JoinedSkillRow;
  draggable: boolean;
  onToggle: (id: string, next: boolean) => void;
}) {
  const sortable = useSortable({ id: row.skill.id, disabled: !draggable });
  const style: React.CSSProperties = {
    ...s.row(sortable.isDragging),
    transform: sortable.transform
      ? `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)`
      : undefined,
    transition: sortable.transition,
  };
  return (
    <div ref={sortable.setNodeRef} style={style}>
      <span
        style={s.handle(draggable)}
        aria-hidden={!draggable}
        title={draggable ? "Drag to reorder" : undefined}
        {...(draggable ? { ...sortable.attributes, ...sortable.listeners } : {})}
      >
        <Icon.Menu size={14} />
      </span>
      <Checkbox checked={row.linked} onChange={(next) => onToggle(row.skill.id, next)} />
      <span style={s.name}>{row.skill.name}</span>
      <Badge>{row.skill.type}</Badge>
    </div>
  );
}

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: skills, isLoading: skillsLoading } = useSkills();
  const { data: links, isLoading: linksLoading } = useAgentSkillLinks(agent.id);
  const setSkills = useSetAgentSkills(agent.id);

  const [query, setQuery] = React.useState("");
  const [order, setOrder] = React.useState<string[]>([]);

  // Sync local order from the server once links load (or the agent changes).
  React.useEffect(() => {
    if (!links) return;
    setOrder([...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id));
  }, [links, agent.id]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
  );

  const commit = (next: string[]) => {
    const prev = order;
    setOrder(next);
    setSkills.mutate(next, { onError: () => setOrder(prev) });
  };

  const toggle = (id: string, next: boolean) => {
    commit(next ? [...order, id] : order.filter((sid) => sid !== id));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    commit(arrayMove(order, oldIndex, newIndex));
  };

  if (skillsLoading || linksLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={160} />
        <Skeleton height={200} />
      </div>
    );
  }

  const all = skills ?? [];
  const rows = joinSkills(all, order).filter((row) => matchesFilter(row.skill, query));
  const linkedVisibleIds = rows.filter((r) => r.linked).map((r) => r.skill.id);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: order.length, total: all.length })}</span>
      </div>
      <TextInput value={query} onChange={setQuery} placeholder={t("skills.filterPlaceholder")} />
      <p style={s.hint}>{t("skills.orderHint")}</p>
      {rows.length === 0 ? (
        <EmptyState icon="Sparkles" title={t("skills.noResults")} />
      ) : (
        <div style={s.list}>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <SortableContext items={linkedVisibleIds} strategy={verticalListSortingStrategy}>
              {rows.map((row) => (
                <SkillRow key={row.skill.id} row={row} draggable={row.linked} onToggle={toggle} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}
