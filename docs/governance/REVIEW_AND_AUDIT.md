# Review and audit — the standing gate

Every change to this repository passes two independent checks before it is called
done. They ask **different questions**, and that separation is the whole point: a
single reviewer who likes the code tends to also believe its commit message.

| Role | Question | Verdict is about |
|---|---|---|
| **Reviewer** | Does the code do what it claims? | Correctness — bugs, regressions, broken contracts |
| **Auditor** | Are the claims true and the evidence real? | Integrity — numbers, test runs, weakened assertions |

Neither role may edit code. Both report.

---

## Why two roles and not one

On 26 Aug 2026 a fix for the console claim path was written, typechecked clean,
passed its test suite, and was **wrong in three ways at once**:

1. It silently let one operator take a colleague's conversation — the database
   predicate that prevented it had been dropped, and the wrapper did not restore it.
2. It swallowed a failed tenant read on the **safety** escalation path and reported
   "not escalated" instead of throwing.
3. **It could not work at all.** The functions it called grant `EXECUTE` to
   `authenticated` only, and the routes passed a service-role client. It traded
   "function not found" for "permission denied".

The test suite was green over all three, because the same change had rewritten the
fake database the tests run against. A reviewer looking only at correctness might
have caught 1 and 2. Only an auditor comparing the *test* before and after catches
the third thing that happened: the evidence moved with the claim.

That change was reverted. This gate exists so the next one is caught before it lands.

---

## Reviewer remit

Assume defects exist and try to find them. Specifically:

- **Verify against ground truth, never against a comment.** For anything touching
  the database, read the live function body / column / grant. Commit messages and
  code comments are claims, not evidence.
- **Argument names matter as much as types.** Supabase RPC passes a named object;
  a wrong argument name compiles cleanly and fails at runtime.
- **Check the grant, not just the signature.** A correct call by a role without
  `EXECUTE` is still a 42501.
- Every finding needs `file:line` and a concrete failure scenario — what input,
  what happens, what the user sees.
- Say plainly when a section is clean, and list what was checked. Vague
  reassurance is not a review result.

## Auditor remit

Treat every commit message as an assertion to be checked.

- **Re-run every numeric claim** and report the verbatim command and exit code.
  Never accept a number because it appears in a commit message.
- **Never run `npm run test:unit` to count failures.** It is an `&&` chain that
  stops at the first failure and will under-report. Extract each command from the
  script and run them individually — several need
  `--import ./scripts/ts-ext-loader.mjs`, several need `--conditions=react-server`,
  and running bare `node` against them produces false failures.
- **"Pre-existing failure" is a claim, not a category.** Verify it fails at the
  base commit too, in a `git worktree`. A regression mislabelled as pre-existing is
  the most damaging thing that can pass this gate.
- **Diff the assertions, not just the count.** A suite can gain tests and lose
  coverage. Look for: assertions removed, strict checks relaxed, conditions
  deleted, tests made vacuous or conditional, fakes rewritten to match new
  behaviour rather than to model real behaviour.
- A clean audit is a real result. Say so explicitly.

---

## The testing rule

**Every change ships with a test that would fail without it.**

- Prefer a **pure** function, tested without a database or a browser — the pattern
  already used by `lib/conversation-control/model.ts` and
  `components/console-v2/shift/shift-model.ts`. Extract the decision, test the
  decision.
- **A new test file is not covered until it is in `test:unit`.** That script is a
  hand-maintained list of explicit paths, not a glob. A `*.test.ts` file that is
  not listed there runs nowhere. `components/console-v2/shift/shift-model.test.ts`
  sat outside it with 38 assertions that had never once run in CI.
- When a fix restores behaviour the database no longer enforces, **pin both sides**:
  one test that the database alone permits the bad case, one that the application
  refuses it. If someone later restores the database predicate, the first test
  fails and says so. See `C8`/`C9`/`C10` in `scripts/proof-control.test.ts`.
- Never skip, disable or quarantine a test to reach green.

## What CI enforces today

`.github/workflows/core-gate.yml` runs on every pull request with no path filter:

| Check | Blocking |
|---|---|
| `tsc --noEmit` | yes |
| `npm run lint` | yes |
| `npm run test:unit` | **not yet** — 7 of 113 files fail on drifted structural assertions, named in that workflow's header |

Fix those seven and delete one `continue-on-error` line to close the gate.
Until then the suite still runs and its failures are visible on every run.
