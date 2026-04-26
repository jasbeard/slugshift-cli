import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distCli = join(root, "dist", "cli.js");
const fixture = join(root, "test", "sample-nginx-redirects.conf");

function runCli(
  args: string[],
  opts?: { stdin?: string }
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [distCli, ...args], {
    encoding: "utf-8",
    cwd: root,
    input: opts?.stdin,
    env: process.env,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

describe("slugshift CLI (dist)", () => {
  beforeAll(() => {
    const r = spawnSync("yarn", ["build"], {
      cwd: root,
      encoding: "utf-8",
      env: process.env,
    });
    if (r.status !== 0) {
      throw new Error(`yarn build failed: ${r.stderr}`);
    }
  });

  it("outputs valid JSON for fixture", () => {
    const { status, stdout } = runCli([fixture, "json"]);
    expect(status).toBe(0);
    const data = JSON.parse(stdout) as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("prints summary to stderr", () => {
    const { status, stderr } = runCli([fixture, "json", "--summary"]);
    expect(status).toBe(0);
    expect(stderr).toContain("rules:");
    expect(stderr).toContain("chains:");
  });

  it("writes CSV with stable header", () => {
    const { status, stdout } = runCli([fixture, "csv"]);
    expect(status).toBe(0);
    const first = stdout.split("\n")[0];
    expect(first).toBe(
      "lineNumber,sourcePattern,destination,statusCode,isStatic,clientShouldForwardQueryString,isFullUrl,warnings,normalizedSource"
    );
  });

  it("stdin hyphen reads config", () => {
    const content = readFileSync(fixture, "utf8");
    const { status, stdout } = runCli(["-", "json"], { stdin: content });
    expect(status).toBe(0);
    const data = JSON.parse(stdout) as unknown[];
    expect(data.length).toBeGreaterThan(0);
  });

  it("--strict exits 1 when parse errors exist", () => {
    const bad = "rewrite ^/bad$ /dest;\n";
    const { status } = runCli(["-", "json", "--strict"], { stdin: bad });
    expect(status).toBe(1);
  });

  it("--faithful emits matchType", () => {
    const { status, stdout } = runCli([fixture, "json", "--faithful"]);
    expect(status).toBe(0);
    const data = JSON.parse(stdout) as { matchType: string }[];
    expect(data[0]).toHaveProperty("matchType");
    expect(data[0]).toHaveProperty("destinationTemplate");
  });
});
