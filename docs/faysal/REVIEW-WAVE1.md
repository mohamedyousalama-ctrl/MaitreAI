# REVIEW — WAVE 1 · فيصل / Faysal

**Role:** Reviewer (judgement, not defect-hunting — a separate auditor is doing that).
**Reviewed:** `SOURCE_DOSSIER.txt`, `SPEC-1-DOMAIN.md`, `SPEC-2-PERSONA.md`, `SPEC-3-REUSE.md`,
`SPEC-4-SAFETY.md` (4,794 lines), against the repo at `/home/user/MaitreAI`.
**Date:** 2026-09-09.

Every repo claim below was verified by opening the file. File and line references are exact.

---

## 1. Is this demoable, and would it win?

**Not as written. Read literally, these specs mint zero bookable slots at all six sites — not
just Complex 1 — and the demo expires on 9 October 2026.**

This is the finding that matters most, and it is a shaping problem, not a bug.

`bookableWindows()` (SPEC-1 L462–472) refuses unless the layer is `clinic`, confidence is
`high`/`medium`, `conflicts` is empty, and `capturedAt` is within `staleAfterDays` (30).
Invariant H4 (L488) then forbids a `facility` or `er` window from authorising a clinic slot:
*"where that layer is `unknown`, there are no slots, whatever the building's sign says."*

Now read §4.4 downward and ask which sites have an authored **clinic** layer:

| Site | Clinic layer as authored | Bookable? |
|---|---|---|
| `wattan-1` | the only clinic record in the dossier — §4.7 pins it `low` | **no** |
| `wattan-2` | **none authored.** §4.4 gives facility hours only ("mostly 24 hours") | **no** — H4 |
| `wattan-3` | facility hours from a 2024 Arabic guide; Friday `conflicted`; `capturedAt: "2024"` fails the staleness gate | **no** |
| `wattan-4` | nothing at all | **no** |
| `shoaa-wurud` | §4.4 marks clinic **`low`** explicitly | **no** |
| `shoaa-rawdah` | `low` — legacy pre-acquisition Mashfa page | **no** |

So Rule DOC-3 (L785) — *"the Wave 1 demo's bookable inventory sits at Ar Rawabi, Shoaa Al Wurud
and Shoaa Rawdah"* — is **not derivable from the spec's own invariants**. It requires promoting
facility hours to clinic hours at Rawabi, which is precisely what H4 exists to forbid, and it
ignores the `low` that §4.4 already stamped on Shoaa Al Wurud's clinic layer. Two of the three
named sites are ruled out by the same document three sections earlier.

And the staleness gate is absolute, not a downgrade: `capturedAt within staleAfterDays`. The
dossier is dated 9 September 2026. Show this demo on 10 October and every remaining window is
ineligible by construction. The specs have written a 30-day shelf life into the product.

**So: is "I don't know, let me confirm" a strength or a broken demo?**

Both, and the boundary is *frequency*. Said once or twice, against a background of competence,
it is the best thing in this entire pack. G5 —
«ما أبي أعطيك معلومة غير أكيدة وتطلع من بيتك على الفاضي» — is a sentence a Riyadh clinic
executive has wanted from their own call centre for twenty years, and it lands directly on the
complaint their own Google reviews name: unanswered phones and wasted trips (`[D §6 L271]`,
`[D §3.1 L125]`). Rule C4-1 booking the Shifa branch *out loud* as provisional is a genuinely
excellent scene, and no vendor they have met will have shown them anything like it.

Said six times out of six, it stops reading as integrity and starts reading as two things, both
fatal in the room: *"your data is bad"* and *"these people scraped us."* A COO does not
distinguish "epistemically careful" from "doesn't work." They see a bot that cannot book an
appointment at the clinic it claims to represent.

### What I would change, in order

1. **Get the clinic timetables before Wave 2 code, not after the demo.** `[OPEN-01]` and
   `[OPEN-03]` are one phone call to the group's operations lead, or one WhatsApp to
   050 449 0460. This is not a blocker to be worked around; it is a twenty-minute unblock that
   converts SPEC-1's entire epistemics apparatus from a liability into the feature it was
   designed to be. Do it first.

2. **Add a `client_confirmed` confidence tier that is bookable, dated on the day the client
   said it.** Today the ladder tops out at what a research dossier can support, and a research
   dossier can *never* support a clinic timetable — so there is nowhere to put the good answer
   when it arrives. SPEC-1 already reserves `PriceBasis: "client_confirmed"` and then notes
   nothing can reach it (§9.2). Same defect, twice. Give both a reachable top rung.

3. **Demo the honesty scene deliberately, at two sites only.** Ash Shifa (contested status) and
   Al Yamamah (24-hour building, clinic on shifts) are a devastating pair. Book normally
   everywhere else. One "I can't confirm that" is a differentiator; six is a product defect.

4. **If the client call genuinely cannot happen first:** seed the clinic layer with plausible
   split shifts, mark every one `demo_invented` at the data layer exactly as prices are, and
   have Faysal say so in-message once. Inventing hours *and labelling them invented* is honest.
   Refusing to book anything is not more honest — it is just less useful, and it fails the
   dossier's own instruction that the point is to stop patients wasting a journey.

**On SPEC-4 shipping the mental-health number blank: keep it blank.** That is the single
strongest trust signal in the pack, the precedent behind it is real
(`lib/ai/allergen-companion-flow.ts` — the Egyptian ambulance number), and it never surfaces in
a demo unless someone types self-harm language, which is not a scene anyone demos. But **tell
the executives it is blank on purpose**, out loud, on the call. A medical director will respect
that answer more than any feature in this document.

---

## 2. Is the scope right?

No — it is a Wave 3 scope with a Wave 1 deadline. The safety and honesty machinery is right-
sized. The domain machinery is roughly twice what a first demo needs.

### CUT

| Cut | Why |
|---|---|
| **Family blocks** (SPEC-1 §7.6, FAM-1..7) | Atomic multi-leg holds with per-leg window intersection is the most complex thing in SPEC-1. The gold transcript's turn 15 does not even use it — it books the mother's knee as a *separate* appointment near the daughter's. Two sequential bookings satisfy the demo. Wave 3. |
| **Resource / device contention** (§7.4) | `capacity: 1` inferred from one Google review naming a GentleMax Pro. Invisible in a demo; nobody will create the collision. |
| **The 11-insurer + 2-TPA + 3-directory payer catalogue** (§10.2) | Keep Rule INS-1 and `insurance.class_honesty` — that *is* the sales line. Cut the table to the four names a Riyadh patient actually says. The other seven are typing. |
| **Three of the five hours layers** | Author `clinic` and `facility`. `er`, `pharmacy` and `phone` are three more layers × six sites from a dossier that supports maybe two of them. Keep the type open; author two. |
| **`crossesMidnight` tail attribution** (§4.8) | Exists to handle one `conflicted` variant (13:00–07:00) at one site that mints nothing anyway. `close: "24:00"` is enough for Wave 2. |
| **~30 of the 40+ catalogue lines** (§9.3) | A demo needs about ten. Keep the PKG-1 `package6 === 5 × session` test — it is cheap and it is the right instinct. |
| **Post-visit follow-up, scene S12** | There is no approved template and no answer to SPEC-2 Q5. A scene that cannot fire is a scene that costs review time and ships nothing. |

### LOAD-BEARING — must stay

- The **entire red-flag rail**: detection pre-model, frozen copy, empty tool set on the rail
  turn, `composeFinalReply` skipped, no fuzzy matching in either channel (SPEC-4 §3.5, §4.1–4.3).
  This is what makes it a medical agent rather than a booking form, and it is the thing that
  wins the room if a medical director tests it live — which one of them will.
- The **denylist build guard** (DOC-4) and `fictional: true` as a literal type. Non-negotiable,
  and cheap. The full-name-not-token matching note in §6.4 is the kind of detail that saves the
  guard from being loosened at 2am; keep it.
- **Tri-state `unknown`** and the contested-site rules C4-1/2/3. This is the differentiator.
- The **two-marker price model** and PRICE-1's in-message label.
- **One `quote()`, one `resolveAvailability()`.** The single-calculator law, ported correctly.
- **Hold-then-confirm** with HOLD-4 (idempotent confirm) and HOLD-5 (re-validate the window at
  confirm). WhatsApp double-taps and ten-minute gaps are not hypothetical.
- **The seam proof** (SPEC-3 §2), including the string-level ban — see §4 below.
- **G1 and G5** as frozen strings. G5 is the product.

### Specified but a client will never notice

`crossesMidnight`; `SourceRef.dossierRef`; `legacy_map_id` vs `cchi_style_network_code`; the
POL-01 intersection rule; review-count min/max; and `Confidence: "conflicted"` as a state
distinct from `"low"` — they behave identically at every decision point. Keep the ones that cost
nothing (provenance fields), but do not budget engineering time against them.

### Missing, and obvious once named

1. **An operator surface.** SPEC-4 §4.4 requires an operator-maintained ER table with
   `hours_verified_at`, `verified_by` and a 30-day expiry alert. SPEC-4 §9.2 requires an operator
   console to open a thread under RLS. Neither is specified by anyone. Seed files carry a demo —
   but there is **nowhere to put the client's answer when they give it on the call**, which is
   exactly the moment a demo becomes a pilot. A one-screen hours editor is the cheapest thing in
   this review and has the highest leverage.
2. **The confirmation channel to the clinic.** See §5.
3. **What happens after «تم الحجز».** No reminder, no reschedule link, nothing. No-show rate is
   the number a clinic COO actually owns, and a reminder message is the single feature that moves
   it. It is also trivially demoable and currently absent from all four specs.
4. **Arabic name handling at the write.** SPEC-2 turn 13 asks the patient to correct the booking
   name against their ID; no spec owns the field, the normalisation, or what happens to
   «عبدالرحمن بن سعد» in a fixed-width confirmation.
5. **A one-page demo script.** 4,794 lines and nothing says what the salesperson types, in what
   order, for eight minutes. That is the actual Wave 1 deliverable for a *demo*, and it does not
   exist. Write it before the code; it will tell you which half of SPEC-1 you never needed.

---

## 3. Is the safety posture proportionate?

The twelve items in SPEC-4 §12 are correct **for a live product**, and SPEC-4 is right to make
them blocking. But its closing sentence — *"Until every row above is filled, this specification
describes a system that must not receive a real patient message. Shadow mode, with the rail
silent, is the only permitted deployment"* — is about **patients**, and if it is read as a
statement about the **demo** it blocks the demo on a paediatrician's signature that nobody in
this repo has. Split it explicitly, because right now the document does not.

### Before Al Wattan's executives see it — all cheap, none needs a clinician

1. **No real patient can reach it.** Host-gated exactly like `app/demo/page.tsx`
   (`isDemoHost`, `lib/demo/config.ts:239`), `noindex`, and **no Meta webhook wired to a real
   phone number**. The Faysal demo talks to a page, never to 050 449 0460. This is the whole
   safety argument for a demo and the repo already implements it.
2. **The rail fires, and it is real.** 997 on the first line, frozen copy, booking tools absent
   from the turn. Do **not** disable it for the demo. If a medical director types «ألم بالصدر»
   in the room, the rail firing correctly is the moment you win the deal. A demo with the rail
   off is a demo you can lose in one turn.
3. **The handoff claim is dropped on demo runs.** SPEC-4 §9.3 says this; the repo already does
   it (`emergencyReply(dialect, demoRun)`, `lib/ai/customer-turn.ts:512`). Verify, do not rebuild.
4. **Self-harm ships with the blank support slot** and never appears in the script.
5. **The denylist test is green** before any outsider sees a doctor name.
6. **The medical-claim output guard (§5.2) is live**, not deferred to Wave 3. It is the guard
   that stops a fluent model reassuring someone about a symptom, and fluency is exactly what a
   demo maximises.
7. **The disclaimer below, in all three places.**

### Before one real patient

All twelve of §12, plus the two SPEC-4 correctly defers to other owners and which take longer
than the client will expect: **24-hour P0 responder coverage** (§9.4 — "a rail that pages nobody
is a rail that lied") and the **shadow-mode false-positive measurement over ≥ 2,000 real
messages** (§3.4). Both are operational, not engineering. Say so on the call so the timeline
is the client's problem to solve, not a surprise you absorb later.

### Is there an honest demo posture without a clinician? Yes.

**The demo is a demonstration of a mechanism, not an offer of care.** Nothing in it is presented
as Al Wattan's fact; the rail is live *because turning it off would be the unsafe choice*; and no
route exists from the demo to a real patient. That posture requires a product decision, not a
licence.

### The disclaimer — exact text, exact placement

Three places, because they are read by different people and at different moments — the same
two-marker reasoning `lib/demo/config.ts` uses for `source` + `is_test`.

**(a) Page chrome, persistent** — a chip beside the brand, the way Kivo's «تجربة» chip sits in
`app/demo/DemoPhone.tsx`:

> **«عرض تجريبي — ليس قناة حجز فعلية لمجموعة الوطن الطبية»**
> *Demonstration — not a live booking channel for Al Wattan Medical Group.*

**(b) First message of every conversation, before Faysal's greeting, as a system line, not in
Faysal's voice:**

> **«هذا عرض تجريبي. الأطباء والمواعيد والأسعار المعروضة هنا افتراضية للعرض فقط، وغير معتمدة من مجموعة الوطن الطبية. للحجز الفعلي: 920009303 أو واتساب 0504490460. وللطوارئ: 997.»**
> *This is a demonstration. The doctors, appointments and prices shown are fictional and are not
> authorised by Al Wattan Medical Group. To book for real: 920009303 or WhatsApp 0504490460.
> Emergencies: 997.*

It must carry the **real** booking numbers. A demo that wears a clinic's name and offers no route
to the actual clinic is the version that could hurt someone.

**(c) On every confirmation block, alongside PRICE-1's existing price label:**

> **«حجز تجريبي — غير مسجّل لدى الفرع.»**
> *Demo booking — not registered with the branch.*

(c) is the one all four specs are missing and the one that matters most, because the confirmation
block is what gets screenshotted and forwarded.

**One free win:** put SPEC-4 §12 in front of the medical director **as a slide** — twelve items,
each with a named signatory role, none filled. No vendor they have met has ever shown them that
list. It is the strongest sales asset in this pack and it is currently filed as a launch blocker.

---

## 4. The tenant-table decision

**Agree with Option C.** All three cited hazards check out:

- `lib/db/restaurants.ts:174` — `resolveWebhookRestaurantId()` falls back, outside production
  with no `WHATSAPP_RESTAURANT_ID`, to `.eq("active", true).order("created_at", desc).limit(1)`.
  Seed a clinic in staging and the next unmatched inbound routes to it.
- `lib/monitoring/sweep.ts:197` iterates `from("restaurants").eq("active", true)` and fires a
  `delivery_silence` alert per tenant with the detail string
  «ما وصلنا أي رسالة من العملاء منذ N دقيقة **والمطعم مفتوح**» (line 224) — literally *"and the
  restaurant is open."* A clinic in that table pages the founder at 2am about a restaurant that
  does not exist. Worse than SPEC-3 claims, because the Arabic is hardcoded.
- `order_number_counters.restaurant_id` FKs `restaurants` on delete cascade
  (`supabase/migrations/0113_atomic_order_numbers.sql:32`); `next_order_number()` will mint order
  numbers for a clinic.

Counts verified: **58** files with `from("restaurants")`, **122** with `restaurant_id`.
(Migrations: 59 of 121 touch `restaurant_id`, not 65 of 119 — immaterial, but fix the number.)

**But none of those three is the reason to agree.** They are bugs with fixes. The reason is the
argument SPEC-3 buries in §1.2: **RLS scopes by membership, not by product.** Option B's
`product` filter has no database backstop — a founder who is a member of both tenants passes
`is_member_of()` for both — so all 58 call sites become load-bearing on a developer's memory,
forever, with no proof possible. This repo has already written down why that shape is
unacceptable (`scripts/proof-tenant-isolation-report.md`). Forty lines of duplicated SQL behind
an adversarial RLS proof is a smaller and, crucially, an **enumerable** risk than 58 unenforced
filters. Lead with that; the sweep and the resolver are illustrations, not the case.

The second-strongest point is under-sold and should be first on the client call: **health data is
legally different.** Separate tables give a separate retention policy, a separate deletion path
and a separate export you can point at in a PDPL or CBAHI conversation. You cannot derive those
with a `where` clause, and a Saudi DPO will ask.

The cost — five FORKs and one duplicated security primitive — is stated honestly and is worth
paying. Two conditions:

1. **Land the six `SHARE*` changes as their own Kivo-only PR before a single line of Faysal
   code.** SPEC-3 §13.1 flags this and it is the risk I would actually bet on materialising:
   skipped under deadline pressure, the seam proof fails on Faysal's first commit, and the
   tempting fix is to allow-list `lib/ai/tools.ts`. That ends the seam on day one.
2. **The string-level ban is the load-bearing half of the proof** (SPEC-3 §2.3 knows this).
   Supabase table names are strings; an import-graph scan cannot see `from("restaurants")`. The
   proof must grep for the literals `from("restaurants")` and `restaurant_id` under
   `lib/health/*` and `app/faysal/*`, **and** be registered in `agent-eval.yml`'s `paths:` filter
   (§13.2) so it runs on a Faysal-only PR. A proof that does not run is a comment.

One thing not to duplicate: do not fork `lib/settings/safety-flags.ts`'s doctrine into a second
list that can drift. "No console may flip a safety flag" should be one shared constant with two
flag sets, not two files with the same paragraph at the top.

---

## 5. The biggest risk nobody has named

> **Faysal has no write path into the system that actually decides whether a patient can be
> seen — and none of the four specs mentions that such a system exists.**

Verified: **zero** occurrences of PMS, HIS, EMR, EHR, practice-management, write-back, two-way,
bidirectional, or sync anywhere in `docs/faysal/`. NPHIES appears twice, both times as an
out-of-scope note about insurance eligibility (`[OPEN-07]`). SPEC-3 §12 lists "Appointment slots
and capacity" as REBUILD, but frames it entirely against Kivo's order draft — as a **data-model**
problem, never as an **integration** problem. SPEC-1 §7.2 makes availability *"generated, not
stored"* from a seeded PRNG.

For a demo that is correct and clever. For a pilot it is fatal, and the specs never notice the
transition.

Al Wattan has run six sites for forty years. One is CBAHI-accredited, they sit on eleven insurer
networks, they run pre-employment screening contracts for government agencies, and Shoaa ships
its own booking app on both stores. **There is a scheduler behind all of that.** On day one of a
pilot:

- every slot Faysal "confirms" is invisible to the reception desk that owns the room;
- every walk-in and phone booking reception takes is invisible to Faysal;
- the first collision is two patients in one chair, and the clinic blames the vendor, correctly.

Note the irony precisely: **4,794 lines were spent making certain Faysal never sends a patient to
a closed desk, and not one line on making certain it never sends two patients to the same open
one.** Double-booking is the failure that ends a pilot, it is structurally invisible in a demo,
and it appears in no spec, no acceptance criterion, and no auditor brief.

The second-order consequence is commercial and is the part that should worry the founder most:
**without a write path, Faysal is a triage-and-lead-capture funnel, not a booking agent.** That
is still a real product — the dossier says their loudest public complaints are unanswered phones
and waiting `[D §6 L271]` — but it is a *different* product, at a different price, sold to a
different buyer (marketing, not operations). Nobody has decided which one is being sold, and the
demo currently implies the one that is harder to deliver.

**Fix: one question on the client call, asked before the slot engine is built.**

> *"What system do your receptionists book into, and does it have an API?"*

Three branches, all survivable if you know which one you are in:
- **(a) It has an API.** Faysal writes into it; the slot generator becomes a cache and most of
  SPEC-1 §7 shrinks.
- **(b) It does not.** Faysal is honest about being a request queue.
  `appointmentKind: "callback_request"` becomes the *primary* path rather than the degraded one —
  and by luck SPEC-1 has already built that path properly, so this is a repositioning, not a
  rewrite.
- **(c) Each site runs something different.** The pilot is one site, and you should pick Shoaa
  Al Wurud (accredited, its own app, the group's showpiece).

### Runner-up, and it bites during the demo itself

Faysal's frozen greetings say «معك فيصل من **مجموعة الوطن الطبية**». Kivo's demo deliberately
does the opposite: a *synthetic* tenant, «مطعم الديرة (تجريبي)», plus a persistent «تجربة» chip
(`lib/demo/config.ts:13`, `app/demo/DemoPhone.tsx:7`). Faysal inverts that precedent — real
registered trade name, real branch addresses, real published phone numbers, invented doctors,
invented prices — and **no spec owns an in-conversation demo marker.** SPEC-1 §6.3 asks the *UI*
to carry one; the conversation, which is the artefact that gets screenshotted and forwarded on
WhatsApp with no chrome attached, carries nothing but a price caveat. Disclaimers (b) and (c) in
§3 close this. Do not ship without them.

### Two cross-spec conflicts worth naming here because they are in the demo script itself

Flagged for the auditor, but they sit in the **gold transcript**, which is the closest thing to a
demo script that exists:

- **Turn 7 names the device** — «جهاز GentleMax Pro» — which SPEC-1 Rule RES-1 forbids outright
  ("Faysal does not name the device to the patient"; the evidence is a Google review, not a spec
  sheet). SPEC-2's own data-slot table then lists `branch.devices` as a first-class slot. One of
  the two is wrong, and the transcript is currently demonstrating the forbidden behaviour.
- **Turn 10 offers a Friday slot with no branch phone number**, which SPEC-1 Rule FRI-1 requires
  on *every* Friday reply, "no exceptions, including at sites whose Friday confidence is
  `medium`" — and Rawabi is exactly that site.

---

## 6. Ship / don't ship

**Ship to build — after one change: get the clinic-session timetables from the client
(`[OPEN-01]` / `[OPEN-03]`) and add a bookable `client_confirmed` confidence tier. Without it
these specs, read literally, mint zero bookable slots at all six sites and the demo has nothing
to book.**

---

*End of REVIEW-WAVE1. This document is judgement, not a defect list; correctness findings belong
to the auditor.*
