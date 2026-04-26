/** Trim and strip trailing slash except for "/". */
export function normalizeRedirectPath(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith("/") && trimmed !== "/"
    ? trimmed.slice(0, -1)
    : trimmed;
}

/**
 * If destination is a static internal path (no captures), return normalized path.
 * Strips trailing `?$args` nginx idiom. External URLs and templates with $1..$9 → null.
 */
export function staticInternalDestinationPath(
  destinationTemplate: string
): string | null {
  const d = destinationTemplate.replace(/\?\$args$/, "");
  const base = normalizeRedirectPath(d);
  if (!base.startsWith("/")) {
    return null;
  }
  if (base.startsWith("//")) {
    return null;
  }
  if (/\$[0-9]+/.test(base)) return null;
  return base;
}
