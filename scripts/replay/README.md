# Replay Corpus Harness

`pnpm replay` runs the frozen JSONL corpus in dry-run mode. The harness exercises
the real order-tool executor, but it never calls WhatsApp senders and never calls
the DB order-create boundary. Those boundaries are represented as stubs in the
summary output.

Corpus files must be written through `scripts/replay/deidentify.ts`. The private
token mapping belongs under `scripts/replay/private/`, which is gitignored.

Synthetic seed generation:

```bash
node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/replay/deidentify.ts \
  --input scripts/replay/raw/synthetic-seed-v0.raw.jsonl \
  --out scripts/replay/corpus/seed-v0.jsonl \
  --map scripts/replay/private/synthetic-seed-v0.map.json
```

Credentialed Sweet Shop export, when service-role env is available:

```bash
node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/replay/export-sweet-shop.ts
```
