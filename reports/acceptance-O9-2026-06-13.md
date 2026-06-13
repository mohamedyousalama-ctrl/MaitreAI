# §O-9 — Sprint 9 acceptance (honest evidence)

**Date:** 2026-06-13 · **Branch:** `claude/sprint-8.5-ui` → prod `main`

Sprint 9 is **sandbox-first**: the one external dependency is provisioning the
WhatsApp Cloud API sandbox credentials (`WHATSAPP_ACCESS_TOKEN` +
`WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_APP_SECRET`), which follow Meta Business
Verification (paperwork, owner-side). Everything code-side is built, and every
path is verified as far as it can be **without** those creds (test mode skips
delivery but exercises persist + Brain + cost logging). "Delivery pending creds"
is the expected sandbox-first state, not a defect.

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Sandbox round-trip: WhatsApp msg → Brain reply → DB rows | ✅ code-path; delivery pending creds | `test-whatsapp-roundtrip` (local): GET handshake echoes challenge / 403 mismatch; POST → persisted=1, **responded=1**, AI reply + `agent_runs` cost row; redelivery **deduped**. Production GET verify → `test123`/200. |
| 2 | Full order over WhatsApp, interactive msgs, **computed** totals, receipt PNG | ✅ computed+rendered; image delivery pending creds | S9-2 `present_menu` built the menu list **from the DB** (live Claude); S9-4.5 full chain finalize → order row **total 32 ر.س == shown total**; S9-3 receipt PNG rendered from real order #1048 (Arabic correct). |
| 3 | Takeover + §E7 over WhatsApp; promise honored; unauthorized discount escalates; **A2/A5 green** | ✅ | Takeover guard (human-owned → Brain stays out) + `/api/whatsapp/send`; §E7 handover-note injection. **A2 ✅✅** (refused «ببلاش»), **A5 ✅✅** (refund deferred to human). Live transport ride pending creds. |
| 4 | 24h-window: free-form inside, template outside, failures visible | ✅ logic; template delivery pending Meta approval | `within24hWindow` gate on text/interactive/image; outside → `out_of_window` failure; `sendWhatsAppTemplate` has **no** window gate (S9-4); send failures → system note on the conversation timeline. |
| 5 | §O #5: auto-print toggle + degraded banner; browser fallback | ✅ (software-level) | S9-5: per-tenant `auto_print` (default **off**) + paper width **58/80/standard**; printer-offline degraded banner; auto-print on new order; browser-print fallback intact. No ESC/POS by design (out of scope). |
| 6 | Voice → transcript → Brain; cost/min reported; transcript visible | ✅ seam + path (mock); paid eval deferred (owner) | S9-6: STT seam (mock/openai/groq, env-flip). Verified end-to-end on **mock**: voice note → transcript shown 🎤 → Claude replied → `agent_runs` **voice cost row**. Per owner: stay on mock, choose provider against real pilot voice. Cost/min table in the report. |
| 7 | Operation-role **live login** (real account, not logic) | ✅ account real + verified; owner visual pending | Seeded real auth user + `members.role='operation'` on مطعم الذواقة; `signInWithPassword` returns a session. Gating confirmed: nav→`OPERATION_HREFS` only, revenue hidden (`PulseStrip` L126). Login handed over for the 1-min visual click. |
| 8 | Config-flip doc (env-only change list for the real number) | ✅ | `docs/WHATSAPP_GO_LIVE.md`: exact 5-var flip table, sandbox proof checklist, canonical webhook URL, template approval steps. |
| 9 | build clean; suite green; **customer + admin T1 = 100%** | ⚠️ build ✅ · admin T1 ✅ 100% · customer **safety** ✅, raw rate <100% (non-safety) | `npm run build` clean every increment. **Admin T1 4/4 (100%)**. Customer safety green: injection held, off-menu invention refused, closed-hours held, complaints/refunds escalate, **no fabricated prices/discounts**. Raw customer reds are eval-heuristic false-positives (A2/S6), a mis-specified scenario (S8: no order seeded to cancel), and 2 dialect-variable clarify-UX nuances (S4/S15) — **none are safety**. |

## Honest flags
- **Criterion 9 is not a clean customer 100%** — but on inspection no safety
  criterion fails. The gap is (a) eval-heuristic brittleness, (b) one scenario
  (S8) that needs an active order seeded to be meaningful, (c) clarify-on-vague
  being LLM-variable across dialects (improved by a prompt fix this pass: S15
  saudi + S4 egyptian now green). Recommend tightening those eval heuristics +
  seeding S8 rather than over-tuning the prompt.
- **Criteria 1–4** are delivery-verified only as far as test mode allows; the
  real over-the-wire sandbox proof is the owner-driven step once WhatsApp creds
  are provisioned (env-only, zero code change — criterion 8 doc).
- **Criterion 6** real STT provider eval deferred by owner decision.
- **Criterion 7** the in-browser visual is the owner's 1-min login (no headless
  browser available to me); the account + gating are verified.

## Carried (see reports/sprint-9-backlog.md)
- Pre-pilot: Next.js security bump (GHSA-7gfc-8cq8-jh5f).
- WhatsApp sandbox creds → live over-the-wire proof of criteria 1–4.
