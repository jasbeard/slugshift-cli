import {
  normalizeRedirectPath,
  staticInternalDestinationPath,
} from "./paths.js";
import type { NginxParseResult, ParsedRedirectRule, ParseError } from "./types.js";

/**
 * Regex to match nginx rewrite rules:
 * rewrite ^pattern$ replacement permanent|redirect;
 */
const REWRITE_REGEX =
  /^\s*rewrite\s+(\^[^$]+\$)\s+(\S+)\s+(permanent|redirect)\s*;?\s*$/;

function hasNumberedCaptureGroups(destination: string): boolean {
  return /\$[0-9]+/.test(destination);
}

function isFullUrl(dest: string): boolean {
  return /^https?:\/\//i.test(dest) || dest.startsWith("//");
}

function normalizePatternToPath(pattern: string): string | null {
  const simpleMatch = pattern.match(/^\^(\/[^$*+?()[\]{}|\\]*)\/?\$\s*$/);
  if (simpleMatch) {
    return simpleMatch[1];
  }
  return null;
}

/** Parse nginx rewrite rules from config content (Slugshift-compatible). */
export function parseNginxRedirects(content: string): NginxParseResult {
  const rules: ParsedRedirectRule[] = [];
  const errors: ParseError[] = [];
  const seenSources = new Map<string, number>();

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(REWRITE_REGEX);
    if (!match) {
      if (trimmed.includes("rewrite")) {
        errors.push({
          lineNumber,
          line: trimmed,
          message:
            "Invalid rewrite syntax. Expected: rewrite ^pattern$ replacement permanent|redirect;",
        });
      }
      continue;
    }

    const [, sourcePattern, destination, flag] = match;
    const statusCode = flag === "permanent" ? 301 : 302;
    const clientShouldForwardQueryString = destination.includes("$args");
    const isFull = isFullUrl(destination);
    const isStatic = !hasNumberedCaptureGroups(destination);
    const normalizedSource = normalizePatternToPath(sourcePattern);

    const warnings: string[] = [];

    if (normalizedSource) {
      const firstSeen = seenSources.get(normalizedSource);
      if (firstSeen !== undefined) {
        warnings.push(`Duplicate source (first at line ${firstSeen})`);
      } else {
        seenSources.set(normalizedSource, lineNumber);
      }
    }

    if (!isStatic) {
      warnings.push(
        "Contains numbered capture groups ($1, $2, ...) - cannot be imported as static redirect; needs manual expansion or regex support"
      );
    }

    rules.push({
      sourcePattern,
      destination,
      statusCode,
      lineNumber,
      isStatic,
      clientShouldForwardQueryString,
      isFullUrl: isFull,
      warnings,
      normalizedSource: normalizedSource ?? undefined,
    });
  }

  const importableRules = rules.filter((r) => r.isStatic);
  const manualReviewRules = rules.filter((r) => !r.isStatic);
  const duplicateCount = rules.filter((r) =>
    r.warnings.some((w) => w.startsWith("Duplicate"))
  ).length;

  return {
    rules,
    importableRules,
    manualReviewRules,
    errors,
    summary: {
      totalRules: rules.length,
      importableCount: importableRules.length,
      manualReviewCount: manualReviewRules.length,
      duplicateCount,
      errorCount: errors.length,
    },
  };
}

export function countRedirectChains(rules: ParsedRedirectRule[]): number {
  const sourcePaths = new Set<string>();
  for (const r of rules) {
    if (r.normalizedSource) {
      sourcePaths.add(r.normalizedSource);
    }
  }
  let count = 0;
  for (const r of rules) {
    if (r.isFullUrl) continue;
    const dest = staticInternalDestinationPath(r.destination);
    if (dest === null) continue;
    if (sourcePaths.has(dest)) count++;
  }
  return count;
}

export type FaithfulRedirectRecordInput = {
  matchType: "exact_path" | "nginx_regex";
  sourcePattern: string;
  destinationTemplate: string;
  statusCode: 301 | 302;
  clientShouldForwardQueryString: boolean;
  sortOrder?: number;
};

function parsedRuleToFaithfulRecord(
  r: ParsedRedirectRule
): FaithfulRedirectRecordInput {
  const destStored = r.destination.replace(/\?\$args$/, "");
  const isExact = Boolean(r.isStatic && r.normalizedSource);
  return {
    matchType: isExact ? "exact_path" : "nginx_regex",
    sourcePattern: isExact
      ? normalizeRedirectPath(r.normalizedSource!)
      : r.sourcePattern,
    destinationTemplate: destStored,
    statusCode: r.statusCode,
    clientShouldForwardQueryString: r.clientShouldForwardQueryString,
    sortOrder: r.lineNumber,
  };
}

export function toFaithfulRedirectRecords(
  result: NginxParseResult
): FaithfulRedirectRecordInput[] {
  return result.rules.map(parsedRuleToFaithfulRecord);
}

export function toImportableFaithfulRedirectRecords(
  result: NginxParseResult
): FaithfulRedirectRecordInput[] {
  return result.importableRules.map(parsedRuleToFaithfulRecord);
}
