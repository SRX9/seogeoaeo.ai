/**
 * Escape a value for interpolation into HTML. Covers attribute context too
 * (`"` and `'`), so one hardened helper serves both text nodes and attributes —
 * especially the fix-snippet path that writes markup destined for customer sites.
 */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
