/** RFC 4180-style field escaping. */
function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function row(values: string[]): string {
  return values.map(escapeCell).join(",");
}

export type RawRuleRow = {
  lineNumber: number;
  sourcePattern: string;
  destination: string;
  statusCode: number;
  isStatic: boolean;
  clientShouldForwardQueryString: boolean;
  isFullUrl: boolean;
  warnings: string;
  normalizedSource: string;
};

export type FaithfulRow = {
  matchType: string;
  sourcePattern: string;
  destinationTemplate: string;
  statusCode: number;
  clientShouldForwardQueryString: boolean;
  sortOrder: number;
};

const RAW_HEADERS = [
  "lineNumber",
  "sourcePattern",
  "destination",
  "statusCode",
  "isStatic",
  "clientShouldForwardQueryString",
  "isFullUrl",
  "warnings",
  "normalizedSource",
] as const;

const FAITHFUL_HEADERS = [
  "matchType",
  "sourcePattern",
  "destinationTemplate",
  "statusCode",
  "clientShouldForwardQueryString",
  "sortOrder",
] as const;

export function rulesToCsvRaw(rows: RawRuleRow[]): string {
  const lines = [row([...RAW_HEADERS])];
  for (const r of rows) {
    lines.push(
      row([
        String(r.lineNumber),
        r.sourcePattern,
        r.destination,
        String(r.statusCode),
        String(r.isStatic),
        String(r.clientShouldForwardQueryString),
        String(r.isFullUrl),
        r.warnings,
        r.normalizedSource,
      ])
    );
  }
  return lines.join("\n") + "\n";
}

export function rulesToCsvFaithful(rows: FaithfulRow[]): string {
  const lines = [row([...FAITHFUL_HEADERS])];
  for (const r of rows) {
    lines.push(
      row([
        r.matchType,
        r.sourcePattern,
        r.destinationTemplate,
        String(r.statusCode),
        String(r.clientShouldForwardQueryString),
        String(r.sortOrder),
      ])
    );
  }
  return lines.join("\n") + "\n";
}
