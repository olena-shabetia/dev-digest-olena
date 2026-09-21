import React from "react";
import { Icon } from "../icons";

type SelectOption = string | { value: string; label: string };
const optValue = (o: SelectOption) => (typeof o === "string" ? o : o.value);
const optLabel = (o: SelectOption) => (typeof o === "string" ? o : o.label);

/**
 * Single-select for short option lists (a handful to a couple dozen items) —
 * NOT a native `<select>`. A native `<select>`'s options popup is painted by
 * the OS/browser's own native widget on many platforms (observed: Chromium
 * under this dev environment's OS), which ignores the page's CSS variables
 * for everything except the OS's own hover/selection highlight — every
 * unselected `<option>` renders using whatever text/background color that
 * native theme defaults to, regardless of `color`, `background`, or even
 * `color-scheme` set on the `<select>`/`<option>` elements. The only reliable
 * fix is to not use a native popup at all. This mirrors `SearchableSelect`'s
 * fully custom, DOM-rendered dropdown (same visual language), minus the
 * filter box — for a "Search…" experience over a long list, use
 * `SearchableSelect` instead.
 */
export function SelectInput({
  value,
  onChange,
  options,
  mono = true,
}: {
  value: string;
  onChange?: (v: string) => void;
  options: SelectOption[];
  mono?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const current = options.find((o) => optValue(o) === value);
  const currentLabel = current ? optLabel(current) : value;

  const pick = (o: SelectOption) => {
    onChange?.(optValue(o));
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 7,
          border: "1px solid var(--border-strong)",
          background: "var(--bg-elevated)",
          cursor: "pointer",
        }}
      >
        <span
          className={mono ? "mono" : undefined}
          style={{
            flex: 1,
            fontSize: 14,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {currentLabel}
        </span>
        <Icon.ChevronsUpDown size={14} style={{ color: "var(--text-muted)", pointerEvents: "none" }} />
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: 9,
            boxShadow: "var(--shadow-modal)",
            zIndex: 40,
            maxHeight: 280,
            overflowY: "auto",
            padding: 6,
            animation: "ddpop .12s ease",
          }}
        >
          {options.map((o) => {
            const v = optValue(o);
            const sel = v === value;
            return (
              <button
                key={v}
                type="button"
                onClick={() => pick(o)}
                className={mono ? "mono" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: sel ? "var(--bg-hover)" : "transparent",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <Icon.Check size={13} style={{ color: sel ? "var(--text-primary)" : "transparent", flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {optLabel(o)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
