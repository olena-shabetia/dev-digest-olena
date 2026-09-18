/* useFindingsHoverPopover — trigger mechanics (hover-intent timer, focus/blur,
   Escape, scroll/resize close, viewport placement) shared by every findings
   popover trigger. Callers supply `previewCount` (for height estimation) and
   attach the returned handlers to both the trigger element and the popover
   itself — the popover holds a scrollable list and a clickable file:line
   link, so it needs its own hover handlers to stay open while the pointer is
   over it, not just over the trigger. The popover is rendered by the caller
   (portaled) so this hook stays free of any one page's business logic. */
"use client";

import React from "react";
import { estimateHeight, placePopover, type Placement } from "./helpers";
import { HOVER_OPEN_MS, HOVER_CLOSE_MS } from "./constants";

export function useFindingsHoverPopover(previewCount: number) {
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = React.useState(false);
  const [placement, setPlacement] = React.useState<Placement | null>(null);

  const clearOpenTimer = React.useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);
  const clearCloseTimer = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const doOpen = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const height = estimateHeight(previewCount);
    setPlacement(placePopover(rect, height, { width: window.innerWidth, height: window.innerHeight }));
    setOpen(true);
  }, [previewCount]);

  /** Trigger/popover mouseenter — cancels any pending close (bridges the gap
   *  between the two elements) and schedules the open. */
  const scheduleOpen = React.useCallback(() => {
    clearCloseTimer();
    clearOpenTimer();
    openTimer.current = setTimeout(doOpen, HOVER_OPEN_MS);
  }, [clearCloseTimer, clearOpenTimer, doOpen]);

  /** Immediate close — Escape/blur, or scroll/resize while open. */
  const close = React.useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    setOpen(false);
  }, [clearOpenTimer, clearCloseTimer]);

  /** Trigger/popover mouseleave — delayed, so moving the pointer from one to
   *  the other doesn't close it mid-transit. */
  const scheduleClose = React.useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  }, [clearOpenTimer, clearCloseTimer]);

  // A portaled `position: fixed` popover doesn't track scroll/resize — close
  // rather than chase. But the popover's OWN finding list scrolls internally
  // (see styles.ts `s.list`), and that scroll also fires this capturing
  // listener (scroll events bubble/capture like any other DOM event) — so it
  // must be told apart from a page/container scroll that actually moves the
  // trigger out from under a fixed-position popover. Ignore any scroll whose
  // target is inside the popover itself.
  React.useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && popoverRef.current?.contains(e.target)) return;
      close();
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [open, close]);
  React.useEffect(() => {
    return () => {
      clearOpenTimer();
      clearCloseTimer();
    };
  }, [clearOpenTimer, clearCloseTimer]);

  return { triggerRef, popoverRef, open, placement, scheduleOpen, scheduleClose, close };
}
