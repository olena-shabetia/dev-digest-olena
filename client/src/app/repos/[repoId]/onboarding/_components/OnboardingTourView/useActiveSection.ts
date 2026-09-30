/* useActiveSection — tracks which section card is in view (TOC highlight) and
   lets the view force one (TOC click, #hash on load). UI-only state, so it
   lives beside the view rather than in lib/hooks. */
"use client";

import React from "react";
import { ACTIVE_SECTION_ROOT_MARGIN } from "./constants";

export function useActiveSection(anchors: readonly string[], enabled: boolean) {
  const [active, setActive] = React.useState<string>(anchors[0] ?? "");

  React.useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: ACTIVE_SECTION_ROOT_MARGIN },
    );
    for (const id of anchors) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [anchors, enabled]);

  const goTo = React.useCallback((anchor: string) => {
    setActive(anchor);
    document.getElementById(anchor)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, []);

  return { active, goTo };
}
