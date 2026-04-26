/**
 * Parsed redirect rule — aligns with Slugshift nginx parser output.
 */
export interface ParsedRedirectRule {
  sourcePattern: string;
  destination: string;
  statusCode: 301 | 302;
  lineNumber: number;
  isStatic: boolean;
  clientShouldForwardQueryString: boolean;
  isFullUrl: boolean;
  warnings: string[];
  normalizedSource?: string;
}

export interface NginxParseResult {
  rules: ParsedRedirectRule[];
  importableRules: ParsedRedirectRule[];
  manualReviewRules: ParsedRedirectRule[];
  errors: ParseError[];
  summary: {
    totalRules: number;
    importableCount: number;
    manualReviewCount: number;
    duplicateCount: number;
    errorCount: number;
  };
}

export interface ParseError {
  lineNumber: number;
  line: string;
  message: string;
}
