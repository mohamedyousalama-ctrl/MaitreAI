# Migration directory governance

This directory is a historical record of governed database migrations. It is
not an executable queue.

- The repository has no automatic migration runner.
- Merging a migration file does not execute it.
- A migration with a sibling `.APPLIED.md` file is already applied.
- Never run this entire directory or use a broad database push or replay.
- Before applying any migration, follow
  [`docs/KIVO_AGENT_ROADMAP.md`](../../docs/KIVO_AGENT_ROADMAP.md) and its
  governed migration ceremony.
- Migration 0104 is already applied. Its SQL file is byte-frozen to SHA-256
  `560e060351c793990daa8f61bbdad95e998d508977e1610478881d7582c38b80` and
  must not be run again.
- Never edit an applied SQL file without a signed re-baseline that records the
  old hash, new hash and reason.

Treat every migration as a separately approved application event. Repository
history documents what was approved; it does not grant permission to execute
database changes.
