#!/usr/bin/env node
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import process from 'node:process'
import { TokenBucket } from './tokenBucket.js'

interface Options {
  rate: number
  perMs: number
  burst: number
  files: string[]
}

const DURATION_MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
}

function parseDuration(raw: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(raw.trim())
  if (!match) {
    throw new Error(`invalid duration "${raw}", expected e.g. 500ms, 1s, 1m, 1h`)
  }
  const value = Number(match[1])
  const unit = match[2] ?? 'ms'
  return value * DURATION_MULTIPLIERS[unit]
}

function printUsage(): void {
  console.log(`usage: ratecheck --rate <n> [--per <duration>] [--burst <n>] [file...]

Replays a log of request timestamps through a token bucket rate limiter
and reports which requests would have been allowed or denied.

  --rate <n>        tokens added per interval (required)
  --per <duration>  interval length, e.g. 500ms, 1s, 1m, 1h (default: 1s)
  --burst <n>       bucket capacity (default: same as --rate)

Reads from the given files, or from stdin if none are given.

Input format, one event per line:
  <timestamp>
  <key>,<timestamp>

<timestamp> is either an epoch millisecond integer or an ISO-8601 string.
Lines are grouped into separate buckets by <key> (default key: "default")
and must arrive in non-decreasing timestamp order within each key.`)
}

function parseArgs(argv: string[]): Options {
  let rate: number | null = null
  let perMs = 1000
  let burst: number | null = null
  const files: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--rate':
        rate = Number(argv[++i])
        break
      case '--per':
        perMs = parseDuration(argv[++i])
        break
      case '--burst':
        burst = Number(argv[++i])
        break
      case '-h':
      case '--help':
        printUsage()
        process.exit(0)
        break // eslint-disable-line no-unreachable
      default:
        if (arg.startsWith('--')) {
          throw new Error(`unknown flag ${arg}`)
        }
        files.push(arg)
    }
  }

  if (rate === null || Number.isNaN(rate) || rate <= 0) {
    throw new Error('--rate is required and must be a positive number')
  }
  if (!(perMs > 0)) {
    throw new Error('--per must resolve to a positive duration')
  }

  return { rate, perMs, burst: burst ?? rate, files }
}

interface ParsedLine {
  key: string
  atMs: number
}

function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim()
  if (trimmed.length === 0) return null

  const commaIndex = trimmed.indexOf(',')
  const key = commaIndex === -1 ? 'default' : trimmed.slice(0, commaIndex)
  const timestampRaw = commaIndex === -1 ? trimmed : trimmed.slice(commaIndex + 1)

  const atMs = /^\d+$/.test(timestampRaw) ? Number(timestampRaw) : Date.parse(timestampRaw)
  if (Number.isNaN(atMs)) return null

  return { key, atMs }
}

async function* readLines(files: string[]): AsyncGenerator<string> {
  const sources = files.length > 0 ? files : ['-']
  for (const source of sources) {
    const stream = source === '-' ? process.stdin : createReadStream(source)
    const rl = createInterface({ input: stream, crlfDelay: Infinity })
    for await (const line of rl) {
      yield line
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const refillRatePerMs = options.rate / options.perMs
  const buckets = new Map<string, TokenBucket>()

  let total = 0
  let allowed = 0
  let lineNumber = 0

  for await (const rawLine of readLines(options.files)) {
    lineNumber++
    const parsed = parseLine(rawLine)
    if (!parsed) {
      if (rawLine.trim().length > 0) {
        console.error(`line ${lineNumber}: could not parse timestamp, skipping: ${rawLine}`)
      }
      continue
    }

    let bucket = buckets.get(parsed.key)
    if (!bucket) {
      bucket = new TokenBucket({ capacity: options.burst, refillRatePerMs })
      buckets.set(parsed.key, bucket)
    }

    try {
      const result = bucket.check(parsed.atMs)
      total++
      if (result.allowed) allowed++
      const status = result.allowed ? 'ALLOW' : `DENY retry_after=${result.retryAfterMs}ms`
      console.log(`${new Date(parsed.atMs).toISOString()} ${parsed.key} ${status}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`line ${lineNumber}: ${message}, skipping`)
    }
  }

  console.error(`\n${allowed}/${total} allowed across ${buckets.size} key(s)`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
