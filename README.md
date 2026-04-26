# slugshift-cli

Convert nginx `rewrite` redirect rules to JSON or CSV. Parsing semantics match [Slugshift](https://slugshift.com) nginx import (`rewrite` with `permanent` / `redirect` only).

## Install

```bash
npm install -g slugshift-cli
```

## Usage

```text
slugshift <config-path|-> <json|csv> [options]
```

- **`-`** — read config from stdin.
- **`--faithful`** — rows shaped for Slugshift-style import: `matchType`, `sourcePattern`, `destinationTemplate`, `statusCode`, `clientShouldForwardQueryString`, `sortOrder`.
- **`--importable-only`** — only static rules (no numbered captures like `$1` in the destination).
- **`--summary`** — print counts to stderr (stdout stays data-only for pipes).
- **`--strict`** — exit code `1` if any malformed `rewrite` lines are reported.
- **`-o, --output <file>`** — write output to a file instead of stdout.

## Examples

```bash
slugshift ./redirects.conf json
slugshift ./legacy.conf csv --faithful --importable-only -o out.csv
cat nginx.conf | slugshift - json --summary
slugshift ./redirects.conf json --strict
```

## Develop

```bash
yarn install
yarn test
yarn build
node dist/cli.js ./test/sample-nginx-redirects.conf json --summary
```

When the parser in the main Slugshift app changes, update `src/parse/nginx.ts` here to stay aligned.

## License

MIT
