#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  countRedirectChains,
  parseNginxRedirects,
  toFaithfulRedirectRecords,
  toImportableFaithfulRedirectRecords,
} from "./parse/nginx.js";
import type { FaithfulRedirectRecordInput } from "./parse/nginx.js";
import type { ParsedRedirectRule } from "./parse/types.js";
import { rulesToCsvFaithful, rulesToCsvRaw } from "./serialize/csv.js";
import type { FaithfulRow, RawRuleRow } from "./serialize/csv.js";
import { toJsonOutput } from "./serialize/json.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8")
) as { version: string };

async function readInput(configPath: string): Promise<string> {
  if (configPath === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  return readFile(configPath, "utf8");
}

function toRawRows(rules: ParsedRedirectRule[]): RawRuleRow[] {
  return rules.map((r) => ({
    lineNumber: r.lineNumber,
    sourcePattern: r.sourcePattern,
    destination: r.destination,
    statusCode: r.statusCode,
    isStatic: r.isStatic,
    clientShouldForwardQueryString: r.clientShouldForwardQueryString,
    isFullUrl: r.isFullUrl,
    warnings: r.warnings.join("; "),
    normalizedSource: r.normalizedSource ?? "",
  }));
}

function toFaithfulRows(records: FaithfulRedirectRecordInput[]): FaithfulRow[] {
  return records.map((r) => ({
    matchType: r.matchType,
    sourcePattern: r.sourcePattern,
    destinationTemplate: r.destinationTemplate,
    statusCode: r.statusCode,
    clientShouldForwardQueryString: r.clientShouldForwardQueryString,
    sortOrder: r.sortOrder ?? 0,
  }));
}

function printSummary(
  result: ReturnType<typeof parseNginxRedirects>,
  chainCount: number
): void {
  const { summary } = result;
  const lines = [
    `rules: ${summary.totalRules}`,
    `importable: ${summary.importableCount}`,
    `manual_review: ${summary.manualReviewCount}`,
    `duplicates: ${summary.duplicateCount}`,
    `errors: ${summary.errorCount}`,
    `chains: ${chainCount}`,
  ];
  console.error(lines.join("\n"));
}

const program = new Command();

program
  .name("slugshift")
  .description(
    "Convert nginx redirect rewrite rules to JSON or CSV (Slugshift-compatible semantics)."
  )
  .version(pkg.version)
  .argument("<config>", "Path to .conf/.nginx, or - for stdin")
  .argument("<format>", "Output format: json or csv")
  .option("--faithful", "Slugshift API-shaped rows (matchType, destinationTemplate, …)")
  .option(
    "--importable-only",
    "Only static importable rules (no numbered captures in destination)"
  )
  .option("--summary", "Print counts to stderr")
  .option("--strict", "Exit with code 1 if any parse errors")
  .option("-o, --output <file>", "Write to file instead of stdout")
  .action(
    async (
      config: string,
      format: string,
      opts: {
        faithful?: boolean;
        importableOnly?: boolean;
        summary?: boolean;
        strict?: boolean;
        output?: string;
      }
    ) => {
      const fmt = format.toLowerCase();
      if (fmt !== "json" && fmt !== "csv") {
        console.error(`Invalid format "${format}". Use json or csv.`);
        process.exitCode = 1;
        return;
      }

      let content: string;
      try {
        content = await readInput(config);
      } catch (e) {
        console.error(
          e instanceof Error ? e.message : "Failed to read config"
        );
        process.exitCode = 1;
        return;
      }

      const result = parseNginxRedirects(content);
      const chainCount = countRedirectChains(result.rules);

      if (opts.summary) {
        printSummary(result, chainCount);
      }

      let out: string;

      if (opts.faithful) {
        const records = opts.importableOnly
          ? toImportableFaithfulRedirectRecords(result)
          : toFaithfulRedirectRecords(result);
        const faithfulRows = toFaithfulRows(records);
        if (fmt === "json") {
          out = toJsonOutput(records);
        } else {
          out = rulesToCsvFaithful(faithfulRows);
        }
      } else {
        const rules = opts.importableOnly
          ? result.importableRules
          : result.rules;
        const rawRows = toRawRows(rules);
        if (fmt === "json") {
          out = toJsonOutput(rules);
        } else {
          out = rulesToCsvRaw(rawRows);
        }
      }

      try {
        if (opts.output) {
          await writeFile(opts.output, out, "utf8");
        } else {
          process.stdout.write(out);
        }
      } catch (e) {
        console.error(e instanceof Error ? e.message : "Write failed");
        process.exitCode = 1;
        return;
      }

      if (opts.strict && result.errors.length > 0) {
        process.exitCode = 1;
      }
    }
  );

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
