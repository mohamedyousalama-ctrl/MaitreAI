# KIVO V1 — GITHUB AUTOMATION RELAY PROTOCOL

**Status:** BOOTSTRAP CANDIDATE / TRANSPORT ONLY  
**Scope:** Kivo V1 only — repository `mohamedyousalama-ctrl/MaitreAI`

This document defines the temporary GitHub-based PM transport used while ChatGPT cannot
access the governed Kivo V1 Linear workspace. It creates no engineering, governance,
production, deployment, KIV-25, Stage-C, or Alpha authority by itself.

---

## 0 — Truth and fallback model

- **Historical accepted Linear records remain authoritative historical control-plane truth.**
- **Git/GitHub commits remain source/artifact byte truth.**
- While Kivo V1 Linear is unavailable to the PM automation, **GitHub issue #577 is the
  governed task/handback transport queue** and **issue #578 is the founder-facing KPI/status
  mirror** for new automation-bootstrap activity.
- New GitHub PM records created during this fallback are not permission to rewrite older
  Linear history. If Linear becomes available later, accepted terminal GitHub truth must be
  reconciled back explicitly and append-only.
- **Linear is not a prerequisite for proving or operating the GitHub transport.** These
  bootstrap workflows contain no Linear secret, no Linear MCP configuration, and authorize
  zero Linear operations.

---

## 1 — Hard boundaries

| Boundary | Rule |
|---|---|
| GitHub issue #577 | Kivo V1 task/handback relay only |
| GitHub issue #578 | Kivo V1 founder KPI/status mirror only |
| GitHub issue #576 | **Kivo Delivery Network / LOG-01 only; never Kivo V1** |
| `linear.app/getkivo` | Out of bounds |
| Kivo Delivery Network | Out of bounds |
| Khalid project | Out of bounds |
| Production / Supabase / SQL / deploy | No authority from this relay |
| Meta/WhatsApp / restaurant actions | No authority from this relay |
| KIV-25 / Stage C / Alpha GO | Permanently blocked unless separately released by governed PM authority |

---

## 2 — Transport architecture

The transport uses two separate GitHub Actions workflows after a governed merge to the
repository default branch:

1. **`kivo-v1-relay.yml` — trusted PM ingress router**
   - event: `issue_comment.created`;
   - exact issue: `#577`;
   - exact repository owner/actor: `mohamedyousalama-ctrl`;
   - exact `kivo-v1-relay` label required;
   - exact task prefix/provider/status required;
   - contains **no Anthropic or Linear secret-bearing step**;
   - claims the immutable task id, then emits one `repository_dispatch` event.

2. **`kivo-v1-relay-dispatch.yml` — isolated role worker**
   - event: `repository_dispatch` type `kivo-v1-relay`;
   - re-fetches the source comment by numeric comment id and verifies that it is on #577,
     authored by `mohamedyousalama-ctrl`, and byte-equal to the dispatched task body;
   - refuses a task id with an existing terminal handback;
   - runs exactly one role in a fresh GitHub runner / fresh Claude session;
   - applies role-specific GitHub permissions and role-specific Claude `--allowedTools`.

The router writes a `ROUTER-CLAIM` before dispatch. A claimed id is not dispatched again.
If dispatch fails after claim, the task fails closed; recovery requires PM intake and a new
immutable task id rather than silently replaying the claimed id.

---

## 3 — Task identity and exact format

Every Claude-GitHub task must begin exactly:

```text
PM-TASK KIVO-V1-RELAY-<NNNN> — ROLE <ROLE> — PROVIDER CLAUDE-GITHUB-ACTION — STATUS RELEASED
repository: mohamedyousalama-ctrl/MaitreAI
ref: <exact-existing-ref>
sha: <exact-40-character-source-sha>
terminal-wording: <exact permitted terminal wording>
```

Rules:

- task ids are immutable and single-use;
- a terminal `CLAUDE-HANDBACK` or `CHATGPT-HANDBACK` consumes the id;
- a `ROUTER-CLAIM` prevents duplicate dispatch of the same id;
- rework always uses a new task id;
- `repository`, `ref`, and `sha` are mandatory source-custody pins;
- the task must include explicit allowed and forbidden actions;
- transport text can narrow authority but can never widen the permanent prohibitions in
  this protocol.

---

## 4 — Roles and least privilege

| Role | GitHub job permissions | Claude tools | Source mutation |
|---|---|---|---|
| `BUILDER` | contents write; issues write; PR write; actions read; OIDC | Read/Glob/Grep/Edit/Write plus narrowly scoped git/test/`gh issue` Bash commands | Only inside task scope; never self-approve |
| `INDEPENDENT-REVIEWER` | contents read; issues write; PR read; actions read; OIDC | Read/Glob/Grep plus read-only git and `gh issue view/comment` | **Forbidden** |
| `QUALITY-REVIEWER` | same as independent reviewer | same read-only tool set | **Forbidden** |
| `AUDITOR` | same as independent reviewer | same read-only tool set | **Forbidden** |
| `PM-SCRIBE` | contents read; issues write; OIDC | Read/Glob/Grep plus `gh issue view/comment` | **Forbidden** |

`PM-SCRIBE` has no Linear access in this bootstrap. It may only execute an exact
PM-prescribed GitHub mirror/status transaction and may not invent engineering or governance
findings.

Builder and every independent review role for the same subject must use different task ids
and different workflow runs. No worker may PM-accept its own result or create downstream
authority.

---

## 5 — Trusted actor and bot-loop controls

The public repository must never allow arbitrary commenters to reach a secret-bearing
Claude step.

The ingress router therefore requires all of the following **before dispatch**:

- repository is exactly `mohamedyousalama-ctrl/MaitreAI`;
- issue number is exactly `577`;
- event actor is exactly `mohamedyousalama-ctrl`;
- comment author is exactly `mohamedyousalama-ctrl`;
- issue carries `kivo-v1-relay`;
- first line is an exact governed Kivo V1 task header;
- provider is exactly `CLAUDE-GITHUB-ACTION`;
- status is exactly `RELEASED`.

Router/worker comments cannot retrigger the router because they are not owner-authored PM
task headers. The worker re-verifies the original owner-authored comment from GitHub before
model authentication is used.

---

## 6 — Authentication and secrets

The installed **Claude GitHub App** and **Anthropic model authentication** are separate
concerns.

- The Claude GitHub App is installed; that fact does not prove a model credential exists.
- This candidate uses repository secret `ANTHROPIC_API_KEY` only by name. No secret value is
  read into task text, committed, printed, or relayed.
- The worker checks only the boolean presence of that secret before the Claude step and
  fails closed with a founder-visible `WORKER-BLOCKED` marker when it is absent.
- Anthropic also documents `CLAUDE_CODE_OAUTH_TOKEN` and workload identity federation as
  alternatives. Adopting either is a separate configuration change; do not configure two
  auth mechanisms implicitly in one task.
- `id-token: write` is granted only to worker jobs that invoke the Claude action.
- Review roles do not receive repository source-write permission even though the installed
  GitHub App itself has broader installation permissions.

No Linear credential is consumed by these workflows.

---

## 7 — Progress visibility

Founder-visible progress is recorded directly on issue #577:

1. `ROUTER-CLAIM <task-id> ... DISPATCH PENDING`
2. `ROUTER-DISPATCHED <task-id> ...`
3. `WORKER-STARTED <task-id> ... RUN <run-id> ...`
4. terminal `CLAUDE-HANDBACK ...` or a fail-closed `WORKER-BLOCKED ...`

Issue #578 is the compact KPI mirror maintained by the PM layer.

Anthropic's current `track_progress` input is **not enabled on the `repository_dispatch`
worker**. Official action documentation says `track_progress` is limited to specific
`pull_request` and `issues` actions and errors on unsupported events. Using it on
`repository_dispatch` would make the transport less reliable, not more observable. The
explicit router/worker markers above provide progress visibility without invoking an
unsupported mode.

---

## 8 — Terminal handback contract

Every worker ends with exactly one terminal handback on #577 beginning:

```text
CLAUDE-HANDBACK KIVO-V1-RELAY-<NNNN> — ROLE <ROLE> — STATUS <exact task-defined wording>
```

The handback records exact counts:

```text
source changes:      N        Linear reads:   0     Linear writes:  0
SQL executed:        0        Supabase:       0     deployments:    0
Meta/WhatsApp:       0        restaurant:     0     KIV-25:         0
Stage C:             0        Alpha GO:       0     getkivo/Khalid: 0
```

Plus exact repo/ref/SHA before and after and relevant evidence. If the required success
wording cannot truthfully be returned, the worker must use the task's exact failure wording.
After the handback, stop at `PM_INTAKE_REQUIRED`.

---

## 9 — Current official Anthropic references used for this candidate

Verified during the 24 Aug 2026 correction:

- Claude Code GitHub Actions documentation:  
  `https://code.claude.com/docs/en/github-actions`
  - GitHub workflow + model authentication are both required for `@claude` operation;
  - automation mode uses a `prompt` input;
  - triggering actors are access/human checked;
  - `--allowedTools` is the supported CLI mechanism for tool restriction;
  - credentials belong in GitHub Secrets; least-privilege workflow permissions are
    recommended.

- Anthropic Claude Code Action custom automations:  
  `https://github.com/anthropics/claude-code-action/blob/main/docs/custom-automations.md`
  - lists `repository_dispatch` as supported;
  - lists `workflow_dispatch` as coming soon in that event-support matrix.

- Anthropic Claude Code Action usage/configuration reference:  
  `https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md`
  - documents `track_progress`, `allowed_bots`, `allowed_non_write_users`, authentication
    inputs, and the migration from deprecated `allowed_tools` to
    `claude_args --allowedTools`.

Where these sources differ in general wording, this candidate chooses the explicitly listed
supported dispatch path (`repository_dispatch`) and the narrower documented security
behavior rather than assuming a broader event is safe.

---

## 10 — Permanent bootstrap prohibitions

Until a separate PM release after independent review and a harmless handshake proof:

- do not merge this candidate to `main`;
- do not perform production/Supabase/SQL actions;
- do not deploy or mutate Vercel;
- do not mutate Meta/WhatsApp or restaurant state;
- do not release or execute KIV-25;
- do not adopt Stage C;
- do not authorize Alpha GO;
- do not touch issue #576, `linear.app/getkivo`, Kivo Delivery Network, or Khalid;
- never put credentials, cookies, magic links, signed URLs, or raw secrets in comments,
  commits, prompts, or logs.
