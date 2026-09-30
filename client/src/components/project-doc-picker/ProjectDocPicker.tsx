/* ProjectDocPicker — the attach/detach + drag-reorder list of a repo's
   project-context documents (specs/docs/insights). Headless about copy that
   differs per consumer: `header` is pre-translated JSX supplied by the
   caller (heading + badge + helper text). Fetches its own doc listing via
   `useProjectDocs(repoId)`; the caller owns the (possibly optimistic)
   `attached` order and receives the full next order through `onChange`. */
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
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { Badge, Checkbox, Icon, TextInput, Skeleton, EmptyState, ErrorState } from "@devdigest/ui";
import type { SpecFile } from "@/lib/types";
import { useProjectDocs } from "@/lib/hooks/project-context";
import { formatTokenCount } from "@/lib/format";
import { filterDocs, toggleAttached, moveAttached, attachedTokenTotal, splitPath } from "./helpers";
import { s } from "./styles";

/** Minimum pointer movement (px) before a drag starts — keeps a plain click
 *  near the handle from being read as a drag (matches SkillsTab). */
const DRAG_ACTIVATION_DISTANCE = 4;

export interface ProjectDocPickerProps {
  repoId: string | null;
  attached: string[];
  onChange: (next: string[]) => void;
  header: React.ReactNode;
  disabled?: boolean;
  onPreview: (path: string) => void;
  contextPageHref: string | null;
}

function DocRow({
  doc,
  attached,
  disabled,
  reorderDisabled,
  index,
  lastIndex,
  onToggle,
  onPreview,
  onMove,
}: {
  doc: SpecFile;
  attached: boolean;
  disabled: boolean;
  reorderDisabled: boolean;
  index: number;
  lastIndex: number;
  onToggle: () => void;
  onPreview: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const t = useTranslations("projectDocs.picker");
  const draggable = attached && !reorderDisabled;
  const sortable = useSortable({ id: doc.path, disabled: !draggable });
  const { dir, name } = splitPath(doc.path);
  const style: React.CSSProperties = {
    ...s.row(sortable.isDragging),
    transform: sortable.transform
      ? `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)`
      : undefined,
    transition: sortable.transition,
  };
  return (
    <div ref={sortable.setNodeRef} style={style}>
      <button
        type="button"
        aria-label={t("dragAria", { path: doc.path })}
        style={s.handle(draggable)}
        aria-hidden={!draggable}
        {...(draggable ? { ...sortable.attributes, ...sortable.listeners } : { tabIndex: -1 })}
      >
        <Icon.Menu size={14} />
      </button>
      <Checkbox
        checked={attached}
        onChange={onToggle}
        label={
          <span style={s.srOnly}>
            {attached ? t("detachAria", { path: doc.path }) : t("attachAria", { path: doc.path })}
          </span>
        }
      />
      <div style={s.pathCol}>
        <span style={s.name}>{name}</span>
        {dir && <span style={s.dir}>{dir}</span>}
      </div>
      <div style={s.meta}>
        {doc.type && <Badge>{doc.type}</Badge>}
        {doc.truncated && <span style={s.truncated}>{t("truncated")}</span>}
      </div>
      <button
        type="button"
        aria-label={t("previewAria", { path: doc.path })}
        title={t("previewAria", { path: doc.path })}
        onClick={onPreview}
        style={s.previewBtn}
      >
        <Icon.Eye size={15} />
      </button>
      {attached && (
        <div style={s.moveBtns}>
          <button
            type="button"
            aria-label={t("moveUpAria", { path: doc.path })}
            disabled={disabled || reorderDisabled || index === 0}
            onClick={() => onMove(-1)}
            style={s.moveBtn(disabled || reorderDisabled || index === 0)}
          >
            <Icon.ArrowUp size={13} />
          </button>
          <button
            type="button"
            aria-label={t("moveDownAria", { path: doc.path })}
            disabled={disabled || reorderDisabled || index === lastIndex}
            onClick={() => onMove(1)}
            style={s.moveBtn(disabled || reorderDisabled || index === lastIndex)}
          >
            <Icon.ArrowDown size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export function ProjectDocPicker({
  repoId,
  attached,
  onChange,
  header,
  disabled,
  onPreview,
  contextPageHref,
}: ProjectDocPickerProps) {
  const t = useTranslations("projectDocs.picker");
  const [query, setQuery] = React.useState("");
  const { data, isLoading, isError, refetch } = useProjectDocs(repoId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
  );

  if (!repoId) {
    return (
      <div style={s.wrap}>
        {header}
        <div style={s.centerNote}>{t("selectRepoPrompt")}</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={s.wrap}>
        {header}
        <Skeleton height={200} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={s.wrap}>
        {header}
        <ErrorState body={t("loadError")} onRetry={() => refetch()} />
      </div>
    );
  }

  const docsAll = data?.docs ?? [];

  if (docsAll.length === 0) {
    return (
      <div style={s.wrap}>
        {header}
        <EmptyState
          icon="FileText"
          title={t("empty.title")}
          body={t("empty.body")}
          cta={contextPageHref ? t("empty.cta") : undefined}
          onCta={contextPageHref ? () => window.location.assign(contextPageHref) : undefined}
        />
      </div>
    );
  }

  const byPath = new Map(docsAll.map((d) => [d.path, d]));
  const attachedRows = attached.map((p) => byPath.get(p)).filter((d): d is SpecFile => !!d);
  const attachedSet = new Set(attached);
  const unattachedRows = docsAll.filter((d) => !attachedSet.has(d.path));
  const rows = filterDocs([...attachedRows, ...unattachedRows], query);
  const filtering = query.trim().length > 0;
  const reorderDisabled = filtering;
  const total = attachedTokenTotal(docsAll, attached);

  const toggle = (path: string) => onChange(toggleAttached(attached, path));

  const move = (path: string, dir: -1 | 1) => {
    const from = attached.indexOf(path);
    if (from === -1) return;
    onChange(moveAttached(attached, from, from + dir));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = attached.indexOf(String(active.id));
    const to = attached.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onChange(arrayMove(attached, from, to));
  };

  return (
    <div style={s.wrap}>
      <div style={s.topRow}>
        <div style={s.headerCol}>{header}</div>
        <div style={s.searchCol}>
          <TextInput value={query} onChange={setQuery} placeholder={t("filterPlaceholder")} />
        </div>
      </div>
      {rows.length === 0 ? (
        <div style={s.centerNote}>{t("noMatches", { query })}</div>
      ) : (
        <div style={s.list}>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <SortableContext
              items={rows.filter((r) => attachedSet.has(r.path)).map((r) => r.path)}
              strategy={verticalListSortingStrategy}
            >
              {rows.map((doc) => {
                const isAttached = attachedSet.has(doc.path);
                const attachedIndex = attached.indexOf(doc.path);
                return (
                  <DocRow
                    key={doc.path}
                    doc={doc}
                    attached={isAttached}
                    disabled={!!disabled}
                    reorderDisabled={reorderDisabled}
                    index={attachedIndex}
                    lastIndex={attached.length - 1}
                    onToggle={() => toggle(doc.path)}
                    onPreview={() => onPreview(doc.path)}
                    onMove={(dir) => move(doc.path, dir)}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
      )}
      <div style={s.footer}>
        <span>{t("footerTotal", { count: formatTokenCount(total) })}</span>
        <span>{t("injectedNote")}</span>
      </div>
    </div>
  );
}
