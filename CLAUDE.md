# CLAUDE.md

**Primary orientation lives in [`AGENTS.md`](./AGENTS.md) — read it first.** It is
the cross-tool contract (Claude Code, Codex, Cursor, …). This file points there so
Claude Code finds it; the two are kept in sync.

The guardrails you must not miss (full detail in `AGENTS.md`):

1. **Money/facts come from tools/DB, never the model** — all prices/totals are
   computed in `lib/ai/tools.ts`; the LLM never authors a number.
2. **Keep the Egyptian T1 safety eval green** before merging anything touching
   prices/money/menu/agent behavior. Run `node scripts/eval-scenarios.mjs`; restore
   the pilot `dialect` to `egyptian` afterward.
3. **Never push to `main`** (production = maitre.chat). Branch → draft PR.
4. **Secrets in env/Vercel only** — never in code, docs, or commits.
5. **Confirm-before-write** for agent actions that change tenant data; manager-only
   writes are server-enforced.

Run/build/test, architecture, the file map, and current state: see `AGENTS.md`,
`docs/ARCHITECTURE.md`, and `docs/CONVENTIONS.md`.
