/** Pure helpers for the Export wizard. */

/** Decode a base64 string to raw bytes (the zip payload from `export-ci`). */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Human-readable byte size ("812 B", "48.2 KB", "1.3 MB"). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Only http(s) URLs may become an href — blocks `javascript:` from server data. */
export function safeHttpUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Strip anything but a plain file name before it reaches `a.download`. */
export function safeDownloadName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "-");
  return cleaned.length > 0 ? cleaned : "devdigest-ci.zip";
}

/** Save bytes as a file via a transient object URL. Browser-only. */
export function downloadBytes(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeDownloadName(filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
