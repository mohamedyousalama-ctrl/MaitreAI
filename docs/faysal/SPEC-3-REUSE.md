# SPEC-3 — REUSE MAP
### Faysal / فيصل (Al Wattan Medical Group) against the Kivo/Khalid codebase

> **Status:** specification only. No application code exists for Faysal yet and none is
> proposed here. **Owner:** Agent 3 (Reuse Map). **Base:** `/home/user/MaitreAI`,
> branch `claude/pm-replacement-test-y8xq96`. **Date of survey:** 2026-09-09.
>
> **Architecture premise (settled elsewhere, not relitigated here):** Faysal lives in this
> repo behind a hard seam — routes under `app/faysal/*` and `app/api/faysal/*`, domain under
> `lib/health/*`, its own tables, and **zero imports** from `lib/order*`, `lib/*menu*`, or
> anything restaurant-specific. This document decides, file by file, what that seam is
> allowed to reach across.

---

## 0. Method, and what this document is worth

Every verdict below was assigned after opening the file. Where a file's NAME suggests one
thing and its CONTENT says another, the content won. Three examples, because they set the
standard for how the rest should be read:

- `lib/messaging/adapters/whatsapp.ts` (625 lines) sounds product-specific. It contains
  **zero** occurrences of `restaurant`, `menu`, `dish` or `order`. It is a pure Meta Cloud
  API parser/builder. → **SHARE**.
- `lib/ai/symptom-frames.ts` sounds like allergen machinery. It is 36 lines of *how Arabic
  reports a symptom* — first person and third person, «ابني عنده طفح» included — with zero
  domain coupling. It is the most medically valuable file in a restaurant codebase. → **SHARE**.
- `lib/messaging/outbound.ts` looks domain-neutral and nearly is — except for one line,
  `import type { Presentation } from "@/lib/ai/tools"`, which reaches into a 1,539-line
  restaurant tools module for a type that is really a WhatsApp interactive-message shape.
  → **SHARE, after one named mechanical change** (§7.2).

Counts of restaurant terms per file were taken mechanically
(`grep -ciE 'restaurant|menu|dish|order'`) and then **read**, because most hits in the
"neutral" files are prose in header comments, not code. Where the hit was prose only, the
verdict is SHARE and this document says so.

### The four verdicts

| verdict | meaning |
|---|---|
| **SHARE** | Import directly, unchanged, from both products. Genuinely domain-neutral. |
| **SHARE\*** | Domain-neutral *after one named, mechanical change to the Kivo file* — the change is listed, is behaviour-preserving, and must land before Faysal imports it. |
| **FORK** | Copy into `lib/health/*` and adapt. The **pattern** is right; the **content** is restaurant-specific. Each row names what must change. |
| **REBUILD** | Faysal needs the capability; Kivo's version does not fit at all. |
| **NEVER** | Restaurant-only. Importing it from Faysal must be *impossible*, not merely discouraged. |

`SHARE*` is a sub-case of SHARE, not a fifth verdict; it is called out separately because
each one is a small, cheap, pre-Faysal PR against Kivo, and skipping them is how a "seam"
becomes a set of exceptions.

---

## 1. THE HIGHEST-LEVERAGE CALL — the `restaurants` table

**Question:** the tenant table is called `restaurants`, and **58 files** under
`app/`, `lib/` and `components/` query it directly (`from("restaurants")`); **122 files**
reference the `restaurant_id` column; **65 of 119 migration files** touch it. Does Faysal reuse
it, extend it, or get its own?

### 1.0 What the table actually is

```
public.restaurants
  id uuid pk, name, logo_url, phone, email,
  currency default 'ر.س', country default 'SA', default_language 'ar',
  dialect 'saudi', timezone 'Asia/Riyadh', business_type text,      ← already generic
  ai_tone jsonb, brain_score int, active bool,
  is_open, closed_message, accept_preorders,
  agent_mode ('setup|test|live|paused'), tier, feature_flags jsonb,
  alert_routing jsonb, hours jsonb, ramadan_hours jsonb, ramadan_mode,
  wa_phone_number_id, wa_verify_token, wa_access_token_enc, wa_waba_id,
  wa_messaging_tier, wa_phone_quality, wa_capacity_source, …
  psp_provider, psp_*_enc, tax_mode, tax_rate, tax_registration_no,
  tester_allowlist, tester_allowlist_mode, printer_config, auto_print, …
```

Data-wise a clinic row is **perfectly valid today**: nothing in the schema forbids it, and
`business_type` is already a free-text discriminator that reaches the system prompt
(`lib/ai/customer-turn.ts:729`, `lib/db/brain.ts:66`). That is exactly what makes this
decision dangerous — the cheap option is the one that works on day one and fails on day 400.

Everything downstream hangs off it: `members`, `branches`, `customers`, `conversations`,
`messages`, `agent_runs`, `orders`, `conversation_signals`, `system_alerts`,
`template_sends`, `message_templates`, `order_number_counters`, and ~70 more tables all
carry `restaurant_id uuid not null references public.restaurants(id)`. RLS is enforced by
two `SECURITY DEFINER` functions, `public.is_member_of(uuid)` and
`public.is_manager_of(uuid)`, both of which read `members.restaurant_id`.

### 1.1 Option A — REUSE (a clinic is a row in `restaurants`)

**Migration consequence: zero.** No new tables, no new RLS functions. `members`,
`is_member_of()`, `requireTenant()`, per-tenant WhatsApp credentials (`wa_*` +
`lib/crypto/secrets.ts`), `conversations`/`messages`/`agent_runs`/`customers`, the tenant
cookie, host-pinning — all work unchanged on day one. This is genuinely the fastest path to
a working Faysal.

**And it is the option I recommend against**, for two reasons that are not stylistic:

1. **The seam is dead on arrival.** `lib/health/*` cannot avoid the string `restaurants` —
   every read and write goes through it. The enforcement proof in §2 would have to
   allow-list the one thing it exists to forbid, which makes it decorative.

2. **Verified cross-product blast radius.** Kivo has jobs that iterate *all* tenants with no
   product filter, because until now there was no other kind of tenant:

   - `lib/monitoring/sweep.ts` (§b, "per-tenant delivery silence") — `from("restaurants").select("id,name,is_open,agent_mode").eq("active", true)`,
     then for each tenant checks for a recent inbound message and fires a
     **`delivery_silence` alert to the Founder by WhatsApp and email** when it goes quiet.
     A clinic in `restaurants` becomes a 2 a.m. page about undelivered food.
   - `lib/db/restaurants.ts:174` `resolveWebhookRestaurantId()` — outside production, with
     no `WHATSAPP_RESTAURANT_ID` set, this falls back to *"the most recently created active
     restaurant"*. Seed a clinic and the next unmatched inbound WhatsApp message in
     dev/staging routes to it.
   - `order_number_counters.restaurant_id` FKs to `restaurants` **on delete cascade**;
     `next_order_number(p_restaurant_id)` will happily mint order numbers for a clinic.

   None of these is a bug today. All three become one the moment a non-restaurant row exists.

3. **Extraction stops being mechanical.** "Move the vertical to its own repo" turns into
   *rename a table referenced by 58 files and 65 migration files, then split its rows by
   `business_type`, then split every child table by a join through it.* That is a data
   migration under load, not a `git mv`.

### 1.2 Option B — EXTEND (add a `product` discriminator to `restaurants`)

**Migration consequence: one migration, then 58 audited call sites.**
`alter table public.restaurants add column product text not null default 'kivo'` is trivial.
The cost is that **every one of the 58 files that reads the table must gain
`.eq("product", 'kivo')` or `.eq("product", 'faysal')`, and every future one must remember.**

The three call sites in §1.1 are the ones that *must* be fixed; the other 55 must be
*checked*. And correctness then rests on a filter that nothing enforces: **RLS cannot help
here**, because RLS scopes by *membership*, not by product — a Faysal operator who is also
a Kivo member (plausible: the same founder, the same staging account) passes
`is_member_of()` for both.

This repo has already written down why that shape is unacceptable.
`scripts/proof-tenant-isolation-report.md` enumerates, route by route, *how the caller
tenant is determined* and *whether that determination is trustworthy* — precisely because
"every developer remembers to add the filter" is not a control. Option B recreates that
problem one layer up, and it is the layer with no RLS backstop.

Upside, stated fairly: one `members` table, one login, one `auth.users`, one set of WhatsApp
credential columns, one console shell. If the product decision were "Faysal is a second
vertical inside the same operator console, forever", Option B would be the right answer.
The brief says the opposite — extraction must stay mechanical.

### 1.3 Option C — OWN (Faysal gets `health_clinics` + `health_members`) ← **RECOMMENDED**

**Migration consequence: one new migration, zero changes to existing Kivo files.**

```
create table public.health_clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null, name_ar text not null,
  brand text not null,                       -- 'wattan' | 'shoaa'
  district text, phone text, unified_phone text,
  timezone text not null default 'Asia/Riyadh',
  country text not null default 'SA',
  dialect text not null default 'saudi',
  hours jsonb not null default '{}'::jsonb,  -- incl. the Friday compression
  cchi_code text,                            -- 18002 / 18003 / 17985 / 18004 …
  agent_mode text not null default 'setup',
  feature_flags jsonb not null default '{}'::jsonb,
  wa_phone_number_id text, wa_verify_token text, wa_access_token_enc text,
  active boolean not null default true, …
);
create table public.health_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  role text not null default 'manager' check (role in ('manager','operation')),
  unique (clinic_id, user_id)
);
create function public.is_member_of_clinic(uuid) …   -- mirrors is_member_of
create function public.is_manager_of_clinic(uuid) …  -- mirrors is_manager_of
```

Every Faysal table then carries `clinic_id`, never `restaurant_id`. **That column name is
itself an enforcement surface**: the seam proof in §2 can ban the literal strings
`restaurant_id` and `from("restaurants")` anywhere under `lib/health/*` or `app/faysal/*`,
which is a check an import-graph scan alone cannot make (Supabase table names are *strings*,
not imports — see §2.3).

**The honest cost — say it out loud:**

- Two `SECURITY DEFINER` functions and one membership table are **duplicated**. Duplication
  of a security primitive is a real risk and the reason people reach for Option B.
- Faysal needs its own `health_conversations` / `health_messages` / `health_agent_runs`,
  because the existing ones FK to `restaurants`. That is roughly four more tables.
- Two logins if a human operates both products (mitigable: same `auth.users`, two
  memberships, two consoles).

**Why the cost is worth paying:**

- The duplication is ~40 lines of SQL with a **fixed, enumerable** surface, and this repo
  already has the pattern for holding it in place: an adversarial RLS proof
  (`scripts/proof-brain-foundation-rls.test.ts`, `proof-agent-respond-tenant-isolation.test.ts`)
  that creates fixture rows with service-role and then *attacks them as an authenticated
  member*. Forty lines behind an executable proof is a smaller risk than 58 filter sites
  behind a convention.
- Health data is legally different, not just semantically different. This repo's own
  `docs/brain/PRIVACY_DATA_INVENTORY.md` already classifies allergy/health disclosure as
  **sensitive data under KSA PDPL, requiring explicit consent and retention limits**. A
  clinic's conversations are health records end to end. Separate tables mean a separate
  retention policy, a separate deletion path and a separate export — which are things you
  want to be able to point at during a CBAHI or PDPL conversation, not derive with a `where`
  clause.
- Extraction becomes what the brief asked for: `pg_dump -t 'health_*'`, move three
  directories, done. **No Kivo table appears in the dump.**

### 1.4 The recommendation, in one line

> **Faysal gets its own tenant table (`health_clinics`) and its own membership table
> (`health_members`), sharing only `auth.users`. The column is `clinic_id`, never
> `restaurant_id`, and that naming is load-bearing for the seam proof.**

### 1.5 What this decision costs the rest of the map — read this before §5

The tenant decision **determines roughly twenty of the verdicts below.** Any module that
issues a query is coupled to a *table*, not just to a *type*. Under Option C:

| module | what it touches | verdict it gets |
|---|---|---|
| `lib/messaging/send-gate.ts` | `conversations`, `conversation_signals` | FORK |
| `lib/messaging/capacity.ts` | `template_sends` | FORK |
| `lib/messaging/template-registry.ts` | `message_templates` | FORK |
| `lib/messaging/tenant-creds.ts` | `lib/db/restaurants` | FORK |
| `lib/db/tenant*.ts`, `require-tenant.ts` | `members`, `restaurants` | FORK |

Under Option A those same five would have been SHARE. That trade — *five FORKs of small,
well-understood files, in exchange for a seam that can be mechanically proven* — is the
whole argument, and it is worth stating in exactly those terms rather than pretending
Option C is free.

---

## 2. HOW THE SEAM IS ENFORCED, NOT MERELY INTENDED

### 2.1 The finding that shapes the answer

Two facts about this repo's CI, both verified, both of which a proposal has to survive:

1. **`.github/workflows/core-gate.yml` runs the unit suite with `continue-on-error: true`.**
   Its own comment says why ("2 of 114 files fail … Delete this line once that gap is
   closed"). **Adding a proof to `scripts/unit-suite.json` alone does not block a merge.**
   It makes the proof *visible*, not *enforcing*.
2. **`.github/workflows/agent-eval.yml` — which *is* blocking — is `paths:`-filtered** to
   `lib/ai/**`, `lib/messaging/**`, `lib/db/**`, `app/api/whatsapp/**`,
   `app/api/channels/whatsapp/**`, `app/api/agent/**`, plus `scripts/test-*.test.ts`, `scripts/proof-*.mjs` and `scripts/proof-*.test.ts`. It lists
   individual proofs as named, blocking steps.

Consequence: **a PR that touches only `lib/health/*` and `app/faysal/*` triggers neither
blocking job today.** That is exactly the PR shape that can break the seam. A proof that is
not wired into a job that runs on the change it guards is documentation with a shebang.

The `local-rules` ESLint plugin (`eslint-rules/index.js`) is the other candidate, and
`npm run lint` *is* blocking — but both existing rules ship as `"warn"`, and `next lint`
exits 0 on warnings. An ESLint rule is a good belt-and-suspenders (§2.5), not the primary
control.

### 2.2 The proof: `scripts/proof-faysal-seam.test.ts`

Model it directly on **`scripts/proof-phonetic-net-unwired.test.ts`** — the repo's existing,
battle-tested import-boundary proof. Do not write a new scanner. That file already contains,
and documents the defect that motivated each of, the following:

- `stripComments()` — a **character scanner, not a line filter**, that understands string
  literals, template literals, **regex literals** (a `/['"]/` put the first version into
  string mode and silently disabled the rest of the scan), and escaped slashes. Its header
  records the exact mutations that defeated earlier versions.
- `bindingsFrom()` — asks **what a file IMPORTS from a module**, not whether it mentions a
  name. It catches named imports, **aliased** imports (`import { x as y }` — the form that
  defeated the first version), namespace imports, `export … from` re-exports, `require()`,
  and dynamic `import()`. A function you never bind, you cannot call.
- A repo walk that skips `node_modules/.next/.git/scripts` and asserts it **found something**
  (`sources.length >= 100`) — so a broken walk fails loudly instead of passing vacuously.
- **Positive controls**: a list of import lines that MUST be caught and a list that MUST NOT,
  so a typo in a regex cannot leave the proof green and meaningless.

The Faysal proof inverts its polarity: instead of *one banned module scanned across the whole
repo*, it is *the whole repo banned, allow-listed, scanned across three directories*.

```
scripts/proof-faysal-seam.test.ts

  FAYSAL  = ["lib/health", "app/faysal", "app/api/faysal"]

  ── A. THE SCAN IS REAL ────────────────────────────────────────────────
    • the walk found Faysal's sources (>= 1) — a proof over an empty set passes
      vacuously, which is how a seam guard dies quietly the day someone renames
      a directory.
    • every path on ALLOWED_MODULES exists on disk — a typo'd allow-list entry is
      a silent hole, not a failure.

  ── B. IMPORT DIRECTION: Faysal → Kivo ─────────────────────────────────
    For every source under FAYSAL, for every binding produced by bindingsFrom():
      resolve "@/lib/x", "./x", "../x" to a repo-relative path;
      PASS  if the target is a node builtin, an npm package, or under lib/health/;
      PASS  if the target is on ALLOWED_MODULES (the SHARE list of §5-§11,
            transcribed literally — one line per file, no globs, no prefixes);
      FAIL  otherwise, naming the file, the specifier and the bindings.
    Deny by default. A new shared module is a deliberate one-line edit to this
    proof, reviewed as such — which is the point.

    `import type` is NOT exempt. `import type { Presentation } from "@/lib/ai/tools"`
    erases at build time and still binds Faysal's shape to a 1,539-line restaurant
    module. Types are the cheapest way to smuggle a dependency past a scanner that
    only looks for runtime edges.

  ── C. IMPORT DIRECTION: Kivo → Faysal ─────────────────────────────────
    No file outside FAYSAL binds anything from lib/health/ or app/faysal/.
    A seam is a wall, not a one-way valve: a Kivo module that imports a health
    type is just as un-extractable.

  ── D. THE DATABASE SEAM (an import scan cannot see this) ──────────────
    Supabase table names are STRING LITERALS. No import graph will ever catch
    `.from("restaurants")`. Scan the comment-stripped source of every Faysal file
    for these literals and fail on any hit:
        from("restaurants")   from("orders")     from("menu_items")
        from("menu_categories")  from("members")  from("modifiers")
        from("delivery_zones")   restaurant_id    menu_item_id
    …and assert the positive: every Faysal `.from("…")` names a table whose name
    starts with `health_`, or is `auth.users`. Deny by default here too.

  ── E. THE RETIRED DETECTOR IS RETIRED FOR FAYSAL TOO ──────────────────
    Already free: proof-phonetic-net-unwired.test.ts walks app/, lib/ and
    components/ with no directory allow-list, so lib/health/* and app/faysal/*
    are covered by it from the day they exist. Assert here that the walk in that
    proof still has no directory allow-list, so the coverage cannot be narrowed
    without this proof going red.

  ── F. POSITIVE CONTROLS (non-negotiable) ──────────────────────────────
    MUST be caught:
      import { buildOrderDraft } from "@/lib/ai/tools";
      import { buildOrderDraft as b } from "../../lib/ai/tools";   ← the alias
      import * as tools from "@/lib/ai/tools";                     ← namespace
      export { priceOrder } from "@/lib/order-pricing";            ← re-export
      const t = require("@/lib/menu/publish-availability");
      const t = await import("@/lib/ai/allergen-vocab");
      import type { Presentation } from "@/lib/ai/tools";          ← type-only
      const { data } = await sb.from("restaurants").select("id");  ← the DB seam
    MUST NOT be caught:
      import { normalizeWhatsAppInbound } from "@/lib/messaging/adapters/whatsapp";
      import { mustWrite } from "@/lib/db/checked";
      import { createHmac } from "node:crypto";
      import { NextResponse } from "next/server";
      // prose mentioning lib/ai/tools and orders
```

Exit convention identical to the rest of the harness: a `pass`/`fail` tally,
`console.log("\n… PROOF: N passed, M failed")`, `process.exit(fail === 0 ? 0 : 1)`.

### 2.3 Why part D is the part that matters

An import-graph proof alone would pass a `lib/health/booking.ts` that does
`admin.from("restaurants").select("*")` — no import, no edge, full coupling, and a live
cross-product read. Part D is the only half of this proof that catches the failure mode
Option A in §1 would have made routine. **Any reviewer of this spec should check that part D
survived into the implementation.**

### 2.4 Wiring — three steps, and step 3 is the one that is usually skipped

1. Append to `scripts/unit-suite.json`:
   `"node --experimental-strip-types scripts/proof-faysal-seam.test.ts"`
   (makes it run in `npm run test:unit` and count in the tally).
2. Add a named, **blocking** step to `.github/workflows/agent-eval.yml`, beside the other
   named proofs:
   ```yaml
   - name: Faysal seam guard (import + DB boundary)
     run: node --experimental-strip-types scripts/proof-faysal-seam.test.ts
   ```
3. **Extend `agent-eval.yml`'s `paths:` filter** with `lib/health/**`, `app/faysal/**` and
   `app/api/faysal/**`. Without this, the job does not run on a Faysal-only PR, and steps 1
   and 2 protect nothing on exactly the change they exist to catch.

### 2.5 Optional second layer (cheap, additive)

`eslint-rules/no-cross-vertical-import.js`, wired at severity `"error"` and applied via an
overrides block scoped to the three Faysal directories, using `no-restricted-imports`
patterns. This gives an in-editor red squiggle at the moment of typing rather than at CI.
It does **not** replace the proof: it cannot see `.from("restaurants")`, and `next lint`
would need `--max-warnings=0` to be trustworthy at `"warn"`.

---

## 3. WHAT FAYSAL INHERITS FOR FREE

Concretely, and only counting things I opened and read. Estimates are *engineering* time,
not calendar time, and they are for building the capability to the standard this repo
already holds it to — including the defects already paid for.

### 3.1 A hardened WhatsApp Cloud API integration — weeks, not days

`lib/messaging/adapters/whatsapp.ts` (625 lines) + `config.ts` + `phone.ts` +
`outbound.ts` + `retry-policy.ts` + `webhook-routing.ts` + `template-registry.ts`. Inbound
payload normalisation for text, interactive taps, **locations**, **images**, **status
callbacks** and **ad-referral (CTWA) metadata**; the Graph send builders for text, buttons,
lists, image-by-id, image-by-link, audio and templates; media download; read receipts and
typing; `X-Hub-Signature-256` verification with `timingSafeEqual`; per-tenant credential
override through an `AsyncLocalStorage` context so a reply leaves from the right number.

The parts nobody budgets for and this already has: **idempotency on `channel_message_id`**,
**per-conversation inbound coalescing** (`inbound-coalescing.ts` — Meta delivers each message
as its own POST, so a burst became N replies *and* let a burst message bypass the safety gate;
this is the fix, and it is pure and testable), and a **`maxDuration = 60`** on the webhook
with a header explaining that a timeout there is not a dropped turn but a *repeated bill*,
because Meta redelivers the whole batch and the second transcription is booked nowhere.

### 3.2 A voice stack that has already met real phones — weeks

`lib/ai/stt/*` (12 files) and `lib/ai/tts/*` (8 files): an env-selected adapter seam with
four STT providers and three TTS providers behind one interface, per-provider cost tables
wired to a spend monitor, and a **mock-in-production guard** that refuses to let a fabricated
transcript reach a customer.

The expensive knowledge is in two files:

- **`lib/ai/stt/fallback.ts`** — iOS Safari records only `audio/mp4`, and Deepgram nova-3
  answers **200 with an empty transcript and confidence 0** on every one of them, four for
  four on real speech. The header records that the obvious fix (strip `codecs=`, retry with
  no `Content-Type`) *was tried in production and failed*, and that the working mechanism is
  a second engine that is handed a **named file** (`audio.m4a`) rather than a described
  buffer. That is a bug you find on a customer's phone, not in a test.
- **`lib/ai/tts/spoken-text.ts`** — text for the ear, not the screen. Emoji, `*bold*`
  markers, `×`, `—` and bare numerals all degrade an ElevenLabs render; the WhatsApp
  formatter deliberately produces all of them. Subtractive by construction, so it can never
  change a word, a name or a number's value.

Plus `lib/ai/tts/voice-registry.ts`: an **allow-list of exactly one voice**, with the
reasoning for why a deny-list cannot implement the rights ruling (the historical inventory is
incomplete, so a deny-list fails open on precisely the ids nobody wrote down). Faysal adds a
registered voice and inherits the whole refusal/quarantine/provenance apparatus.

### 3.3 A working WhatsApp-shaped demo, including a live phone call — weeks

`app/demo/DemoPhone.tsx` is **1,940 lines** and is the single largest free asset in the repo.
Chat bubbles, hold-to-record voice notes with a 60-second auto-stop, a **full call screen**
with VAD and barge-in (`lib/demo/call-loop.ts`), tappable button/list rendering, a
WhatsApp-markup renderer, image bubbles, and — the detail that costs a day to discover —
**iOS Safari audio unlock via a silent MP3 played inside the user gesture.**

Behind it: `lib/demo/speech-ticket.ts` (HMAC-signed TTS tickets so playback can start before
synthesis finishes), `voice-out.ts`, `audio-payload.ts`, `call-channel.ts`, `call-delivery.ts`.

### 3.4 Spend control on a public, unauthenticated endpoint — days, and one incident avoided

`supabase/migrations/0119_demo_spend_guard.sql` + `0120`: `demo_usage_counters` +
`demo_controls` + `kv_demo_try_consume(ip_bucket, global_bucket, ip_limit, global_limit)`,
an atomic `insert … on conflict do update … returning` that serialises on a row lock. **Two
caps deliberately** — per-IP hourly (courtesy) and global daily (the one that protects the
card, because a per-IP limit is defeated by any number of source addresses) — plus a
**kill switch read on every turn**, so the demo stops in seconds with no deploy.

The header also records the grant idiom that matters on Supabase: `revoke … from public` is
**not** sufficient, because Supabase's `ALTER DEFAULT PRIVILEGES` grant `EXECUTE` directly to
`anon` and `authenticated`. Both revokes are required and neither implies the other. That gap
shipped as a live security hole once already and was closed in `0114`.

`lib/demo/config.ts` carries the worst-case arithmetic — and, more usefully, three
paragraphs recording the three separate times that arithmetic was wrong.

### 3.5 A deterministic-safety architecture, and one file that is *literally medical* — weeks

The pattern is the asset: **"the layer proposes, a deterministic gate decides."** It appears
four times — the allergen gate, the media guard, the voice budget, the send gate — and is
exactly the shape a booking agent needs for red-flag triage (chest pain, bleeding, pregnancy,
paediatric fever → never book a routine slot, always escalate).

And one file transfers with no adaptation at all: **`lib/ai/symptom-frames.ts`** (36 lines).
It is a single alternation source for *how Arabic reports a symptom*, in **both first and
third person** — «عندي»، «جاني»، «أعاني من»، and «ابني عنده»، «بنتي فيها» — with an explicit
`NOT_A_PERSON` list so «الجو فيه كتمة» is a remark about the room and not a chest complaint.
Its header records why it exists: two copies drifted, and a parent reporting a child's rash
was heard by one detector and not the other. For a clinic that is not a nice-to-have; it is
the difference between hearing a mother describe her child's symptoms and not.

Alongside it: `lib/ai/allergen-emergency.ts`'s present-tense discipline
(`PAST_RE` / `HYPOTHETICAL_RE` / `HYPOTHETICAL_Q_RE` exclusions so "if I ate nuts" and "it
happened a year ago" do not fire) is the exact logic a triage detector needs.

### 3.6 PDPL consent machinery — days, and it is the right days

`lib/privacy/consent.ts` (92 lines, **zero** restaurant references) plus
`supabase/migrations/0073_pdpl_consent.sql`. The rule it encodes —
**in-conversation safety needs no consent (vital interest), marketing does** — is the correct
starting posture for a clinic, and `docs/brain/PRIVACY_DATA_INVENTORY.md` already classifies
health disclosure as sensitive data with explicit-consent and retention obligations.

### 3.7 Arabic/Saudi output correctness — a week of small, invisible bugs

`lib/util/customer-visible-format.ts` + `arabic-digits.ts` + `whatsapp-markup.ts` +
`lib/ai/dialect.ts`'s resolver half: digit style per dialect (KSA Western, Egypt
Arabic-Indic), a WhatsApp bold sanitiser that is **provably idempotent** (its header records
the pass where it was not), and `normalizeAr()` — tashkeel and tatweel stripping,
أإآٱ→ا, ة→ه, ى→ي, ؤ→و, ئ→ي, and 3+-letter run collapsing so «حساااسية» matches «حساسية».
Every Arabic matcher in Faysal will need that function on day one.

### 3.8 A proof harness that already earned its keep — a week, and a habit

`scripts/run-unit-suite.mjs` runs every one of 228 manifest entries, always, with a 5-minute
per-file timeout because **a proof that hangs is a freeze, and freezes are what several of
these exist to catch.** Its header documents the defect it was written to fix: `test:unit`
used to be an `&&` chain of 113 commands, so a failure at #8 quarantined 93% of the suite
while nothing was marked skipped. `scripts/proof-phonetic-net-unwired.test.ts` then supplies
a ready-made, adversarially-hardened import scanner (§2.2). Faysal inherits both the runner
and the house style: **architecture is enforced by executable proofs, not by documents.**

### 3.9 What is honestly NOT free

To keep this section from being a sales pitch: **the entire booking domain has no precedent
here.** There is no appointment, slot, calendar, doctor-roster, insurance-eligibility or
referral module anywhere in `lib/` or `app/` (verified: `grep -rlniE
"appointment|booking|timeslot|calendar"` over `lib/` and `app/` returns exactly one file, and
it is about tonight's kitchen notes). Kivo's closest analogue is an *order draft*, which is a
basket of items with no time dimension, no capacity model, no resource contention and no
cancellation window. Section 12 lists what that means.

---

## 4. VERDICT COUNTS

Counted as **files**, and broken down per section so the tally is auditable against the
tables below rather than asserted.

| section | SHARE | FORK | REBUILD | NEVER | files |
|---|---:|---:|---:|---:|---:|
| §5 `lib/ai/stt/*` | 8 | 4 | — | — | 12 |
| §6 `lib/ai/tts/*` | 8 | — | — | — | 8 |
| §7 `lib/messaging/*` (incl. `adapters/`) | 17 | 9 | 2 | 5 | 33 |
| §8.1 `lib/demo/*` | 5 | 6 | — | 1 | 12 |
| §8.2 `app/api/demo/*` | 3 | 1 | 2 | — | 6 |
| §8.3 `app/demo/*` | — | 2 | — | — | 2 |
| §9 tenancy / Supabase / HTTP / crypto | 10 | 6 | — | — | 16 |
| §10.1 dialect + output formatting | 3 | 1 | — | — | 4 |
| §10.2 the safety net | 2 | 11 | — | 13 | 26 |
| §11.1 proof harness | 7 | — | — | — | 7 |
| **total (files)** | **63** | **40** | **4** | **19** | **126** |

Of the 63 SHARE, **5 are `SHARE*`** — shareable only after one named, behaviour-preserving
change to the Kivo file: `lib/messaging/outbound.ts`, `lib/messaging/voice.ts`,
`lib/messaging/send-template.ts`, `app/api/demo/capabilities/route.ts`,
`app/api/demo/speak/route.ts`. A sixth pre-Faysal change is recommended in §10.2 (extracting
`normalizeAr` out of the allergen gate); it creates a new shared file rather than
reclassifying an existing one.

Two further items are classified in §11.2 but are **database objects, not files**:
`demo_usage_counters` (SHARE) and the migration's grant idiom (SHARE) against
`kv_demo_try_consume` (FORK) and `demo_controls` (FORK).

Separately, §12 lists **7 capabilities that are REBUILD with no Kivo file to name** — the
booking domain has no precedent anywhere in this repo.

**Scope of the count.** Everything the brief named, plus what those modules pull in
transitively. It deliberately does **not** attempt a verdict on all 308 `lib/` files: the
~180 not listed are Kivo console, ordering, delivery, payments, printing and menu-editor
surfaces that are **NEVER** by construction, and they are covered by the deny-by-default
rule in §2.2-B rather than enumerated. Enumerating them would produce a ban list that is
stale the moment someone adds a file — which is precisely the failure mode deny-by-default
avoids.

---

## 5. `lib/ai/stt/*` — speech to text (12 files)

| path | lines | verdict | why | if FORK: what must change |
|---|---:|---|---|---|
| `lib/ai/stt/types.ts` | 116 | **SHARE** | The adapter seam itself. Provider-neutral; the only domain word is in a comment. | — |
| `lib/ai/stt/index.ts` | 124 | **SHARE** | Env-selected resolver (`STT_ADAPTER`, else key inference). Imports only siblings. | — |
| `lib/ai/stt/guard.ts` | 49 | **SHARE** | Blocks the fabricating mock in production. A clinic needs this *more* than a restaurant. | — |
| `lib/ai/stt/openai.ts` | 73 | **SHARE** | Whisper adapter. Zero domain coupling. | — |
| `lib/ai/stt/groq.ts` | 78 | **SHARE** | Groq Whisper + `confidenceFromSegments`. Pure. | — |
| `lib/ai/stt/deepgram.ts` | 132 | **SHARE** | `buildDeepgramUrl` is pure and key-independent; keyterms arrive as a parameter. | — |
| `lib/ai/stt/fallback.ts` | 215 | **SHARE** | The second-engine rescue for `audio/mp4`. The defect is a device/container fact, not a domain fact. | — |
| `lib/ai/stt/pricing.ts` | 25 | **SHARE** | Per-minute rate table. | — |
| `lib/ai/stt/mock.ts` | 23 | **FORK** | 23 lines whose entire content is a fixed Arabic **burger order**. | Replace the one transcript constant with a clinic sentence. Copying beats parameterising at this size. |
| `lib/ai/stt/deepgram-keyterms.ts` | 62 | **FORK** | Builds the recognition bias list from **menu item names**, blocking anything in the **food-allergen** lexicon. | Source terms from specialties/doctors/branches; block terms become the medical red-flag lexicon (ألم صدر، نزيف، إغماء، حامل). Keep `KEYTERM_CAP` and the never-boost-a-safety-word rule verbatim. |
| `lib/ai/stt/safe-vocab.ts` | 231 | **FORK** | **The most valuable fork in the repo.** Its doctrine: *bias toward domain nouns, never toward anything that can trip a safety hold.* Written after biasing Whisper toward a dairy menu turned the greeting «هلا والله» into an allergy consultation and a safety hold nobody could leave. | Swap the four allergen detector imports for the health-triage detectors. **Copy the header comment verbatim** — the reasoning is the asset, and it applies unchanged to biasing toward «حامل» or «ألم». |
| `lib/ai/stt/slots.ts` | 143 | **FORK** | Canonical slot extraction. The Arabic number-word table (standard + Egyptian + compound hundreds), the negation/correction set («مش/غير/بدل»), and the address-word guard are directly reusable; `resolveVoiceCandidates` matches a **menu**. | Keep `NUM`, `NEG`, `NEG_WAW_STRIPPABLE`, `isNegToken` unchanged. Replace item matching with clinic slots: specialty, branch, doctor, date, time-of-day. Extend `ADDRESS_WORDS` reasoning to dates («يوم عشرة» is a date, not a quantity). |

---

## 6. `lib/ai/tts/*` — text to speech (8 files)

| path | lines | verdict | why | if FORK: what must change |
|---|---:|---|---|---|
| `lib/ai/tts/types.ts` | 71 | **SHARE** | The seam + the `TtsAudioFormat` split (Ogg Opus for WhatsApp, MP3 because **Safari cannot decode Ogg**). | — |
| `lib/ai/tts/index.ts` | 114 | **SHARE** | Resolver + the fallback law: fall back when a provider is **down**, never on a registry refusal or a 4xx (both mean misconfiguration, which a different voice would ship forever). | — |
| `lib/ai/tts/mock.ts` | 30 | **SHARE** | Empty audio bytes + `mockTtsAllowed()`. No content at all. | — |
| `lib/ai/tts/openai.ts` | 42 | **SHARE** | Fallback voice adapter. | — |
| `lib/ai/tts/pricing.ts` | 40 | **SHARE** | Per-character rates, with the recorded history of a `.`-vs-`_` model-id typo that made every Flash synthesis look free to the spend monitor. | — |
| `lib/ai/tts/spoken-text.ts` | 156 | **SHARE** | Text for the ear. Subtractive by construction; cannot change a word, a name or a number's value. | — |
| `lib/ai/tts/elevenlabs.ts` | 287 | **SHARE** | The voice is a **parameter** (`opts.voiceId ?? ELEVENLABS_VOICE_ID`), validated against the registry. Nothing restaurant-specific in the request path. | — |
| `lib/ai/tts/voice-registry.ts` | 241 | **SHARE** | Allow-list-of-one + refusal reasons + quarantine ids + provenance. **Faysal adds a second registered entry**; the doctrine (allow-list, never deny-list, because the historical inventory is incomplete) holds for both. On extraction the registry splits cleanly, one entry each. | — |

---

## 7. `lib/messaging/*` — 33 files (adapter, webhook, voice, outbound)

### 7.1 SHARE (14)

| path | lines | verdict | why | note |
|---|---:|---|---|---|
| `adapters/whatsapp.ts` | 625 | **SHARE** | The Cloud API. **Zero** occurrences of restaurant/menu/dish/order. Deliberately avoids node-only imports so it bundles on both sides. | |
| `adapters/mock.ts` | 65 | **SHARE** | Test adapter. | |
| `config.ts` | 93 | **SHARE** | Env credentials + the per-request override registration hook. | |
| `creds-context.ts` | 41 | **SHARE** | `AsyncLocalStorage` per-tenant credential scope. | |
| `types.ts` | 125 | **SHARE** | `InboundMessage` / `OutboundMessage` / `SendResult` / `MessagingAdapter`. | |
| `phone.ts` | 87 | **SHARE** | E.164 normalisation; country arrives as a parameter (the `restaurants.country` mention is a doc comment). | |
| `retry-policy.ts` | 85 | **SHARE** | Which Meta error codes are retryable, and the backoff. | |
| `retry-policy.test.ts` | 69 | **SHARE** | Runs in the suite as-is. | |
| `webhook-routing.ts` | 38 | **SHARE** | Pure routing decision, zero domain terms. | |
| `whatsapp-health.ts` | 125 | **SHARE** | Eight independent, three-valued channel probes. | |
| `tester-allowlist.ts` | 39 | **SHARE** | Pure upstream recipient filter — "may the agent engage at all". | |
| `image-turn.ts` | 109 | **SHARE** | Pure string shaping for an inbound-image turn. Zero domain terms. | |
| `inbound-coalescing.ts` | 126 | **SHARE** | Pure burst-merge over a watermark. Safety-relevant: it is what stops a burst message bypassing the input gate. | |
| `service.ts` | 60 | **SHARE** | Channel → adapter resolution. | |

### 7.2 SHARE\* — shareable after one named change to the Kivo file (3)

| path | lines | the change (behaviour-preserving) |
|---|---:|---|
| `outbound.ts` | 315 | Move `Presentation` / `PresentationButton` / `PresentationRow` / `PresentationSection` **out of `lib/ai/tools.ts` (lines 179-194) into `lib/messaging/types.ts`** and re-export from `tools.ts` for compatibility. They are WhatsApp interactive-message shapes, not restaurant concepts. Until this lands, `outbound.ts` transitively binds Faysal to a 1,539-line restaurant module — and the §2.2 proof will (correctly) fail on it. |
| `voice.ts` | 120 | Take the STT prompt-bias string as a **parameter** instead of calling `buildSttPromptVocab()` (which is menu-shaped) internally. One signature change; both Kivo callers already have the vocabulary to hand. |
| `send-template.ts` | 48 | Depends on `capacity.ts` (FORK, §7.3). Either inject the capacity recorder, or accept it as FORK alongside its dependency. |

### 7.3 FORK (9)

| path | lines | why | what must change |
|---|---:|---|---|
| `send-gate.ts` | 112 | The `control_epoch` re-read immediately before the API call — the guard against a stale generation sending after a takeover — is exactly right. It reads `conversations` and writes `conversation_signals`. | Point at `health_conversations` / `health_conversation_signals`; `restaurantId` → `clinicId`. Logic unchanged. |
| `capacity.ts` | 105 | Meta messaging-tier capacity accounting. Writes `template_sends`. | Health-side table; `restaurant_id` → `clinic_id`. |
| `template-registry.ts` | 182 | Generic Meta template registry with a promotional-language denylist. Upserts `message_templates` on `(restaurant_id,name,language,variant)`. | Health-side table + key. The denylist ("buy now", "limited time") applies unchanged — arguably more strictly for a clinic. |
| `tenant-creds.ts` | 37 | Imports `@/lib/db/restaurants`. | Resolve credentials from `health_clinics`. |
| `templates.ts` | 65 | The registry **content** is order/delivery templates. | Faysal's set: appointment confirmation, reminder-24h, reschedule, cancellation, results-ready. Structure unchanged. |
| `media-guard.ts` | 123 | The disposer discipline is exactly right, and its **hard-zero** rule (send nothing while safety-held / complaint-open / payment-pending) transfers verbatim. The type makes an illegal state unrepresentable — a hard-zero can never carry a link. | `fallbackToMenuLink` → `fallbackToDirectoryLink` (branch/specialty page). Hard-zero states become safety-held / triage-open / payment-pending. |
| `media-window.ts` | 61 | 24-hour rolling budget window. | The second reset trigger, *"a new order started"*, becomes *"a new booking started"*. |
| `voice-budget.ts` | 344 | **The hard-zero categories are the transferable asset**: safety hold, money figure, payment link, receipt are all text-only because a mis-heard number is a wrong charge and a link must be tappable. | Add health hard-zeros: a diagnosis, a result, a medication name, a triage instruction. The detectors inside `voiceHardZeroReason` scan for order/price text and must be re-lexiconed. Keep `CALL_SPEAKABLE_SAFETY_STOPS`'s scoping discipline. |
| `photo-thread.ts` | 50 | Compact captioned photo sequencing — one lead caption naming the set rather than N anonymous cards. | Item name + **price** tag → branch/service name. Marginal value; fork only if Faysal sends photo sets. |

### 7.4 REBUILD (2) / NEVER (5)

| path | lines | verdict | why |
|---|---:|---|---|
| `respond-and-send.ts` | 2141 | **REBUILD** | The Kivo turn orchestrator. 40+ imports spanning the allergen chain, order creation, delivery, ownership flips, staff alerts and receipts. Faysal's equivalent is a *booking* orchestrator. Read it for the **shape** (safety first, then typed actions, then model, then gates, then send) — do not port it. |
| `typed-actions.ts` | 809 | **REBUILD** | Deterministic pre-model handlers. Correct idea (a tapped button must never depend on the model), wrong actions: it imports `order-pricing`, `payments/*` and `db/brain`. Faysal's typed actions are confirm-slot / reschedule / cancel / pick-branch. |
| `quantity-fill.ts` | 266 | **NEVER** | Bare 1..20 quantity answers to an order question. |
| `dish-photo-message.ts` | 58 | **NEVER** | Builds a message row for an outbound dish photo. |
| `send-receipt.ts` | 155 | **NEVER** | Renders and sends an order receipt PNG; imports `lib/render/receipt`. |
| `interactive-router.ts` | 48 | **NEVER** | `FIXED_INTERACTIVE_CONTROLS` is a fixed map of order controls (`set_pickup`, `pay_cod`, `confirm_order`). Legacy no-op in Kivo; nothing for Faysal to reuse. |
| `message-log-store.ts` | 89 | **NEVER** | Client Zustand log for the Kivo Settings simulator; imports `newId` from `lib/store` (the Kivo global store). |

---

## 8. `lib/demo/*` (12) and `app/api/demo/*` (6) and `app/demo/*` (2)

### 8.1 `lib/demo/*`

| path | lines | verdict | why | if FORK: what must change |
|---|---:|---|---|---|
| `audio-payload.ts` | 38 | **SHARE** | Base64 audio envelope encode/decode. Zero domain terms. | — |
| `call-channel.ts` | 42 | **SHARE** | Which audio container this client can play. Zero domain terms. | — |
| `call-delivery.ts` | 40 | **SHARE** | Delivery mode for a spoken reply (inline vs ticket). Zero domain terms. | — |
| `call-loop.ts` | 222 | **SHARE** | The VAD / barge-in / silence state machine, with a measured noise floor tuned above a busy room's 0.05 RMS hum. The four "restaurant" hits are all prose about that room. | — |
| `speech-ticket.ts` | 377 | **SHARE** | HMAC-signed, replay-bounded TTS ticket so playback can start before synthesis finishes. One incidental domain mention. | — |
| `config.ts` | 261 | **FORK** | Pins `DEMO_RESTAURANT_ID`, the demo hosts, `DEMO_ORDER_SOURCE`, the TTL and the caps. The **caps, bucket helpers (`globalBucket`/`ipBucket`), `isUuid`, `capDemoHistory`, `isDemoHost`** are all directly reusable. | Faysal's pinned clinic id, its own hosts, `DEMO_SESSION_CHANNEL = "faysal_demo"`, and a **distinct bucket prefix** so the two products do not drain one counter (§11.2). Re-run the spend arithmetic; do not copy the numbers. |
| `session.ts` | 202 | **FORK** | The ephemeral session row. **The doctrine is the asset**: the client-supplied id is never trusted, it is resolved with `.eq(tenant)` **and** `.eq(channel)`, and a non-match is *not found* rather than an error — so a visitor pasting a real id gets their own fresh session and never learns whether the id exists. It also deliberately writes **no inbound message row**, because the monitoring sweep would page the Founder on every abandoned demo. | Health-side conversations table; both `.eq` filters kept, both for the same stated reasons. |
| `call-greeting.ts` | 82 | **FORK** | One Arabic constant: «هلا والله، معك خالد من مطعم الديرة». | The greeting; the "the person who picks up speaks first" rule stays. |
| `call-presentation.ts` | 54 | **FORK** | A regex deciding when a caller is asking for something **sent** rather than **spoken** — "he tells you what he has on the phone; he sends the menu only if you ask." | Replace menu/photo vocabulary with location, price list, doctor schedule, insurance list. |
| `call-carriers.ts` | 143 | **FORK** | Short spoken "carrier" lines that bridge dead air while the authoritative reply is composed — chosen so they carry **no number, no currency token, no link, no order number**. Written after the Founder asked a price and heard three seconds of nothing. | New lines; the never-carry-a-figure rule is unchanged. |
| `voice-out.ts` | 410 | **FORK** | Speakability decision + synthesis + ledger write. Reads order/price signals via `voice-budget`. | Follows §7.3 `voice-budget`. Keep the `agent_runs`-equivalent cost write — it is what makes spend visible. |
| `order.ts` | 134 | **NEVER** | Creates a demo order; imports `@/lib/db/orders-create`. | — |

### 8.2 `app/api/demo/*`

| path | lines | verdict | why |
|---|---:|---|---|
| `silent/route.ts` | 79 | **SHARE** | Serves the silent MP3 that unlocks iOS audio inside a user gesture. Pure infrastructure. |
| `capabilities/route.ts` | 72 | **SHARE\*** | Probes which STT/TTS are provisioned. Imports `lib/demo/config` only for the host check and caps — parameterise or re-point at the Faysal config. |
| `speak/route.ts` | 256 | **SHARE\*** | Ticket → synthesis → audio, with a per-ticket repeat cap and a ledger write per repeat. Same single dependency on `lib/demo/config`. |
| `greeting/route.ts` | 151 | **FORK** | Wraps the forked greeting; also the clearest worked example of calling the spend guard **before** doing anything expensive. |
| `turn/route.ts` | 366 | **REBUILD** | Its 60-line header is required reading — public + unauthenticated + calls an LLM, therefore: input capped by **length not just count**; the response is a **positive allowlist** so unit economics never leak (and the header records that the allowlist also failed *by omission* once); the tenant pinned server-side; the session id resolved, never trusted. Rebuild the handler, **transcribe those four controls exactly.** |
| `voice/route.ts` | 800 | **REBUILD** | Same, plus STT, safe-vocab, carriers, presentation and tickets. Faysal's version is a different pipeline over the same controls. |

### 8.3 `app/demo/*`

| path | lines | verdict | what must change / what must not |
|---|---:|---|---|
| `DemoPhone.tsx` | 1940 | **FORK** | **Change:** `GREETING`; the two header strings «خالد — مطعم الديرة»; `SESSION_KEY`; the `/api/demo/*` fetch paths → `/api/faysal/*`; `DishPhotos` → branch/service cards; the option ids; the footnote disclaimer («الأسعار والأصناف افتراضية»). **Do not touch:** the MediaRecorder path and 60-second auto-stop, `decodeReplyAudio`, the `SILENT_MP3` iOS unlock, the VAD wiring to `call-loop`, `parseWhatsAppMarkup` rendering, `usablePhotos` (https-only `<img>` guard), and the bubble/`S` style system. Roughly 90% of the file survives verbatim. |
| `page.tsx` | 38 | **FORK** | Host gate + page shell. |

---

## 9. Tenancy, Supabase, HTTP, crypto

| path | lines | verdict | why | if FORK: what must change |
|---|---:|---|---|---|
| `lib/supabase/env.ts` | 15 | **SHARE** | `isSupabaseConfigured()`. | — |
| `lib/supabase/client.ts` | 16 | **SHARE** | Browser client. | — |
| `lib/supabase/server.ts` | 35 | **SHARE** | Server client (cookies). | — |
| `lib/supabase/admin.ts` | 38 | **SHARE** | Service-role client. | — |
| `lib/supabase/cookie-options.ts` | 18 | **SHARE** | Cookie flags. | — |
| `lib/supabase/middleware.ts` | 109 | **SHARE** | Session refresh. The two "restaurant" hits are comments. | — |
| `lib/db/checked.ts` | 142 | **SHARE** | `mustSucceed` / `maybeSucceed` / `mustWrite` / `isUndefinedColumnError` (the 42703 deploy-safe probe). **Zero** domain terms, and it is the primitive the `no-unchecked-supabase-write` ESLint rule exists to enforce. | — |
| `lib/http/same-origin.ts` | 82 | **SHARE** | The CSRF same-origin decision, pure. | — |
| `lib/crypto/secrets.ts` | 88 | **SHARE** | Encrypt/decrypt for the stored WhatsApp/PSP credentials. | — |
| `lib/rate-limit.ts` | 81 | **SHARE** | Process-local fixed-window limiter with a `MAX_KEYS` cap. Its header is explicit that it is **not** a distributed limiter and not the real cap — the DB guard is (§11.2). Import it *with* that understanding. | — |
| `lib/db/tenant-gate.ts` | 46 | **FORK** | The pure authorisation decision — 401 unauthorized / 403 no_active_tenant / 403 tenant_mismatch / 403 forbidden_role, in that order, with **no default tenant ever**. The only coupling is the field name. | `Tenant.restaurantId` → `clinicId`. *(If Kivo ever renames this field to `tenantId`, this file becomes a clean SHARE — worth doing, out of scope here.)* |
| `lib/db/tenant.ts` | 99 | **FORK** | Membership resolution, incl. the rule that **multiple memberships with no explicit selection returns null rather than guessing**. Reads `members`; owns `ACTIVE_RESTAURANT_COOKIE`. | `health_members`; cookie `faysal_active_cid`; host-pin via a Faysal domain map. |
| `lib/db/tenant-server.ts` | 22 | **FORK** | Server wrapper (host pin > cookie). | Trivial, follows the above. |
| `lib/db/require-tenant.ts` | 73 | **FORK** | The single server-side gate every console route uses, layering on top of RLS so a route fails **closed at the door** with a clear status. Its CSRF insertion point should keep importing the shared `lib/http/same-origin.ts`. | Health tenant resolver; `x-kivo-method` header name. |
| `lib/db/restaurants.ts` | 197 | **FORK** | **The webhook `phone_number_id` → tenant resolution is exactly what Faysal needs**, including the fail-closed rules (no match / not configured / blank ciphertext / decrypt failure all → null). | `health_clinics`; **delete the non-production "most recently created active tenant" fallback** rather than porting it (§1.1). |
| `lib/domains.ts` | 37 | **FORK** | Host → tenant mapping. | Faysal hosts. |

---

## 10. Dialect, output formatting, and the safety net

### 10.1 Dialect and formatting

| path | lines | verdict | why | if FORK: what must change |
|---|---:|---|---|---|
| `lib/util/arabic-digits.ts` | 37 | **SHARE** | ASCII ↔ Arabic-Indic conversion + input sanitisers. | — |
| `lib/util/customer-visible-format.ts` | 171 | **SHARE** | Digit style per dialect, the idempotent WhatsApp bold sanitiser, presentation formatting, `optionValueOnly`. Its only import from `lib/ai` is `dialectProfile` for digit style. | — |
| `lib/util/whatsapp-markup.ts` | 284 | **SHARE** | Tokenizer for WhatsApp markup + `isEmojiOnly`. The seven domain hits are example strings in comments. | — |
| `lib/ai/dialect.ts` | 191 | **FORK** | Two halves. The **resolver** (`dialectProfile`, `resolveTenantDialect(Detailed)`, `digitStyle`, `tenantCurrencyMismatch`, the `own`/`country`/`legacy-default` provenance) is fully neutral. The **`examples` block is restaurant copy** — «وش تحب تطلب اليوم؟», «المطعم مسكّر الحين». | Split: extract the resolver to a shared leaf (`lib/util/dialect-profile.ts`) and keep it SHARE; fork only the `examples` into `lib/health/dialect-examples.ts` with clinic anchors (greeting, appointment confirm, escalation, closed, no-slots-available). |

### 10.2 The safety net — grep for allergen/safety detectors

The single most important structural finding in this section: **`normalizeAr()` — the Arabic
normaliser every matcher in this repo depends on — lives inside `lib/ai/allergen-gate.ts`.**
**25 files under `lib/` and `app/` import `normalizeAr` from `lib/ai/allergen-gate`.** Faysal needs it on day one and must not import
from a food-allergen module.

> **SHARE\* (required before any Faysal Arabic matching):** extract `normalizeAr` to
> `lib/util/arabic-normalize.ts` and re-export it from `lib/ai/allergen-gate.ts` for
> compatibility. Behaviour-preserving, one file moved, no call site changed. Without it the
> §2.2 proof either fails on Faysal's first matcher or has to allow-list the allergen gate —
> and allow-listing the allergen gate is how the seam ends.

| path | lines | verdict | why | if FORK: what must change |
|---|---:|---|---|---|
| `lib/ai/symptom-frames.ts` | 36 | **SHARE** | *How Arabic reports a symptom*, first **and** third person, with a `NOT_A_PERSON` place list so «الجو فيه كتمة» is a room and not a chest. Zero domain coupling. **Transfers to a clinic with no edit.** | — |
| `lib/privacy/consent.ts` | 92 | **SHARE** | PDPL enforcement helpers. Zero domain terms. Encodes the right rule: in-conversation safety needs no consent (vital interest); marketing does. | — |
| `lib/ai/allergen-gate.ts` | 347 | **FORK** | The archetype: *a deterministic detector layer under the prompt, because escalation was proven model-stochastic.* Input gate (avoidance/euphemism + a domain term → force escalation) and output guard (the reply asserting safety when the data is unknown → intercept). | The lexicon becomes medical red flags and drug-allergy terms. Keep `hasAllergyIntent`'s euphemism handling and `assertsAllergenSafety`'s **output**-side interception — a booking agent asserting «الدكتور متفرغ» or «ما فيه خطر» without data is the same class of failure. Import `normalizeAr` from the extracted shared module. |
| `lib/ai/allergen-emergency.ts` | 237 | **FORK** | **The closest thing in this repo to a medical red-flag detector.** Present-tense "this is happening now", with narrow exclusions for past tense, hypotheticals and questions, and an explicit fail-safe posture: over-escalation is acceptable, missing an active emergency is not. | Symptom families become the clinic's: chest pain, breathing difficulty, uncontrolled bleeding, loss of consciousness, stroke signs, obstetric emergency, paediatric fever. **Keep `PAST_RE` / `HYPOTHETICAL_RE` / `HYPOTHETICAL_Q_RE` verbatim** and the 997 routing. |
| `lib/ai/allergen-gate-symptoms.ts` | 398 | **FORK** | Symptom detection built on `symptom-frames`. | New symptom lexicon; keep the frame source shared. |
| `lib/ai/allergen-context.ts` | 499 | **FORK** | Context classification with a **distinct reason per mode** (`allergy_marker` / `symptom` / `allergy_context`) that reaches `conversation_signals` so the false-positive rate is watchable **per mode**. That observability design is the asset. | New modes: `red_flag`, `symptom`, `history`. Keep the per-mode reason reaching a queryable table. |
| `lib/ai/safety-bridge.ts` | 61 | **FORK** | The one place that composes the detectors so callers cannot forget one. | Health detectors. |
| `lib/db/safety-hold.ts` | 23 | **FORK** | Conversation-level hold. | `health_conversations`. |
| `lib/db/safety-hold-guard.ts` | 67 | **FORK** | Refuses order confirmation while a hold is open. | Refuse **booking** confirmation while a triage hold is open. |
| `lib/settings/safety-flags.ts` | 69 | **FORK** | The denylist of feature flags **no console may flip**, because turning one off is a safety failure, not a tier choice. The doctrine is universal. | The flag names. Keep the "not flippable from ANY console, by anyone" rule. |
| `lib/ai/banned-words.ts` | 91 | **FORK** | Never-say list. | Clinic equivalents: never promise a diagnosis, never state a wait time as a fact, never say a doctor is available without checking. |
| `lib/ai/money-guard.ts` | 118 | **FORK** | Prevents the model inventing figures. | Consultation fees, insurance co-pay. The dossier's own 56-200 SAR marketplace figures are exactly the kind of number that must never be spoken as a tariff. |
| `lib/ai/phonetic-safety-net.ts` | 331 | **NEVER** | **Unwired by Founder ruling.** It fires on words that merely *sound* like a safety term — «موز»→«لوز», «جبن»→«لبن» — and turned the greeting «هلا والله» into an allergy consultation in front of the Founder. Faysal must not rewire it. Free coverage: `scripts/proof-phonetic-net-unwired.test.ts` walks `app/`, `lib/` and `components/` with **no directory allow-list**, so it covers `lib/health/*` from the day it exists. *(Carve-out: the pure helpers `levenshtein` / `stripAffix` are ordinary utilities and remain importable — that carve-out is already encoded in the proof.)* | — |
| `lib/ai/allergen-vocab.ts` | 230 | **NEVER** | Food allergen lexicon. | — |
| `lib/ai/allergen-canonical.ts` | 161 | **NEVER** | Canonical allergen mapping. | — |
| `lib/ai/allergen-companion.ts` / `-flow.ts` / `-scan-context.ts` / `allergen-prep-vocab.ts` / `dish-allergen-data.ts` / `memory-allergy-gate.ts` / `allergy-simple.ts` / `allergy-calm-hold.ts` / `prompt-allergy.ts` / `disease-diet-guard.ts` | — | **NEVER** (10 files) | Menu-item allergy companion: kitchen prep, cross-contact, per-dish data. Entirely restaurant. | — |
| `lib/privacy/record-consent.ts` | 75 | **FORK** | Tenant-scoped consent write. | Health tables; add the sensitive-category flag PDPL requires for health data. |

---

## 11. The proof / test harness, and the shared spend guard

### 11.1 Harness

| path | verdict | why |
|---|---|---|
| `scripts/run-unit-suite.mjs` | **SHARE** | Product-neutral. Runs **every** manifest entry with a 5-minute per-file timeout, prints a true tally, exits non-zero. Its header is the case for why an `&&` chain is not a suite. |
| `scripts/unit-suite.json` | **SHARE** | One manifest, 228 entries. Faysal appends its proofs here. **Caveat (§2.1): the CI job that runs it is `continue-on-error: true`,** so registration alone is reporting, not gating. |
| `scripts/ts-ext-loader.mjs`, `scripts/prompt-snapshot-loader.mjs`, `scripts/webhook-route-loader.mjs` | **SHARE** | Node loaders for extensionless imports, prompt snapshots and route loading. Faysal's entries use the same flags. |
| `scripts/proof-phonetic-net-unwired.test.ts` | **SHARE (as a template, and as live coverage)** | Supplies `stripComments()` and `bindingsFrom()`, both adversarially hardened with the defeating mutations recorded in comments. §2.2 reuses them rather than writing a new scanner. It also already covers `lib/health/*` (see §10.2). |
| `scripts/proof-tenant-isolation-report.md` | **SHARE (as the standard to meet)** | The route-by-route inventory of *how the caller tenant is determined and whether that determination is trustworthy*. Faysal owes an equivalent for `app/api/faysal/*` before go-live. |

### 11.2 The demo spend guard — a real sharing hazard, stated precisely

`kv_demo_try_consume(p_ip_bucket, p_global_bucket, p_ip_limit, p_global_limit)` takes its
bucket keys as **caller-supplied text**, so two products can share the table by namespacing
(`faysal:global:YYYY-MM-DD`). But:

> `demo_controls` is a **single-row table** (`id boolean primary key default true check (id)`),
> and the function reads it as `where c.id = true` with **no product parameter.** Sharing the
> RPC therefore shares the kill switch: disabling the Kivo demo disables Faysal's, and
> vice-versa.

| item | verdict | note |
|---|---|---|
| `demo_usage_counters` (table) | **SHARE** | Bucket keys are opaque text; namespace the prefix per product. |
| `kv_demo_try_consume` (function) | **FORK** | Add a `p_product text` parameter *or* create `kv_faysal_try_consume`. Do **not** silently share the switch. |
| `demo_controls` (table) | **FORK** | Faysal needs its own row/table so each product can be stopped independently. |
| the migration's grant idiom | **SHARE (copy verbatim)** | Both `revoke … from public` **and** `revoke … from anon, authenticated` are required on Supabase; neither implies the other. This gap shipped as a live hole once (`0113` → `0114`). |

---

## 12. REBUILD — what has no Kivo file to point at

Verified absent from the entire repo: no appointment, slot, calendar, doctor-roster,
insurance-eligibility or referral module exists.

| capability | why Kivo's version does not fit |
|---|---|
| **Appointment slots and capacity** | An order draft is a basket: no time dimension, no resource contention, no double-booking, no cancellation window. `lib/orders/transitions.ts` models a *kitchen* lifecycle. Rebuild. |
| **Doctor / specialty catalogue** | `menu_items` is superficially similar (name, category, active) and structurally wrong: a doctor has a schedule, a branch affinity, a gender preference that matters clinically and culturally, an insurance-network membership, and no price of their own. **Do not fork the menu.** |
| **Six-site routing** | `branches` exists and is close (name, address, lat/lng, hours JSONB with split shifts and prayer pauses), but Faysal's routing question is *"which of six sites offers this specialty, is open now, and is on this patient's insurance network"* — a three-way join Kivo never needed. Reuse the `hours` JSONB **shape** (it already handles the Friday compression the dossier documents); rebuild the routing. |
| **Insurance / TPA eligibility** | No analogue at all. CCHI codes, network class A/B/C, deductibles, per-card discount percentages. Nearest structural cousin is `restaurant_payment_methods`, and it is not close. |
| **Medical red-flag triage** | FORK of `allergen-emergency.ts` (§10.2) gets the *machinery*; the clinical content, the escalation ladder and the 997 routing are new and need clinical sign-off, not engineering judgement. |
| **Pre-employment screening packages** | A named group offering in the dossier. No analogue. |
| **Results / report notification** | Templates exist as a rail (`template-registry.ts`, SHARE); the content and the consent posture around notifying a patient that results are ready are new and PDPL-sensitive. |

---

## 13. Risks a reviewer should press on

1. **The `SHARE*` list is load-bearing and easy to skip.** Six files (§7.2, §8.2, §10.2)
   need small Kivo-side changes before Faysal can import them cleanly. If they are skipped,
   the §2.2 proof will fail on Faysal's first real commit and the tempting fix will be to
   allow-list `lib/ai/tools.ts` and `lib/ai/allergen-gate.ts` — which ends the seam. Land
   these first, as their own PR, before any Faysal code.

2. **§2.4 step 3 is the whole enforcement story.** A proof registered in `unit-suite.json`
   but absent from `agent-eval.yml`'s `paths:` filter does not run on a Faysal-only PR.

3. **The tenant recommendation costs five FORKs (§1.5).** That is real and is the honest
   price of a provable seam. Anyone who prefers Option B should say so *because* they accept
   58 unenforced filter sites, not because Option C looked expensive in isolation.

4. **This map does not classify all 308 `lib/` files.** The ~180 unlisted are Kivo console,
   ordering, delivery, payments, printing and menu-editor surfaces. They are NEVER by
   construction and are covered by deny-by-default in §2.2-B — which is why deny-by-default,
   not an enumerated ban list, is the right shape for the proof.

5. **Nothing here has clinical authority.** The triage content behind the FORK of
   `allergen-emergency.ts` needs a clinician's sign-off. This document scopes the machinery,
   not the medicine.
