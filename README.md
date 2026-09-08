# ratecheck

You have a rate limit you want to apply (say, 10 requests per second per API
key) and a log of requests that already happened. Before you turn the limit
on in production, you want to know: how many of those past requests would
have been rejected? Which keys would have felt it the most? ratecheck
answers that by replaying the log through a token bucket, offline, using the
timestamps that are already in the log instead of the wall clock.

It does one thing: read timestamped events, run them through a token bucket,
print ALLOW or DENY for each one.

## Build

```
npm install
npm run build
```

This only pulls in the TypeScript compiler as a dev dependency; the tool
itself has no runtime dependencies.

## Usage

```
node dist/main.js --rate <n> [--per <duration>] [--burst <n>] [file...]
```

- `--rate` — tokens added per interval (required)
- `--per` — interval length: `500ms`, `1s`, `1m`, `1h` (default `1s`)
- `--burst` — bucket capacity, i.e. how much burst above the steady rate is
  allowed (default: same as `--rate`)

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
