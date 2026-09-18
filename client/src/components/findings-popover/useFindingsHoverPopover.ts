/* useFindingsHoverPopover — trigger mechanics (hover-intent timer, focus/blur,
   Escape, scroll/resize close, viewport placement) shared by every read-only
   findings popover trigger. Callers supply `previewCount`/`hasMore` (for
   height estimation) and attach `triggerProps` to the element that should
   open the popover; the popover itself is rendered by the caller (portaled)
   so this hook stays free of any one page's business logic. */
"use client";

import React from "react";
import { estimateHeight, placePopover, type Placement } from "./helpers";
import { HOVER_OPEN_MS } from "./constants";

export function useFindingsHoverPopover(previewCount: number, hasMore: boolean) {
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = React.useState(false);
  const [placement, setPlacement] = React.useState<Placement | null>(null);

  const clearOpenTimer = React.useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);

  const doOpen = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const height = estimateHeight(previewCount, hasMore);
    setPlacement(placePopover(rect, height, { width: window.innerWidth, height: window.innerHeight }));
    setOpen(true);
  }, [previewCount, hasMore]);

  const scheduleOpen = React.useCallback(() => {
    clearOpenTimer();
    openTimer.current = setTimeout(doOpen, HOVER_OPEN_MS);
  }, [clearOpenTimer, doOpen]);

  const close = React.useCallback(() => {
    clearOpenTimer();
    setOpen(false);
  }, [clearOpenTimer]);

  // A portaled `position: fixed` popover doesn't track scroll/resize — close
  // rather than chase, and clear a pending open timer if the trigger unmounts
  // (e.g. a filter/sort change) before it fires.
  React.useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [open, close]);
  React.useEffect(() => clearOpenTimer, [clearOpenTimer]);

  return { triggerRef, open, placement, scheduleOpen, close };
}
