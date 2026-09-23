/* LineNumberedEditor — a plain, dependency-free "code editor" chrome: a
   line-number gutter next to a textarea, synced on scroll, plus an optional
   filename header (with an "unsaved" badge) and a token-count footer. No
   syntax highlighting — a deliberate scope cut (see specs/L02-skills.md, the
   "body editor widget" section). First caller is the skill body editor; a
   second caller should promote no further, this already lives in the shared
   layer. */
"use client";

import React from "react";
import { Badge } from "@devdigest/ui";
import { s } from "./styles";

export interface LineNumberedEditorProps {
  value: string;
  onChange: (v: string) => void;
  /** Header filename, e.g. "uncovered-branches.md". Header row is omitted
   *  entirely when not given. */
  filename?: string;
  /** Shows the "unsaved" badge in the header when true. */
  unsaved?: boolean;
  placeholder?: string;
  /** Override for the "unsaved" badge text (defaults to English). */
  unsavedLabel?: string;
  /** Override for the token-count footer text (defaults to "{n} tokens"). */
  tokensLabel?: (n: number) => string;
}

export function LineNumberedEditor({
  value,
  onChange,
  filename,
  unsaved,
  placeholder,
  unsavedLabel = "unsaved",
  tokensLabel = (n: number) => `${n} tokens`,
}: LineNumberedEditorProps) {
  const gutterRef = React.useRef<HTMLPreElement>(null);
  const lineCount = value.length === 0 ? 1 : value.split("\n").length;
  const tokenCount = Math.ceil(value.length / 4);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  return (
    <div style={s.wrap}>
      {filename && (
        <div style={s.header}>
          <span style={s.filename}>{filename}</span>
          {unsaved && <Badge>{unsavedLabel}</Badge>}
        </div>
      )}
      <div style={s.body}>
        <pre ref={gutterRef} style={s.gutter}>
          {Array.from({ length: lineCount }, (_, i) => i + 1).join("\n")}
        </pre>
        <textarea
          style={s.textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          placeholder={placeholder}
          spellCheck={false}
        />
      </div>
      <div style={s.footer}>{tokensLabel(tokenCount)}</div>
    </div>
  );
}
