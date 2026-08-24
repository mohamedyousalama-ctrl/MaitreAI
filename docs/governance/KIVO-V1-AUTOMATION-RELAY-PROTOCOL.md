# KIVO V1 — PM↔CLAUDE AUTOMATION RELAY PROTOCOL

**Status:** BOOTSTRAP / TRANSPORT ONLY
**Scope:** Kivo V1 only — Linear workspace `linear.app/kivo-v1`, repository `mohamedyousalama-ctrl/MaitreAI`

This document defines the governed transport layer between the Kivo V1 PM and Claude
executions. It is **transport only**. It creates no engineering, governance, production or
release authority of any kind.

---

## 0 — Truth precedence (unchanged)

- **Linear** remains the durable Kivo V1 operational control-plane truth.
- **Git/GitHub** remains source and artifact-byte truth.
- **This relay is a message bus.** A relay message is never authority. Authority exists only
  where Linear records it.

---

## 1 — Hard boundary against other programs

| Boundary | Rule |
|---|---|
| GitHub issue #576 | **Kivo Delivery Network / LOG-01 only.** Never carries Kivo V1 work. |
| `linear.app/getkivo` | Out of bounds for every Kivo V1 relay execution. Zero access. |
| Kivo Delivery Network | Out of bounds. |
| Khalid project | Out of bounds. |

The Kivo V1 relay is a **separate GitHub issue**, carrying the label `kivo-v1-relay`.
Workflow guards reject issue #576 explicitly and require the `kivo-v1-relay` label, so a
Kivo V1 execution cannot be started from the Kivo Delivery bus.

---

## 2 — Kivo V1 identity gate (mandatory, before any Linear access)

Every relay execution MUST, before reading or writing any Linear object, independently
resolve and verify:

- Workspace URL slug: `kivo-v1`
- Team UUID: `75e0a745-a87e-42f1-bdd1-aa6babebcf28`
- Project UUID: `681e82ed-847d-478c-a866-b8da369b70b7`
- Repository: `mohamedyousalama-ctrl/MaitreAI`

**On any mismatch, or if the identity cannot be resolved:** perform **zero Linear writes**
and terminate with exactly:

```
KIVO LINEAR IDENTITY MISMATCH — WRITE BLOCKED
```

Title-search fallback in another workspace is forbidden. Substituting a similarly named
object from another workspace is forbidden.

---

## 3 — Task identity

- Every PM task carries an **immutable, single-use** task id: `KIVO-V1-RELAY-<NNNN>`.
- A task id that has received a terminal handback is **consumed**. Rework requires a **new**
  task id. A consumed id must never be re-dispatched.
- Every task states exact `repository`, `ref`, and `sha`, plus explicit allowed and
  forbidden actions.

---

## 4 — Roles

Exactly one role per task:

| Role | May do | May never do |
|---|---|---|
| `PM-SCRIBE` | Execute the exact PM-prescribed Linear transaction, verbatim | Make engineering or governance decisions; invent verdicts; author findings |
| `BUILDER` | Design/build within the task's stated scope | Accept its own work; review itself; create downstream authority |
| `INDEPENDENT-REVIEWER` | Adversarially review a Builder package | Have authored the work under review |
| `QUALITY-REVIEWER` | Quality gate on exact bytes | Author the work under review |
| `AUDITOR` | Terminal audit on exact bytes | Author or review-of-record the work under audit |

**Separation of executions.** `BUILDER` and `INDEPENDENT-REVIEWER` for the same subject
MUST run as **separate Claude executions in separate jobs**. The relay enforces this
structurally: each dispatch is its own workflow run on a fresh runner with a fresh Claude
session and no shared context.

**No self-derived authority.** A Claude worker may not create downstream issues, release
work, grant itself scope, or escalate its own role.

---

## 5 — Permanent action prohibitions (every role, every task)

No relay execution may, without a separate explicit governed release:

- advance or execute `KIV-25`;
- take any production or Supabase action, or execute SQL;
- deploy, or mutate Vercel;
- change Meta/WhatsApp account or configuration;
- perform any restaurant action;
- adopt Stage C;
- authorize Alpha GO;
- modify product/runtime source during a transport/bootstrap task.

---

## 6 — Terminal handback contract

Every execution ends with a handback that records **exact counts**:

```
source changes:      N        Linear reads:   N     Linear writes:  N
SQL executed:        N        Supabase:       N     deployments:    N
Meta/WhatsApp:       N        restaurant:     N     KIV-25:         N
Stage C:             N        Alpha GO:       N     getkivo/Khalid: N
```

Plus: exact repo/ref/SHA before and after, and the task id being consumed.

The terminal verdict MUST use the **exact task-defined wording**
(`PASS` / `BLOCK` / `READY` / `HOLD` as the task specifies). No paraphrase, no invented
verdict string. If the task's required wording cannot be truthfully returned, return the
task's failure wording — never a substitute.

After a valid terminal handback the lifecycle stops at `PM_INTAKE_REQUIRED`. The worker does
not PM-accept its own result.

---

## 7 — Message formats

PM task comment on the Kivo V1 relay issue:

```
PM-TASK KIVO-V1-RELAY-<NNNN> — ROLE <ROLE> — STATUS RELEASED
repository: mohamedyousalama-ctrl/MaitreAI
ref: <ref>
sha: <exact-sha>
allowed: <explicit list>
forbidden: <explicit list>
terminal-wording: <exact PASS/BLOCK/READY/HOLD strings>
<task body>
```

Claude handback comment:

```
CLAUDE-HANDBACK KIVO-V1-RELAY-<NNNN> — ROLE <ROLE> — STATUS <exact terminal wording>
```

---

## 8 — Secrets

Never post API keys, OAuth tokens, service-role values, cookies, magic links, signed URLs
or any credential into a relay message, a handback, a commit, or a log.
