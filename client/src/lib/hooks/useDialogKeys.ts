/* Escape handling, initial focus and a Tab focus trap for dialogs —
   the vendored Modal provides none of them. Focuses the first input/textarea,
   else the first focusable control. */
import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogKeys(
  anchor: RefObject<HTMLElement | null>,
  { onEscape, active }: { onEscape: () => void; active: boolean },
) {
  // Focus the first field once, on open.
  useEffect(() => {
    const dialog = anchor.current?.closest<HTMLElement>('[role="dialog"]');
    const target =
      dialog?.querySelector<HTMLElement>("input, textarea") ??
      dialog?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
  }, [anchor]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = anchor.current?.closest<HTMLElement>('[role="dialog"]');
      if (!dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const current = document.activeElement;
      if (!dialog.contains(current)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [anchor, onEscape, active]);
}
