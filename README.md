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

The `yarn build` script runs `tsc` and then `chmod +x dist/cli.js`. `tsc` does not set the execute bit on Unix and macOS, so without it you can get “Permission denied” when the file is invoked as an executable—for example `./dist/cli.js` or the `slugshift` symlink from the package `bin` (the compiled file starts with `#!/usr/bin/env node`). `node dist/cli.js …` works either way because Node reads the file without requiring the execute bit.

When the parser in the main Slugshift app changes, update `src/parse/nginx.ts` here to stay aligned.

## Use as a local package

The published binary points at `./dist/cli.js`. Build this repo once before linking or pointing another project at it.

```bash
cd /path/to/slugshift-cli
yarn install && yarn build
```

### Yarn / npm global link (use the `slugshift` CLI from your clone)

From the `slugshift-cli` root:

```bash
yarn link   # Yarn v1 classic; npm users: npm link
```

In any other directory where you want that linked CLI:

```bash
yarn link slugshift-cli   # npm users: npm link slugshift-cli
```

Run `slugshift` as usual. When you change code here, rebuild (`yarn build`) and the linked install picks up the new `dist/`.

To remove the link in the consuming project:

```bash
yarn unlink slugshift-cli && yarn install --force   # restores registry version if listed in package.json
```

In `slugshift-cli`, `yarn unlink` clears the global registration for this package ([Yarn classic `link`](https://classic.yarnpkg.com/en/docs/cli/link/)).

### `file:` dependency (depend on this package from another repo)

Add a filesystem dependency in the consuming app’s `package.json`:

```json
"slugshift-cli": "file:../slugshift-cli"
```

Use the correct relative path to your clone. Then run `yarn install` or `npm install` there. Yarn/npm copies or links the folder; reinstall or bump the dependency after you publish a new build from `slugshift-cli` (`yarn build`).

To depend on your clone without reinstalling after every change, `yarn link slugshift-cli` inside the consuming app (after `yarn link` in `slugshift-cli`) is usually simpler for day-to-day work.

## License

MIT
