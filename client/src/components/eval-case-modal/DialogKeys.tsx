/* DialogKeys — gives the vendored Modal (which has no Escape, initial focus or
   Tab trap) keyboard handling when rendered inside it. Used by the loading and
   refusal states; the editor wires useDialogKeys itself. */
"use client";

import { useRef } from "react";
import { useDialogKeys } from "@/lib/hooks";

export function DialogKeys({ onClose }: { onClose: () => void }) {
  const anchor = useRef<HTMLSpanElement>(null);
  useDialogKeys(anchor, { onEscape: onClose, active: true });
  return <span ref={anchor} hidden />;
}
