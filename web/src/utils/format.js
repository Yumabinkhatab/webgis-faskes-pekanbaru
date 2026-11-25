/**
 * Escape HTML special characters before rendering database or user strings.
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Render an accessibility classification pill badge.
 */
export function classBadgeHtml(accessClass) {
  const slug = String(accessClass || '')
    .toLowerCase()
    .replace(/\s+/g, '-');
  return `<span class="badge badge-${escapeHtml(slug)}">${escapeHtml(accessClass)}</span>`;
}
