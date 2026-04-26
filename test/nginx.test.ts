import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  countRedirectChains,
  parseNginxRedirects,
  toFaithfulRedirectRecords,
  toImportableFaithfulRedirectRecords,
} from "../src/parse/nginx.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe("parseNginxRedirects", () => {
  it("parses valid permanent rewrite rules", () => {
    const content = `
      rewrite ^/blog/old-post$ /blog/new-post permanent;
      rewrite ^/docs/legacy$ /docs/v2 permanent;
    `;
    const result = parseNginxRedirects(content);

    expect(result.rules).toHaveLength(2);
    expect(result.rules[0]).toMatchObject({
      sourcePattern: "^/blog/old-post$",
      destination: "/blog/new-post",
      statusCode: 301,
      isStatic: true,
      lineNumber: 2,
    });
    expect(result.rules[1]).toMatchObject({
      sourcePattern: "^/docs/legacy$",
      destination: "/docs/v2",
      statusCode: 301,
      isStatic: true,
      lineNumber: 3,
    });
    expect(result.summary.importableCount).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("parses valid temporary (302) rewrite rules", () => {
    const content = `rewrite ^/temp$ /new-location redirect;`;
    const result = parseNginxRedirects(content);

    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]).toMatchObject({
      statusCode: 302,
      destination: "/new-location",
    });
  });

  it("skips empty lines and comments", () => {
    const content = `
      # comment
      rewrite ^/a$ /b permanent;

      rewrite ^/c$ /d permanent;
    `;
    const result = parseNginxRedirects(content);

    expect(result.rules).toHaveLength(2);
    expect(result.rules[0].lineNumber).toBe(3);
    expect(result.rules[1].lineNumber).toBe(5);
  });

  it("reports errors for malformed rewrite lines", () => {
    const content = `
      rewrite ^/bad$ /dest;
      rewrite ^/missing-flag$ /dest
    `;
    const result = parseNginxRedirects(content);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatchObject({
      message: expect.stringContaining("Invalid rewrite syntax"),
    });
  });

  it("flags rules with capture groups as manual review", () => {
    const content = `rewrite ^/posts/(.+)$ /blog/$1 permanent;`;
    const result = parseNginxRedirects(content);

    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].isStatic).toBe(false);
    expect(
      result.rules[0].warnings.some((w) => w.includes("capture groups"))
    ).toBe(true);
    expect(result.importableRules).toHaveLength(0);
    expect(result.manualReviewRules).toHaveLength(1);
  });

  it("treats $args-only destination as importable static rule", () => {
    const content = `rewrite ^/search$ /find?$args permanent;`;
    const result = parseNginxRedirects(content);

    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]).toMatchObject({
      sourcePattern: "^/search$",
      destination: "/find?$args",
      isStatic: true,
      clientShouldForwardQueryString: true,
    });
    expect(result.importableRules).toHaveLength(1);
    expect(result.manualReviewRules).toHaveLength(0);
  });

  it("detects duplicate source patterns", () => {
    const content = `
      rewrite ^/blog/old$ /blog/new permanent;
      rewrite ^/blog/old$ /blog/other permanent;
    `;
    const result = parseNginxRedirects(content);

    expect(result.rules).toHaveLength(2);
    expect(
      result.rules[1].warnings.some((w) => w.includes("Duplicate source"))
    ).toBe(true);
    expect(result.summary.duplicateCount).toBe(1);
  });

  it("handles optional trailing semicolon", () => {
    const content = `rewrite ^/a$ /b permanent`;
    const result = parseNginxRedirects(content);

    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].destination).toBe("/b");
  });
});

describe("toFaithfulRedirectRecords", () => {
  it("converts static rules to exact_path records", () => {
    const content = `
      rewrite ^/blog/old-post$ /blog/new-post permanent;
      rewrite ^/docs/legacy$ /docs/v2 permanent;
    `;
    const result = parseNginxRedirects(content);
    const records = toFaithfulRedirectRecords(result);

    expect(records).toEqual([
      {
        matchType: "exact_path",
        sourcePattern: "/blog/old-post",
        destinationTemplate: "/blog/new-post",
        statusCode: 301,
        clientShouldForwardQueryString: false,
        sortOrder: 2,
      },
      {
        matchType: "exact_path",
        sourcePattern: "/docs/legacy",
        destinationTemplate: "/docs/v2",
        statusCode: 301,
        clientShouldForwardQueryString: false,
        sortOrder: 3,
      },
    ]);
  });

  it("strips ?$args and keeps clientShouldForwardQueryString in records", () => {
    const content = `rewrite ^/search$ /find?$args redirect;`;
    const result = parseNginxRedirects(content);
    const records = toFaithfulRedirectRecords(result);

    expect(records).toEqual([
      {
        matchType: "exact_path",
        sourcePattern: "/search",
        destinationTemplate: "/find",
        statusCode: 302,
        clientShouldForwardQueryString: true,
        sortOrder: 1,
      },
    ]);
  });

  it("maps capture destinations to nginx_regex", () => {
    const content = `rewrite ^/posts/(.+)$ /blog/$1 permanent;`;
    const result = parseNginxRedirects(content);
    const records = toFaithfulRedirectRecords(result);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      matchType: "nginx_regex",
      sourcePattern: "^/posts/(.+)$",
      destinationTemplate: "/blog/$1",
      statusCode: 301,
      clientShouldForwardQueryString: false,
      sortOrder: 1,
    });
  });
});

describe("toImportableFaithfulRedirectRecords", () => {
  it("omits rules that need manual review (numbered captures)", () => {
    const content = `
      rewrite ^/ok$ /dest permanent;
      rewrite ^/posts/(.+)$ /blog/$1 permanent;
    `;
    const result = parseNginxRedirects(content);
    const importable = toImportableFaithfulRedirectRecords(result);
    const all = toFaithfulRedirectRecords(result);

    expect(all).toHaveLength(2);
    expect(importable).toHaveLength(1);
    expect(importable[0]).toMatchObject({
      matchType: "exact_path",
      sourcePattern: "/ok",
      destinationTemplate: "/dest",
    });
  });
});

describe("countRedirectChains", () => {
  it("returns 0 when no chains exist", () => {
    const content = `
      rewrite ^/a$ /b permanent;
      rewrite ^/c$ /d permanent;
    `;
    const { rules } = parseNginxRedirects(content);
    expect(countRedirectChains(rules)).toBe(0);
  });

  it("counts rules whose destination is also a source", () => {
    const content = `
      rewrite ^/old$ /intermediate permanent;
      rewrite ^/intermediate$ /new permanent;
    `;
    const { rules } = parseNginxRedirects(content);
    expect(countRedirectChains(rules)).toBe(1);
  });

  it("counts multiple chain links in longer chain", () => {
    const content = `
      rewrite ^/a$ /b permanent;
      rewrite ^/b$ /c permanent;
      rewrite ^/c$ /d permanent;
    `;
    const { rules } = parseNginxRedirects(content);
    expect(countRedirectChains(rules)).toBe(2);
  });

  it("returns 0 when destination is external URL (skipped from chain count)", () => {
    const content = `
      rewrite ^/old$ https://example.com/new permanent;
      rewrite ^/other$ /page permanent;
    `;
    const { rules } = parseNginxRedirects(content);
    expect(countRedirectChains(rules)).toBe(0);
  });

  it("handles trailing slash in destination", () => {
    const content = `
      rewrite ^/a$ /b/ permanent;
      rewrite ^/b$ /c permanent;
    `;
    const { rules } = parseNginxRedirects(content);
    expect(countRedirectChains(rules)).toBe(1);
  });

  it("returns 0 for empty rules", () => {
    expect(countRedirectChains([])).toBe(0);
  });

  it("ignores non-static rules", () => {
    const content = `
      rewrite ^/old$ /new permanent;
      rewrite ^/posts/(.+)$ /blog/$1 permanent;
    `;
    const { rules } = parseNginxRedirects(content);
    expect(countRedirectChains(rules)).toBe(0);
  });

  it("counts chain links from the sample nginx fixture", () => {
    const fixturePath = path.join(testDir, "sample-nginx-redirects.conf");
    const content = readFileSync(fixturePath, "utf8");
    const { rules } = parseNginxRedirects(content);

    expect(countRedirectChains(rules)).toBe(4);
  });
});
