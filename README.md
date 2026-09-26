# ratecheck

You have a rate limit you want to apply (say, 10 requests per second per API
key) and a log of requests that already happened. Before you turn the limit
on in production, you want to know: how many of those past requests would
have been rejected? Which keys would have felt it the most? ratecheck
answers that by replaying the log through a token bucket, offline, using the
timestamps that are already in the log instead of the wall clock.

It does one thing: read timestamped events, run them through a rate
limiter, print ALLOW or DENY for each one.

## Build

```
npm install
npm run build
```

This only pulls in the TypeScript compiler as a dev dependency; the tool
itself has no runtime dependencies.

## Test

```
npm test
```

Runs the three limiter implementations through their edge cases (refill
capping, out-of-order timestamps, window boundaries) with Node's built-in
test runner. No test framework dependency needed.

## Usage

```
node dist/main.js --rate <n> [--per <duration>] [--burst <n>] [--algorithm <name>] [file...]
```

- `--rate` — requests allowed per interval (required)
- `--per` — interval length: `500ms`, `1s`, `1m`, `1h` (default `1s`)
- `--burst` — bucket capacity, i.e. how much burst above the steady rate is
  allowed (default: same as `--rate`); only applies to `token-bucket`
- `--algorithm` — which limiter to simulate: `token-bucket` (default),
  `sliding-window`, or `fixed-window`
- `--format` — `text` (default) or `json`, one result object per line on
  stdout

### Algorithms

- `token-bucket` — tokens refill continuously at `--rate` per `--per`, up to
  `--burst`. Smooths traffic and allows short bursts to spend saved-up
  tokens.
- `sliding-window` — counts exact hits in the trailing `--per` window
  against `--rate`. No boundary effects, but remembers one timestamp per
  hit currently in the window.
- `fixed-window` — counts hits in `--per`-wide windows aligned to the
  epoch against `--rate`. Cheapest to reason about, but a client can send
  up to `2 * --rate` requests by timing a burst across a window boundary.

Reads from the files given on the command line, or from stdin if none are
given, so it fits into a pipeline:

```
cat access.log | node dist/main.js --rate 5 --per 1s
```

or against a file directly:

```
node dist/main.js --rate 100 --per 1m --burst 150 requests.txt
```

### Input format

One event per line, either:

```
<timestamp>
<key>,<timestamp>
```

`<timestamp>` is an epoch millisecond integer or an ISO-8601 string. If a
key is given, each key gets its own independent bucket, which is how you'd
model a per-user or per-API-key limit. Lines for a given key must be in
non-decreasing timestamp order (this only matters within a key — you don't
need to globally sort a file that interleaves several keys).

Example input:

```
user-a,2026-01-01T00:00:00.000Z
user-b,2026-01-01T00:00:00.050Z
user-a,2026-01-01T00:00:00.100Z
user-a,2026-01-01T00:00:00.150Z
```

```
node dist/main.js --rate 5 --per 1s example.txt
```

```
2026-01-01T00:00:00.000Z user-a ALLOW
2026-01-01T00:00:00.050Z user-b ALLOW
2026-01-01T00:00:00.100Z user-a ALLOW
2026-01-01T00:00:00.150Z user-a ALLOW

4/4 allowed across 2 key(s)
```

Lines that fail to parse are skipped with a warning on stderr rather than
aborting the whole run.

### JSON output

With `--format json`, each line on stdout is a single JSON object instead
of the text line, which makes it easy to pipe into `jq` or feed into
another tool:

```
node dist/main.js --rate 5 --per 1s --format json example.txt
```

```
{"timestamp":"2026-01-01T00:00:00.000Z","key":"user-a","allowed":true,"retryAfterMs":0}
{"timestamp":"2026-01-01T00:00:00.050Z","key":"user-b","allowed":true,"retryAfterMs":0}
```

The trailing summary is also emitted as a single JSON object (on stderr,
same as the text summary) instead of the `N/M allowed across ...` line.
