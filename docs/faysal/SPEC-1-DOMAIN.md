# SPEC-1 — DOMAIN
## فيصل / Faysal — Al Wattan Medical Group booking agent
### Wave 1: domain specification. No application code.

**Status:** draft for audit · **Author:** Agent 1 (Domain) · **Date:** 2026-09-09
**Product:** Faysal — WhatsApp-first booking, sales and service agent for **Al Wattan Medical Group / مجموعة الوطن الطبية**, a six-site private ambulatory network in Riyadh.
**Scope of this file:** the domain model only — sites, hours, specialties, clinicians, slots, catalogue, insurance, and the rules that bind them. It defines shapes and laws. It ships no `.ts`, no seed data, no UI.
**Single source of truth:** `docs/faysal/SOURCE_DOSSIER.txt` (compiled 9 September 2026, 322 lines).

---

## 0. How to read this document

### 0.1 Citation convention

Every factual claim about Al Wattan carries a citation into the dossier:

> `[D §3.2 L138–139]` = SOURCE_DOSSIER.txt, dossier section 3.2, file lines 138–139.

Anything **not** citable to the dossier is tagged, and every tag is repeated in the Assumption Register (§13):

| Tag | Meaning | Binding on implementers |
|---|---|---|
| `[INF-nn]` | **Inference.** Reasoned from dossier facts but not stated by them. | May be built. Must remain visibly labelled in code comments and must not be spoken to a patient as an Al Wattan fact. |
| `[POL-nn]` | **Product policy.** A rule Faysal needs that the dossier has no opinion on (safety, escalation, tone). | Must be built. Not a claim about the client. |
| `[DEMO-nn]` | **Invented demo data.** Fabricated for the demo. | Must be built *and* labelled at runtime. |
| `[OPEN-nn]` | **Open question.** Cannot be resolved from the dossier; needs the client. | Must not be guessed. See §12. |

**Rule S-1 (provenance is data, not prose).** Every domain record carries its provenance in-band — `source`, `capturedAt`, `confidence`. Provenance that lives only in a comment gets separated from the value it qualifies and then lies. This is the failure documented at length in `lib/demo/config.ts` ("THIS SENTENCE IS THE ONE THAT GOES STALE… THREE times now it has kept a number the arithmetic above had already corrected"). Faysal's answer is structural: the qualifier is a field, so it travels with the value or the record does not compile.

### 0.2 What discipline we are borrowing from Kivo, and what we are not

Read before implementing: `lib/order-pricing.ts` and `lib/demo/config.ts`.

**Borrowed:**
1. **One calculator, no second opinion.** `recomputeOrderPricing()` is the only thing in Kivo that decides money, and the storefront, the WhatsApp brain and the proof test all call it. Faysal gets the same: one `resolveAvailability()`, one `quote()`. A price or a slot computed anywhere else is a bug, not a shortcut.
2. **Pure and deterministic.** No clock reads, no randomness, no I/O inside the calculators. `money()` rounds once, explicitly. Faysal's slot generator is seeded (§7.2) so the same day renders identically on the operator's laptop and the client's phone.
3. **Fail loud, never fall back.** `order-pricing.ts` throws `variant_required`, `delivery_zone_invalid`, `menu_item_unavailable` rather than guessing a price. Faysal throws rather than guessing an hour. There is no "probably open".
4. **Two markers, not one.** A Kivo demo order is stamped `source = 'demo'` **and** `is_test = true`, "because they are read by different things" (`config.ts` L176–179). Faysal's demo prices carry both a `priceBasis` enum and a rendered on-message label (§9.2).
5. **Bounded by construction.** `DEMO_MAX_CHARS`, `DEMO_GLOBAL_DAILY_TURNS`, `DEMO_SESSION_TTL_MS` — the demo's blast radius is a set of named constants, not a hope. Faysal gets `FAYSAL_BOOKING_HORIZON_DAYS`, `FAYSAL_HOLD_TTL_MS`, `FAYSAL_MAX_SLOTS_PER_REPLY`.

**Deliberately NOT borrowed:** `lib/types.ts` L489–505 models a branch's opening hours as `hours: string; // working hours` — one free-text field. For a restaurant that is a display string and the cost of it being wrong is a disappointed diner. For a six-site clinic network where one site's Friday status has been contested since 2023, a free-text hours field is the exact mechanism by which a patient is sent to a locked door. **Faysal's hours are structured, layered, tri-state and provenance-carrying (§4). This divergence is intentional and is the single most important design decision in this document.**

### 0.3 Two absolute prohibitions

**PROHIBITION A — no real clinicians.** The dossier names identifiable clinicians and staff harvested from public Google reviews and social posts [D §3.1 L125, §3.2 L146, §3.3 L160, §3.5 L194]. Those are real people. Placing a real, named, licensed clinician into a fabricated booking system, with invented availability, invented languages and invented consultation prices, is off-limits: it misrepresents a real professional's practice, and a patient who acted on it would be acting on a fiction attached to a real licence. **Every clinician in Faysal is invented (§6), and the real names are denylisted with a build-time guard (§6.4).**

**PROHIBITION B — no fabricated Al Wattan facts presented as Al Wattan facts.** The demo may invent (prices, clinicians, slots). It may not launder inventions into claims about the client's real business. Every invented value is labelled at the data layer and at the message layer.

---

## 1. Group identity

| Field | Value | Source |
|---|---|---|
| Legal name (EN) | Al Wattan Medical Group | `[D §2 L48–49]` |
| Legal name (AR) | مجموعة الوطن الطبية | `[D §2 L50–51]` |
| Legal form | Closed joint-stock company (شركة مساهمة مقفلة), Saudi Ministry of Commerce | `[D §2 L52–53]` |
| Group registered | 2000; operations at Complex 1 date to 1982 | `[D §2 L54–55]` |
| Footprint | Riyadh only — six ambulatory complexes, no confirmed branches elsewhere | `[D §1 L8]`, `[D §7 L277]` |
| Staff | 201–500 (LinkedIn) | `[D §2 L58–59]` |
| Care model | Ambulatory: outpatient clinics, diagnostics, ER, one-day surgery — **not** a large inpatient network | `[D §2 L62–63]`, `[D §7 L276]` |
| Second brand | Shoaa Medical Complex / مجمع شعاع الطبي — same ownership, own website and app | `[D §2 L64–65]`, `[D §3.5 L175]` |
| Pharmacy arm | Diyar Pharmacy / صيدلية الديار | `[D §2 L66–67]` |
| Group WhatsApp | +966 50 449 0460 (both brands) | `[D §1 L45]`, `[D §4 L212]` |
| Wattan unified line | 920009303 | `[D §1 L45]`, `[D §4 L211]` |
| Shoaa unified line | 920002258 | `[D §1 L38]`, `[D §4 L211]` |
| Group email | info@alwattanmed.com | `[D §1 L45]` |
| Websites | alwattanmed.com · shoaamc.com | `[D §1 L45]` |
| Values (published) | Trustworthy · Professionalism · Customer Oriented · Commitment · Quality | `[D §2 L71]` |

**Note on the unified number.** The dossier renders it three ways — `+966 92 000 9303` `[D §1 L45]`, `920 009 303` `[D §3.1 L107]`, `920009303` `[D §4 L211]`. These are one Saudi unified (920) number. Canonical stored form: `920009303`, `numberKind: "unified_920"`. Saudi 920 numbers are dialled nationally and are not reliably reachable in `+966` E.164 form from abroad `[INF-01]`. **Faysal offers the branch landline or the WhatsApp number to any patient who says they are calling from outside Saudi Arabia**, never the 920 line alone.

### 1.1 Brand model

`brand: "wattan" | "shoaa"` — one owner `[D §2 L64–65]`, two public identities with separate websites, separate unified numbers, and a mobile app on the Shoaa side only `[D §3.5 L175]`.

**Rule B-1.** Faysal is one agent across both brands. It never implies the two are unrelated companies, and it never markets one as an alternative *vendor* to the other. When it offers a Shoaa site to a patient who opened with "الوطن", it says so plainly: *«شعاع من نفس المجموعة»* — Shoaa is part of the same group `[D §7 L274]`.

**Rule B-2 (the search-collision guard).** The dossier is explicit that this brand collides in Arabic search `[D §7 L275, L277]`. Faysal must be able to disambiguate on request and must never claim these facilities:

| Not us | Distinguishing fact | Source |
|---|---|---|
| Al Watani Hospital / المستشفى الوطني | Different facility, phone 011 437 7777 | `[D §7 L275]` |
| المجمع الوطني الطبي, Qurayyat | Different city entirely | `[D §7 L275]` |
| Any Ministry of Health hospital | Al Wattan is private, ambulatory | `[D §7 L276]` |
| A "Watan" dental listing in Taif | Appeared in a third-party number dump; not this company | `[D §7 L277]` |
| Any branch in Jeddah / Dammam / outside Riyadh | No evidence exists | `[D §7 L277]` |

If a patient asks Faysal to book at any of the above, it says it cannot — it only serves Al Wattan Medical Group's six Riyadh sites — and does not offer a substitute facility.

---

## 2. Site schema

Proposed TypeScript shape, in markdown. Field-by-field, with what is nullable and why.

```
type SiteId =
  | "wattan-1" | "wattan-2" | "wattan-3" | "wattan-4"
  | "shoaa-wurud" | "shoaa-rawdah";

type Brand = "wattan" | "shoaa";

/** Tri-state everywhere a fact may simply be missing. NEVER a bare boolean. */
type Tri = "yes" | "no" | "unknown";

type Confidence =
  | "high"      // first-party (official site / official social) or Google listing, unconflicted
  | "medium"    // third-party directory or insurer PDF, unconflicted
  | "low"       // single stale/secondary source, or first-party but superseded
  | "conflicted"// two sources disagree and the dossier does not resolve them
  | "unknown";  // the dossier is silent

type SourceRef = {
  kind: "official_site" | "official_social" | "google_maps" | "insurer_pdf"
      | "directory" | "marketplace" | "legacy_site" | "review" | "dossier_only";
  note: string;            // human-readable, e.g. "X post 29 Jul 2026"
  dossierRef: string;      // REQUIRED. e.g. "§3.4 L171" — an auditor must be able to jump.
  capturedAt: string;      // ISO date the underlying source was observed, per the dossier
};

type PhoneKind = "primary" | "alt" | "fax" | "unified_920" | "whatsapp";
type Phone = {
  e164OrNational: string;
  kind: PhoneKind;
  confidence: Confidence;
  source: SourceRef;
  /** True when this number is documented but must NOT be given to a patient. */
  suppressed: boolean;
  suppressionReason?: string;
};

type Site = {
  id: SiteId;
  brand: Brand;
  nameAr: string;
  nameEn: string;
  akaAr?: string[];               // legacy/alternate Arabic names, for inbound matching
  akaEn?: string[];
  mapsCategory: "Hospital" | "Medical Center" | "Polyclinic" | "unknown";

  district: { ar: string; en: string };
  addressEn: string;
  addressAr: string | null;       // null where the dossier gives no Arabic form
  postalCode: string | null;
  landmarks: string[];            // free text, for "how do I find it"
  plusCode: string | null;        // null for 4 of 6 sites — the dossier only gives two

  phones: Phone[];

  established: { year: number; kind: "established" | "acquired" | "joined_group" };
  operatingStatus: OperatingStatus;   // §3.4 — this is where Complex 4 lives

  insurance: {
    facilityCode: string | null;
    codeKind: "cchi_style_network_code" | "legacy_map_id" | null;
    codeConfidence: Confidence;
    codeSource: SourceRef | null;
  };

  accreditation: {
    cbahi: "accredited" | "not_accredited_claimed_in_progress" | "unknown";
    cbahiDate: string | null;     // ISO, only when accredited
    source: SourceRef | null;
  };

  rating: {
    value: number | null;
    reviewCountMin: number | null;
    reviewCountMax: number | null;
    scale: "google_5" | "aggregator_5" | "marketplace_5" | "none";
    caveat: string | null;        // e.g. "small sample of booked visitors, not a global rating"
    /** HARD: ratings are routing signal only. Never rendered to a patient. See Rule RATE-1. */
    internalOnly: true;
  };

  amenities: {
    onSitePharmacy: Tri;
    pharmacyName: string | null;
    parking: Tri;
    parking24h: Tri;
    wheelchairAccess: Tri;
    accessEvidence: string | null; // what the Tri is actually based on — matters, see Rule ACC-1
  };

  hours: SiteHours;                // §4
  specialties: SiteSpecialty[];    // §5
  strengths: SiteStrength[];       // §5 — routing, with the one-line patient reason
};
```

**Why `Tri` and not `boolean` for amenities.** A boolean forces `unknown` to become `false`, and `false` for wheelchair access at a site where we simply have no data is a lie that a wheelchair user acts on. Absence must be representable. Same argument as §4's hours model, applied to the building.

**Rule ACC-1 (accessibility honesty).** `wheelchairAccess: "yes"` is only ever asserted where the dossier supports it, and Faysal states *what the evidence covers*. Complex 1's evidence is a Google Maps wheelchair icon `[D §3.1 L116–117]` — a listing icon that conventionally speaks to entrance access and says nothing about lifts, treatment rooms or restrooms `[INF-02]`. Faysal's line: *"the branch is listed as wheelchair accessible at the entrance; let me confirm parking and restroom access with reception for you"*. At the five sites where it is `unknown`, Faysal says it does not know and offers to check — it never guesses in either direction.

**Rule RATE-1 (ratings never reach the patient).** The dossier warns plainly that "Mid-3-star Google averages are typical for high-volume Riyadh polyclinics… they usually reflect waiting time, billing, and phone access" and that individual-doctor ratings run much higher than the building average `[D §6 L271]`. A star rating is therefore not a statement about care and must never be used as a reason to send a patient somewhere. Ratings stay in the record as a weak internal tie-breaker only. Faysal's routing reasons are capability, accreditation, geography and hours — never a number of stars. Corollary: Faysal never repeats a negative rating about a branch either.

---

## 3. The six sites

Values below are the authored records. `unknown` is written where the dossier is silent — it is **never** back-filled from a sibling site.

### 3.1 `wattan-1` — Al Wattan Medical Complex 1 / مجمع الوطن الطبي 1

| Field | Value | Source |
|---|---|---|
| Brand | wattan | `[D §1 L14–18]` |
| Name AR / EN | مجمع الوطن الطبي 1 / Al Wattan Medical Complex 1 | `[D §3.1 L95]` |
| Also known as | مستوصف الوطن عتيقة · Al Watan Polyclinic (older directories) | `[D §3.1 L95]` |
| Maps category | Hospital | `[D §3.1 L95]` |
| District | اليمامة / عتيقة — Al Yamamah / Atika | `[D §1 L16]`, `[D §3.1 L100–101]` |
| Address EN | 2807 Prince Mohammed bin Abdulrahman Road, Al Yamamah, Riyadh 12671 | `[D §3.1 L96–97]` |
| Address AR | 2807 طريق الأمير محمد بن عبدالرحمن، اليمامة، الرياض 12671 | `[D §3.1 L98–99]` |
| Landmarks | East of Atika market, Manfuha; the road is locally "شارع الستين / Street 60" | `[D §3.1 L100–101]` |
| Plus code | JP46+5C Al Yamamah, Riyadh | `[D §3.1 L95]` |
| Phones | **011 458 8444** primary (ext. 250) · 011 458 1913 alt/fax · 920009303 unified · 050 449 0460 WhatsApp | `[D §3.1 L104–107]` |
| Established | 1982 — oldest site in the group | `[D §3.1 L102–103]`, `[D §2 L85–86]` |
| Operating status | operational | `[D §3.1 passim]` |
| Insurance code | 18002, `cchi_style_network_code`, medium | `[D §3.1 L120–121]`, `[D §2 L84]` |
| Networks | MPN / OCN lists — Tawuniya-class, Amana, Al Jazeera Takaful | `[D §3.1 L121]` |
| CBAHI | not accredited; group claims work in progress group-wide | `[D §2 L84]` |
| Rating | 3.1, 1,447–1,499 reviews, google_5 — **internal only** | `[D §3.1 L110–111]`, `[D §6 L246–249]` |
| Pharmacy | yes — Diyar Pharmacy 1 / صيدلية الديار 1 | `[D §3.1 L118–119]` |
| Parking | yes, listed 24h | `[D §3.1 L114–115]` |
| Wheelchair | yes (Maps icon — see Rule ACC-1) | `[D §3.1 L116–117]` |

Note on the review count: the dossier gives a **range** (1,447–1,499) because different listing snapshots differ `[D §3.1 L111]`. The schema stores min and max rather than averaging them into a false precision.

### 3.2 `wattan-2` — Al Wattan Medical Complex 2 / مجمع الوطن الطبي 2

| Field | Value | Source |
|---|---|---|
| Brand | wattan | `[D §1 L19–23]` |
| Maps category | Medical Center; listing tagged "identifies as women-owned" | `[D §3.2 L129]` |
| District | الروابي — Ar Rawabi | `[D §1 L21]` |
| Address EN | 7291 Unayzah Street (شارع عنيزة), Ar Rawabi, Riyadh 14216 | `[D §3.2 L130–131]` |
| Address AR | *(not given in dossier — null)* | — |
| Plus code | MQRP+CR Ar Rawabi | `[D §3.2 L129]` |
| Phones | **011 496 4455** primary · 011 496 4439 alt/fax | `[D §3.2 L134–135]` |
| Established | 1999 | `[D §3.2 L132–133]`, `[D §2 L88]` |
| Insurance code | 18003 | `[D §3.2 L140–141]` |
| CBAHI | not accredited; in-progress claimed | `[D §2 L84]` |
| Rating | 3.4, ~1,056, google_5 — internal only | `[D §3.2 L136–137]` |
| Pharmacy / parking / wheelchair | **unknown** on all three | dossier silent |
| Marketing focus | Instagram @alwattanmedical, Facebook "مجمع الوطن الطبي 2" (~2,555 likes) — heavily markets dermatology/laser and dentistry | `[D §3.2 L142–145]` |

### 3.3 `wattan-3` — Al Wattan Medical Complex 3 / مجمع الوطن الطبي 3

| Field | Value | Source |
|---|---|---|
| Brand | wattan | `[D §1 L24–28]` |
| Also known as | مجمع الوطن الطبي الثالث; listed by some insurers as **Modern Medical Center** | `[D §3.3 L147–148]`, `[D §2 L90]` |
| District | الربوة — Ar Rabwah | `[D §1 L26]` |
| Address EN | Prince Mutaib bin Abdulaziz Road (طريق الأمير متعب بن عبدالعزيز), Ar Rabwah, Riyadh 12835 | `[D §3.3 L149–150]` |
| Plus code | unknown | dossier silent |
| Phones | **011 491 8003** primary · 011 497 4111 alt · 011 497 4114 alt · 011 493 3115 fax | `[D §3.3 L153–154]`, `[D §10 L303–305]` |
| Acquired | 2022 (previously an independent centre) | `[D §3.3 L151–152]`, `[D §2 L90]` |
| Insurance code | 17985 | `[D §3.3 L157–158]` |
| Rating | ~4.1 from an **aggregator**; ~460 Google reviews cited in a different snippet — sources do not match, `conflicted` | `[D §3.3 L148]`, `[D §6 L254–257]` |
| Pharmacy / parking / wheelchair | unknown | dossier silent |
| TPA note | Takaful Al Arabia-style card discounts published for this site: 30% consultation, 25% lab/radiology, 20% dental, 20% laser — **insurer/TPA promotional rates, not walk-in cash prices** | `[D §3.3 L161]` |

The rating field is the first place the schema earns its keep: the value comes from one source and the count from another, so `scale: "aggregator_5"`, `reviewCountMin/Max: 460`, `caveat: "rating and review count come from different sources"`, `confidence: "conflicted"`. It is internal-only anyway (Rule RATE-1), so nothing reaches a patient — but the record does not pretend.

### 3.4 `wattan-4` — Al Wattan Medical Complex 4 / مجمع الوطن الطبي 4 · **CONTESTED STATUS**

| Field | Value | Source |
|---|---|---|
| Brand | wattan | `[D §1 L29–33]` |
| District | الشفا — Ash Shifa; corner of Ibn Tulun and Ibn Taymiyyah | `[D §3.4 L162–163]` |
| Address EN | 7348 Ibn Tulun (ابن طولون), Ash Shifa, Riyadh 14721 — also given as Shifa, Ibn Taymiyyah Street | `[D §3.4 L164–165]` |
| Plus code | unknown | dossier silent |
| Phones | **011 497 7900** primary · *011 458 8444 — see warning below* | `[D §3.4 L168–169]` |
| Acquired | 2023 | `[D §3.4 L166–167]`, `[D §2 L92]` |
| Maps category | Polyclinic | `[D §6 L258–261]` |
| Rating | **not consistently indexed** — `scale: "none"`, value null | `[D §6 L258–261]` |
| Insurance code | **none published** — `facilityCode: null`, `codeConfidence: "unknown"` | dossier gives codes for the other five only `[D §2 L84]` |
| Insurance | Listed on Takaful Al Arabia with the same discount-card pattern as other Wattan sites; Bupa Arabia patients announced June 2024 | `[D §3.4 L172–173]`, `[D §3.4 L171]` |
| Pharmacy / parking / wheelchair | unknown | dossier silent |
| Hours | **completely unpublished** — see §4.6 | dossier silent |

**PHONE WARNING — encode this, do not leave it in prose.** The dossier records that group X posts have used **011 458 8444** for Shifa offers `[D §3.4 L168–169]` — that is Complex 1's primary line `[D §3.1 L104–105]`. Whether Shifa shares Complex 1's switchboard or the social post simply reused a house number is unknown. Therefore:

```
phones: [
  { national: "0114977900", kind: "primary", confidence: "medium", suppressed: false,
    source: { kind: "official_social", note: "Takaful / Bupa posts", dossierRef: "§3.4 L168-169" } },
  { national: "0114588444", kind: "alt", confidence: "conflicted", suppressed: true,
    suppressionReason:
      "This is Complex 1's primary line (§3.1 L104). Group X posts used it for Shifa offers. \
       Giving it as 'the Shifa number' may route a patient to a different branch." }
]
```

Faysal gives 011 497 7900 for Complex 4 and never gives the suppressed number as Shifa's.

#### 3.4.1 The Complex 4 status contradiction — stated, not resolved

The dossier contains three first-party or near-first-party datapoints that do not agree, and it explicitly declines to resolve them:

| # | Date | Source | Says | Dossier ref |
|---|---|---|---|---|
| 1 | 2023 | **Official website pages** | "Temporarily Closed" | `[D §3.4 L170–171]`, `[D §2 L92]` |
| 2 | 13 Jun 2024 | **Official X post** | Bupa Arabia patients are being received at Complex 4 | `[D §3.4 L171]`, `[D §9 L290]` |
| 3 | 29 Jul 2026 | **Official X post** | Orthodontics offer specifically "at Al Wattan Medical Complex – Shifa" | `[D §3.4 L171]`, `[D §9 L290]` |

The dossier's own guidance appears three separate times and is *not* "it is open". It is: *"Treat as reopened / operating unless reception says otherwise"* `[D §3.4 L171]`; *"For Shifa / south Riyadh, call Complex 4 first — website vs. social status has disagreed since 2023–2024"* `[D §8 L284]`; and in the closing line, *"the open/closed status of Complex 4 should be reconfirmed by telephone on the day of a visit"* `[D L322]`. A note in §9 adds that stale Arabic blogs recycle the 2023 "closed" text and that "newer first-party social posts supersede that on operating status" `[D §9 L292]`.

**We do not pick one.** The record encodes the disagreement:

```
operatingStatus: {
  state: "operational_contested",
  since: "2023",
  evidenceFor:    [ /* the two X posts, with dates */ ],
  evidenceAgainst:[ /* the 2023 website "Temporarily Closed" pages */ ],
  dossierGuidance: "Treat as operating unless reception says otherwise; call before travelling.",
  requiresLiveConfirmation: true
}
```

`OperatingStatus.state` ∈ `"operational" | "operational_contested" | "closed" | "unknown"`.

**Rule C4-1 — a contested site is bookable, but never silently.** Faysal may take a Complex 4 booking. It must, in the same message, (a) say the branch's status is being reconfirmed, (b) give 011 497 7900, and (c) mark the appointment `pendingBranchConfirmation`. It never renders a bare "confirmed" for `operational_contested`.

**Rule C4-2 — a contested site is never the only option offered.** Any reply that recommends Complex 4 also names a fallback (§5.3). A patient in south Riyadh who is offered only a branch that might be shut has been failed even if the branch turns out to be open.

**Rule C4-3 — the contradiction is never explained away to the patient.** Faysal does not say "the website is out of date". It has no basis for that. It says the branch is being confirmed and offers the phone number and an alternative.

### 3.5 `shoaa-wurud` — Shoaa Medical Complex / مجمع شعاع الطبي · **flagship, accredited**

| Field | Value | Source |
|---|---|---|
| Brand | shoaa | `[D §3.5 L174–175]` |
| Maps category | Hospital | `[D §3.5 L175]` |
| District | الورود — Al Wurud | `[D §1 L36]` |
| Address EN | King Abdullah Branch Road (طريق الملك عبدالله), Al Wurud, Riyadh 12254 | `[D §3.5 L176–177]` |
| Landmarks | "next to Diyar Pharmacy / near Sadhan markets" in older copy | `[D §3.5 L177]` |
| Plus code | unknown | dossier silent |
| Phones | **920002258** unified · **011 456 3777** direct · 050 449 0460 WhatsApp · 011 205 2613 fax | `[D §3.5 L180–181]` |
| Email | info@shoaamc.com | `[D §3.5 L182–183]` |
| Established | 1992 founded; joined group 2000; later renovated | `[D §3.5 L178–179]`, `[D §2 L87, L89]` |
| Insurance code | 18004 | `[D §3.5 L188–189]` |
| **CBAHI** | **accredited 13 March 2023** — the only accredited site in the group | `[D §2 L84]`, `[D §3.5 L175]`, `[D §2 L91]` |
| Rating | 3.5, ~2,684, google_5 — internal only | `[D §3.5 L186–187]` |
| Pharmacy | yes — "an in-house pharmacy" marketed on site | `[D §3.5 L194]` |
| Parking / wheelchair | unknown | dossier silent |
| Digital | Own website shoaamc.com + mobile app "مجمع شعاع الطبي" on App Store and Google Play | `[D §3.5 L175]` |
| Marketing claims | 45+ doctors, 10+ specialties, 290+ staff | `[D §3.5 L190–191]` |

Two care notes. First, the staffing figures are explicitly labelled "marketing figures on shoaamc.com" `[D §3.5 L191]` — Faysal never quotes them as counts. Second, the "next to Diyar Pharmacy" phrase is an **address landmark**, not evidence of an on-site pharmacy; the on-site claim rests separately on the site's own "in-house pharmacy" marketing `[D §3.5 L194]`. Recorded as `onSitePharmacy: "yes"`, `confidence: "medium"`, evidence noted as a first-party marketing claim.

### 3.6 `shoaa-rawdah` — Shoaa Medical Complex 2 / مجمع شعاع الطبي 2

| Field | Value | Source |
|---|---|---|
| Brand | shoaa | `[D §1 L39–43]` |
| Also known as | Mashfa Medical Center / مركز المشفى الطبي (almashfa.net still resolves to Shoaa 2 branding in places) | `[D §3.6 L195–196]` |
| Maps category | Medical Center | `[D §6 L266–269]` |
| District | الروضة — Ar Rawdah | `[D §1 L41]` |
| Address EN | Eastern Ring Branch Road (الطريق الدائري الشرقي الفرعي), Ar Rawdah, Riyadh 13213 | `[D §3.6 L197–198]` |
| Landmarks | "next to Modern Machinery Maintenance Co." (Tebcan) | `[D §3.6 L198]` |
| Plus code | unknown | dossier silent |
| Phones | **011 208 8585** primary · 920002258 unified · 011 445 3929 fax | `[D §3.6 L201–202]` |
| Acquired | 2022 | `[D §3.6 L199–200]`, `[D §2 L90]` |
| Insurance code | **17081**, `legacy_map_id`, low confidence — "older codes… in some maps" | `[D §3.6 L207–208]`, `[D §2 L84]` |
| Rating | 4.9 on **Tebcan**, small sample of booked visitors — explicitly *not* a Google global rating | `[D §3.6 L205–206]`, `[D §6 L266–269]` |
| Pharmacy / parking / wheelchair | unknown | dossier silent |

The 17081 code gets `codeKind: "legacy_map_id"` and `confidence: "low"` deliberately: the dossier lists 18002/18003/17985/18004 together as codes appearing in insurer PDFs, and sets 17081 apart as an older code on "some maps" `[D §2 L84]`. Treating it as equivalent to the other four would overstate it (§10.3).

**Rule PHONE-1 — never read out a fax.** Six of the numbers above are fax or unlabelled alternates. Faysal renders `kind: "primary" | "unified_920" | "whatsapp"` only. A fax number given to a patient as a booking line is a small failure with a large smell, and this dataset is full of them.

---

## 4. Hours — and the Friday problem

**This is the most operationally important section in the specification.** Six sites, six *different* epistemic situations about Friday, and one site with no published hours at all. The design goal is stated as a prohibition, not an aspiration:

> **Faysal must never be able to send a patient to a closed desk.**

Everything below follows from that plus one corollary: **"unknown" must be a first-class state, never a guess.** A model that can only say open or closed will say "open" for Complex 4, because that is the shape of a boolean's default. So the model does not have a boolean.

### 4.1 The schema

```
/** Riyadh is UTC+03:00 with no DST. Pinned; never derived from the server clock. [INF-03] */
const CLINIC_TZ = "Asia/Riyadh";

/** Operating week starts Saturday. Friday is the compressed day across this group. */
type DayKey = "sat" | "sun" | "mon" | "tue" | "wed" | "thu" | "fri";

/**
 * WHICH CLOCK. A facility open 24 hours does not mean the orthodontist is at the
 * chair at 03:00. Layers are separate records and are NEVER substituted for
 * one another. See Invariant H4 — this is the single likeliest way to build a
 * booking agent that sends someone to a dark corridor.
 */
type HoursLayer =
  | "facility"   // the building / reception
  | "er"         // emergency cover
  | "clinic"     // outpatient clinic sessions — the ONLY layer that can mint a slot
  | "pharmacy"
  | "phone";     // call-centre / switchboard

type TimeWindow = {
  open: string;             // "HH:MM", local, 24h
  close: string;            // "HH:MM"; "24:00" means end of this local day
  crossesMidnight: boolean; // true when close < open; the tail belongs to the NEXT day
};

type DayStatus = "open_24h" | "windows" | "closed" | "unknown";

type HoursConflict = {
  claimA: string;           // verbatim, as the dossier renders it
  claimB: string;
  dossierRefA: string;
  dossierRefB: string;
  resolution: "unresolved";  // the ONLY permitted value in Wave 1. We do not pick.
  agentBehaviour: string;    // what Faysal does about it, in one sentence
};

type DayHours = {
  status: DayStatus;
  windows: TimeWindow[];        // empty unless status === "windows"
  confidence: Confidence;
  sources: SourceRef[];
  conflicts: HoursConflict[];
  capturedAt: string;           // ISO — when the underlying source was observed
  /**
   * DERIVED, never authored. See bookableWindows(). A seed file that sets this
   * by hand fails the build. This is the same law as order-pricing.ts: the fee is
   * copied off the zone row, never typed into the order.
   */
  bookable?: never;
};

type LayerHours = {
  layer: HoursLayer;
  week: Record<DayKey, DayHours>;
  /** Ramadan / Eid / national-day overrides. Empty in Wave 1 — see [OPEN-04]. */
  overrides: DateOverride[];
};

type SiteHours = {
  siteId: SiteId;
  timezone: "Asia/Riyadh";
  layers: LayerHours[];
  /** Hours records rot. See Rule HRS-FRESH. */
  staleAfterDays: number;   // 30
};
```

### 4.2 The three functions (pure, deterministic, no clock reads)

```
/** INFORMATIONAL. Tri-state, because "we don't know" is an answer a patient can use. */
openStateAt(site, layer, instantLocal): "open" | "closed" | "unknown"

/**
 * BOOKABLE. Returns [] unless every one of these holds:
 *   - the layer is "clinic"
 *   - status is "open_24h" | "windows"
 *   - confidence is "high" or "medium"        (never low / conflicted / unknown)
 *   - conflicts is empty
 *   - capturedAt is within staleAfterDays
 *   - the site's operatingStatus is "operational"
 *     (for "operational_contested" the windows are returned but flagged; see Rule C4-1)
 * Returning [] is not an error state. It is the safe state.
 */
bookableWindows(site, dayKey, date): TimeWindow[]

/** The sentence Faysal is allowed to say about this day, and the action it must offer. */
hoursDisclosure(site, layer, dayKey): { ar: string; en: string; mustOfferCall: boolean }
```

`openStateAt` is tri-state and `bookableWindows` is conservative because they answer different questions. A patient asking *"are you open Friday?"* deserves the honest "the listing says 1pm, but let me confirm". A patient being handed a 13:30 Friday appointment deserves a slot nobody has to apologise for. Collapsing the two into one boolean is how a demo produces a locked door.

### 4.3 The five invariants

| # | Invariant | Why it exists |
|---|---|---|
| **H1** | No slot may be minted outside a window returned by `bookableWindows()`. | The core promise. |
| **H2** | `unknown` is **closed for booking, open for conversation**. Faysal may discuss a day it does not know; it may not sell one. | Keeps honesty and safety from fighting each other. |
| **H3** | **Friday is never inferred from any other day.** A missing Friday record is `unknown` — never copied from Thursday, never defaulted to the weekday pattern, never interpolated across sites. | This is *the* bug. Five of six sites have a Friday that differs from their own weekday pattern (§4.4). A generic scheduler that treats Friday as "another day" will be wrong at almost every site. |
| **H4** | A `facility` or `er` window **never** authorises a `clinic` slot. Clinic slots come from the `clinic` layer only; where that layer is `unknown`, there are no slots, whatever the building's sign says. | Complex 1 is marketed as 24 hours while the clinic pattern on record is two shifts `[D §3.1 L112–113, L126]`. A 24h facility with a duty doctor is not an open dermatology clinic. |
| **H5** | A site with `operatingStatus.state !== "operational"` cannot be the sole recommendation, and its bookings carry `pendingBranchConfirmation`. | Complex 4 (§3.4.1). |

**Rule HRS-FRESH (borrowed straight from `config.ts`).** Every `DayHours` carries `capturedAt`, and confidence **downgrades automatically** once `capturedAt` is older than `staleAfterDays` (30): `high → medium`, `medium → low`, and `low`/`conflicted` become unbookable. The dossier is dated 9 September 2026 `[D L322]` but the hours inside it were captured across 2023–2026 — a 2024 Arabic guide `[D §3.3 L155–156]` and a legacy pre-acquisition page `[D §3.6 L203–204]` are not fresh facts merely because a fresh document quotes them. `config.ts` documents what happens when a stale number outlives the paragraph that corrected it; here the decay is mechanical, so nobody has to remember.

### 4.4 Friday, site by site — six sites, six different problems

| Site | Sat–Thu (as published) | **Friday (as published)** | Friday confidence | The specific problem |
|---|---|---|---|---|
| `wattan-1` | Sun–Thu **and Sat**: open 24 hours `[D §3.1 L112–113]` | **13:00–24:00** commonly listed; **some sources 13:00–07:00 next day** `[D §3.1 L113]` | `conflicted` | Two different closing times from the same class of source (Google/Waze). One ends at midnight, one runs to 07:00 Saturday. |
| `wattan-2` | Mostly 24 hours `[D §3.2 L138–139]` | **16:00–24:00**, "often listed" `[D §3.2 L139]` | `medium` | Hedged wording ("often listed"), and the opening is three hours later than Complex 1's Friday. Nothing here is derivable from another site. |
| `wattan-3` | Sat–Thu **08:00–24:00** `[D §3.3 L155–156]` | **"Friday closed in one 2024 guide — verify, as other group sites run Friday afternoon"** `[D §3.3 L156]` | `conflicted` | The dossier flags its own source. One 2024 Arabic guide against the group's evident Friday-afternoon pattern. See §4.5. |
| `wattan-4` | **no published hours at all** | **no published hours at all** | `unknown` | Not "closed" — *silent*. Compounded by contested operating status (§3.4.1). See §4.6. |
| `shoaa-wurud` | Advertised **24/7 including ER**; call-centre copy sometimes lists Sat–Thu 08:00–21:00 for **phone inquiries** `[D §3.5 L184–185]` | Not separately stated; the 24/7 claim implies Friday, the phone-hours copy implies the switchboard is Sat–Thu only | `low` (clinic), `medium` (facility/ER) | A layer collision, not a contradiction: a 24/7 building whose *phone desk* may be shut Friday. Exactly what `HoursLayer` exists for. |
| `shoaa-rawdah` | **08:00–24:00** weekdays `[D §3.6 L203–204]` | **16:00–24:00**; ER until midnight `[D §3.6 L204]` | `low` | The only source is the **legacy Mashfa page** — i.e. hours published by the previous owner before the 2022 acquisition `[D §3.6 L195–196, L199–200]`. Plausible, unverified, and pre-dates the group's ownership. |

Read the Friday column downward: **13:00, 16:00, closed(?), unknown, 24/7(?), 16:00**. There is no group-wide Friday rule to encode. Any implementation that ships one is guessing, which is what Invariant H3 forbids.

Two further Friday facts the dossier states directly, both of which Faysal must act on:

- *"Call 011 458 8444 or WhatsApp 050 449 0460 before arriving on Friday; hours compress that day."* `[D §8 L280]`
- The header warning applies to the whole file: *"Hours, ratings and 'temporarily closed' flags change; always confirm by phone before visiting."* `[D §Preamble L5]`

**Rule FRI-1.** Every Friday reply from Faysal — booking, enquiry or directions — ends with the branch's phone number and an offer to confirm. No exceptions, including at sites whose Friday confidence is `medium`. The dossier gives this instruction twice; it is the client's own posture, not our caution.

### 4.5 The Complex 3 Friday contradiction — stated, not resolved

The dossier's exact wording is:

> `Hours (Arabic guide)` — *"Sat–Thu 08:00–00:00; Friday closed in one 2024 guide — verify, as other group sites run Friday afternoon"* `[D §3.3 L155–156]`

Note what the dossier is doing: it reports a source **and** flags the source as doubtful **and** gives the reason for doubt **and** stops short of overruling it. It does not say Complex 3 is open Friday. It says one guide says closed and that this sits oddly against the group pattern.

**We reproduce that posture exactly. We do not pick.**

```
wattan-3.clinic.week.fri = {
  status: "unknown",              // NOT "closed" — one 2024 guide is not a closure
  windows: [],
  confidence: "conflicted",
  capturedAt: "2024",
  sources: [ { kind: "directory", note: "2024 Arabic branch guide", dossierRef: "§3.3 L155-156" } ],
  conflicts: [{
    claimA: "Friday closed (one 2024 Arabic guide)",
    claimB: "Other group sites run Friday afternoon (Complex 1 from 13:00, Complex 2 from 16:00, Shoaa Rawdah from 16:00)",
    dossierRefA: "§3.3 L156",
    dossierRefB: "§3.1 L113, §3.2 L139, §3.6 L204",
    resolution: "unresolved",
    agentBehaviour:
      "Offer no Friday slot at Ar Rabwah. State that Friday is unconfirmed at this branch, \
       give 011 491 8003, and offer a Friday slot at a branch with a published Friday window \
       or a Saturday slot at Ar Rabwah."
  }]
}
```

**Why `unknown` and not `closed`.** They differ in what they let Faysal *say*. `closed` licenses "Ar Rabwah is closed on Fridays" — an assertion about the client's business resting on one guide the dossier itself distrusts, and one that costs the client a patient if wrong. `unknown` licenses only "I can't confirm Friday at Ar Rabwah — here's the number, and here's what I *can* book." Both refuse the Friday slot. Only one of them refuses to make a claim we cannot support. Under Invariant H2 they are identical for booking and different for conversation, which is precisely the distinction §4.2 exists to preserve.

Note also that under H3 the *counter-argument* is equally unusable: "other group sites run Friday afternoon" is a pattern, and a pattern is not this branch's hours. It is recorded as `claimB` so an auditor sees both sides, and it mints nothing.

### 4.6 Complex 4 — silence is not a schedule

The dossier publishes hours for five sites and none for Complex 4. Every layer is `unknown`, `confidence: "unknown"`, `sources: []`, and this is combined with `operatingStatus.state = "operational_contested"` (§3.4.1).

Consequences:

1. `bookableWindows()` returns `[]` for every day of the week at `wattan-4` — including days the sibling sites are plainly open. There is no fallback pattern to inherit from (H3, generalised).
2. Faysal can still take a Complex 4 request, because the dossier's own guidance is to treat it as operating `[D §3.4 L171]` and there is a live orthodontics campaign attached to it `[D §3.4 L171]`. It does so as a **callback request**, not a slot: it captures the patient's name, need and preferred window, states that the branch confirms the time by phone, and gives 011 497 7900. That path is `appointmentKind: "callback_request"`, distinct from `"slot"` — it does not consume slot inventory and never renders a time the patient could turn up for.
3. Rule C4-2 still binds: the reply also names a booking option elsewhere.

This is the shape the whole hours model exists to produce. A site with no hours and a disputed status yields **zero bookable minutes and a working conversation**, rather than a plausible-looking Tuesday 10:00 that nobody will be there for.

### 4.7 Complex 1 — the 24-hour claim versus the clinic shift

Two records for the same site:

- **Facility layer:** Sun–Thu and Sat open 24 hours; on-call doctor advertised at all times `[D §3.1 L112–113]`. Google markets the site as 24 hours `[D §3.1 L126]`. Parking listed 24h `[D §3.1 L114–115]`.
- **Clinic layer:** one Arabic guide lists split clinic hours **09:00–12:00 and 16:00–21:30**, plus Friday from 13:00, with a duty doctor around the clock — described as "the older 'clinic shift' pattern" `[D §3.1 L126]`.

`[INF-04]` — These are *probably* not a contradiction but two layers of the same operation: a 24-hour building with a duty doctor, and named outpatient clinics that run two sessions. That reading is coherent, it matches how Riyadh polyclinics commonly work, and it is exactly what `HoursLayer` was designed to express. **But the dossier presents them as competing accounts, one of which it calls "older", and we are instructed not to resolve conflicts by picking.** So the inference shapes the *schema*, not the *confidence*:

```
wattan-1.facility.week = { sat..thu: open_24h (high), fri: 13:00-24:00 (conflicted) }
wattan-1.clinic.week   = { sat..thu: windows [09:00-12:00, 16:00-21:30] (low),
                           fri: windows [13:00-24:00] (low) }
wattan-1.er.week       = { all: open_24h (medium) }   // "ER services at one or more sites" [D §2 L74-75]
```

The clinic layer is `low` because its only source is one Arabic guide the dossier flags as the older pattern. Under `bookableWindows()`, `low` mints nothing — so **Complex 1 has no bookable outpatient slots in Wave 1** despite being the group's flagship 24-hour site, and Faysal routes booking requests there to a callback while answering "are you open now?" truthfully from the facility layer. That is an uncomfortable result and it is the correct one: we would otherwise be inventing a clinic timetable for the group's busiest building. It is `[OPEN-01]`, first on the list for the client call.

Complex 1's Friday also carries its own conflict record: `13:00–24:00` versus `13:00–07:00 next day` `[D §3.1 L113]`. Both are stored, `resolution: "unresolved"`, and the **intersection** (13:00–24:00) is what any informational answer describes `[POL-01]` — the narrower claim is the one both sources support. The intersection is used for *disclosure only*; it does not upgrade confidence and it mints no slots.

### 4.8 Cross-midnight windows

Three sites publish windows ending at or past midnight `[D §3.1 L113]`, `[D §3.2 L139]`, `[D §3.6 L204]`, so this must be right in the model rather than patched later:

- `close: "24:00"` means end of the authored day. A Friday `13:00–24:00` window contributes no minutes to Saturday.
- `crossesMidnight: true` (when `close < open`, e.g. `13:00–07:00`) means the tail belongs to the **next** day and is attributed there for slot generation. A Friday 13:00–07:00 window makes Saturday 00:00–07:00 bookable-in-principle *only if Friday's own confidence permits* — which at Complex 1 it does not, because that variant is precisely the conflicted one.
- A slot may never straddle a window boundary: `slotStart + duration + buffer ≤ windowClose` (§7.3).

### 4.9 Ramadan, Eid and public holidays

The dossier says nothing about seasonal hours. Riyadh clinic hours shift substantially during Ramadan `[INF-05]`, and Eid closures are routine. `DateOverride[]` exists in the schema and is **empty** in Wave 1.

**Rule HRS-SEASON.** When the requested date falls inside a configured `volatilityWindow` (Ramadan, the two Eids, National Day) and no override exists, every affected day drops to `confidence: "low"` → unbookable, and Faysal switches to callback. Wave 1 ships the window dates as configuration with the overrides blank, so the guard exists before the data does. `[OPEN-04]`

---

## 5. Branch strengths and routing

### 5.1 What a "strength" may be built from

```
type SiteStrength = {
  siteId: SiteId;
  need: NeedKey;                 // what the patient asked for
  rank: 1 | 2 | 3;               // 1 = the group's own emphasis, 3 = geographic fallback
  basis: "group_marketing" | "accreditation" | "geography" | "hours" | "named_capability";
  reasonAr: string;              // ONE LINE, said to the patient
  reasonEn: string;
  dossierRef: string;            // REQUIRED — a strength with no citation cannot be authored
  gated?: "requires_status_confirmation" | "requires_hours_confirmation";
};
```

**Rule STR-1.** A strength must cite the dossier. No exceptions, and no strength may be built from a star rating (Rule RATE-1) or from a review of a named clinician (Prohibition A).

**Rule STR-2 — reasons are capability claims, never comparisons.** Faysal says *"this is the branch the group markets for laser"*. It never says *"their laser is better"*, *"the doctors there are stronger"* or *"that branch is rated higher"*. We have evidence about marketing, accreditation and geography. We have no evidence about clinical outcomes, and a booking agent has no business implying otherwise.

### 5.2 The routing table

| Need | Primary | Patient-facing one-liner (AR) | English gloss | Basis | Source |
|---|---|---|---|---|---|
| Dermatology / laser / aesthetics | `wattan-2` (Ar Rawabi) | «فرع الروابي هو الفرع اللي المجموعة تركّز فيه على الجلدية والليزر.» | "Ar Rawabi is the branch the group focuses on for dermatology and laser." | group_marketing | `[D §8 L282]`, `[D §3.2 L144–146]` |
| Dental / orthodontics | `wattan-2` (Ar Rawabi) | «الروابي فرع الأسنان والتقويم عندهم.» | "Ar Rawabi is their dental and orthodontics branch." | group_marketing | `[D §3.2 L145–146]`, `[D §8 L282]` |
| Endodontics / root canal | `wattan-3` (Ar Rabwah) | «الربوة عندهم عيادة علاج جذور (حشو عصب).» | "Ar Rabwah has an endodontics (root canal) clinic." | named_capability | `[D §3.3 L159–160]` |
| Accredited ambulatory care | `shoaa-wurud` (Al Wurud) | «شعاع الورود هو الفرع الحاصل على اعتماد المجلس السعودي CBAHI.» | "Shoaa Al Wurud is the branch holding Saudi CBAHI accreditation." | accreditation | `[D §2 L84]`, `[D §3.5 L175]`, `[D §2 L91]` |
| Day-case / one-day surgery | `shoaa-wurud` | «شعاع الورود يقدّم جراحات اليوم الواحد.» | "Shoaa Al Wurud offers day-case surgery." | named_capability | `[D §3.5 L194]`, `[D §2 L76]` |
| Employment / pre-employment medicals | `shoaa-wurud` | «شعاع الورود يسوّي فحوصات ما قبل التوظيف.» | "Shoaa Al Wurud does pre-employment medicals." | named_capability | `[D §3.5 L194]`, `[D §2 L77]` |
| Booking via a mobile app | `shoaa-wurud`, `shoaa-rawdah` | «فرعي شعاع لهم تطبيق جوّال للحجز.» | "The two Shoaa branches have their own booking app." | named_capability | `[D §3.5 L175]`, `[D §8 L283]` |
| Night / after-hours, ER | `wattan-1` (Al Yamamah) | «اليمامة مفتوح ٢٤ ساعة وفيه طوارئ وطبيب مناوب.» | "Al Yamamah is open 24 hours with an ER and a duty doctor." | hours | `[D §3.1 L112–113]`, `[D §3.1 L127]` |
| Neurology | `wattan-1` | «عيادة المخ والأعصاب مذكورة في فرع اليمامة.» | "The neurology clinic is listed at Al Yamamah." | named_capability | `[D §2 L82]`, `[D §3.1 L127]` |
| On-site pharmacy in the same visit | `wattan-1`, `shoaa-wurud` | «فيه صيدلية الديار بنفس المبنى.» | "There's a Diyar pharmacy in the same building." | named_capability | `[D §3.1 L118–119]`, `[D §3.5 L194]` |
| South Riyadh geography (Ash Shifa) | `wattan-4` **gated** | «عندنا فرع الشفا قريب منك — أأكّد لك دوامه وأرجع لك، وإلا أحجز لك في فرع ثاني الحين.» | "We have the Ash Shifa branch near you — I'll confirm its hours and come back to you, or book you elsewhere now." | geography | `[D §3.4 L162–165]`, gated by `[D §8 L284]` |
| Orthodontics, Ash Shifa | `wattan-4` **gated** | «فيه عرض تقويم معلن على فرع الشفا — أتأكد لك منه.» | "There's an advertised orthodontics offer at the Shifa branch — let me confirm it for you." | group_marketing | `[D §3.4 L171]`, `[D §9 L290]` |
| East Riyadh geography (Eastern Ring) | `shoaa-rawdah` | «فرع الروضة على الدائري الشرقي.» | "The Ar Rawdah branch is on the Eastern Ring Road." | geography | `[D §3.6 L197–198]` |

Note that the two Complex 4 lines are the only ones in the table that promise a *callback* rather than a booking, and both carry `gated: "requires_status_confirmation"`. That gate is Rule C4-1 rendered as data.

### 5.3 Fallback chains

When the primary is unbookable — hours `unknown`, status contested, or the patient can't reach that district — Faysal falls back **within the same need**, never across needs:

| Need | Chain |
|---|---|
| Derm / laser | `wattan-2` → `shoaa-wurud` (markets laser/aesthetics `[D §3.5 L194]`) → `wattan-3` (laser implied by its TPA discount schedule, `[INF-06]`) |
| Dental / ortho | `wattan-2` → `wattan-3` → `shoaa-wurud` `[D §3.5 L194]` → `wattan-4` *(gated)* |
| Paediatrics | `shoaa-wurud` `[D §3.5 L194]` → `wattan-2` `[D §3.2 L146]` → `wattan-1` `[D §3.1 L127]` |
| OB-GYN / women's health | `wattan-2` `[D §3.2 L146]` → `shoaa-wurud` `[D §3.5 L194]` |
| ENT | `wattan-2` `[D §3.2 L146]` → `shoaa-wurud` `[D §3.5 L194]` |
| Urgent / tonight | `wattan-1` (24h + ER) → `shoaa-wurud` (24/7 claim, `medium`) — **and** the red-flag path in §11 takes precedence over both |
| Ash Shifa / south | `wattan-4` *(gated)* → `wattan-1` (Al Yamamah, the group's other southern-quadrant site `[INF-07]`) |

**Rule STR-3.** A fallback is offered *with its reason*: "Ar Rawabi is where they focus on laser, but Friday there starts at 4pm — want Saturday at Ar Rawabi, or shall I look at Shoaa Al Wurud today?" A silent substitution is how a patient ends up in the wrong district.

---

## 6. Specialties and clinicians

### 6.1 Specialty evidence model

The dossier gives a group-wide specialty list `[D §2 L82]` and *separate*, shorter, per-site lists. Those are different kinds of claim and the schema keeps them apart:

```
type SpecialtyEvidence =
  | "named_at_site"   // the dossier names this specialty AT this site
  | "group_only"      // listed group-wide, not attributed to this site
  | "inferred"        // deduced from other site facts; carries an [INF-nn]
  | "absent";

type SiteSpecialty = {
  siteId: SiteId;
  specialty: SpecialtyKey;
  evidence: SpecialtyEvidence;
  dossierRef: string | null;
  /** DERIVED: true only when evidence === "named_at_site" AND clinic hours are bookable. */
  bookable?: never;
};
```

**Rule SPEC-1.** Only `named_at_site` is bookable. `group_only` and `inferred` are *conversational*: "the group lists urology across its complexes — let me confirm which branch runs that clinic and come back to you." This is Invariant H2 applied to capability instead of time, and for the same reason: the group offering ophthalmology somewhere is not evidence that Ar Rawdah has an ophthalmologist on Tuesday.

### 6.2 The matrix

`N` = named at site · `G` = group-wide only · `I` = inferred (see note) · `—` = no evidence

| Specialty | W1 Yamamah | W2 Rawabi | W3 Rabwah | W4 Shifa | Shoaa Wurud | Shoaa Rawdah |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| General / family medicine | N | N | I¹ | G | N | G |
| Internal medicine | N² | N | G | G | N | G |
| Paediatrics | N² | N | G | G | N | G |
| OB-GYN | N² | N | G | G | N³ | G |
| ENT | G | N | G | G | N | G |
| Ophthalmology | G | N | G | G | G | G |
| Dermatology (medical) | G | N | I¹ | G | N⁴ | G |
| **Laser / aesthetics** | G | **N** | I¹ | G | N⁴ | G |
| Dentistry (general) | G | N | N | G | N | G |
| **Orthodontics** | G | **N** | G | **N⁵** | G | G |
| Endodontics (root canal) | — | G | **N⁶** | — | G | — |
| Orthopaedics | G | G | G | G | G | G |
| **Neurology** | **N⁷** | — | — | — | G | — |
| Urology | G | G | G | G | G | G |
| General surgery / day-case | G | G | G | G | **N** | G |
| Emergency (ER) | **N** | G | G | — | **N** | **N⁸** |
| Laboratory + radiology | **N** | G | I¹ | G | G | G |
| Employment medicals | G | G | G | G | **N** | G |
| Sterilisation / CSSD | **N** | G | G | G | G | G |
| Pharmacy (on site) | **N** | — | — | — | **N** | — |

Footnotes:
1. `[INF-06]` — Complex 3's published Takaful discount schedule prices **consultation, lab/radiology, dental and laser** `[D §3.3 L161]`. A TPA does not publish a discount for a service the site does not provide, so those four capabilities are inferred present at Ar Rabwah. Inferred, therefore not bookable (Rule SPEC-1).
2. From "family-wide specialties" plus the explicit neurology and ER mentions at Complex 1 `[D §3.1 L127]`. Recorded as `named_at_site` at the *category* level only; the individual clinic still needs the clinic-hours layer, which at Complex 1 is `low` (§4.7).
3. Shoaa Al Wurud's OB-GYN is evidenced by a patient review referencing an OB-GYN consultant `[D §3.5 L194]`. The **capability** is recorded; the **clinician** is not (Prohibition A).
4. "laser/aesthetics" marketed at Shoaa Al Wurud `[D §3.5 L194]`.
5. Complex 4 orthodontics from the 29 July 2026 official X offer `[D §3.4 L171]` — `named_at_site` but gated behind `operatingStatus` and unknown hours, so still unbookable in Wave 1.
6. Endodontics at Ar Rabwah, from the group's own Facebook announcement of an addition to the Rabwah dental team `[D §3.3 L159–160]`. The **capability** is recorded; the named clinician is not.
7. Neurology at Complex 1 `[D §2 L82]`, `[D §3.1 L127]`.
8. Shoaa Rawdah ER "until midnight" on the legacy Mashfa page `[D §3.6 L204]` — `named_at_site` but `low` confidence, pre-acquisition source.

The matrix is mostly `G`. That is not a gap in the research; it is what the dossier actually supports, and Rule SPEC-1 turns it into "let me confirm" rather than into a confident booking. `[OPEN-02]` is the request for the client's real per-branch clinic list, and it is the single highest-value thing they can hand us.

### 6.3 Clinicians — **ALL NAMES BELOW ARE FICTIONAL**

> **The clinicians in this specification do not exist.** Every name, gender, language set, site assignment and schedule below is invented for demonstration purposes. None corresponds to any real person practising at Al Wattan Medical Group, Shoaa Medical Complex, or anywhere else. Any resemblance to a real clinician is unintended. This notice must be reproduced in the seed file header, and the demo UI must carry a visible equivalent (§9.2).

**Why invented, in one paragraph, because an auditor will ask.** The dossier names real clinicians and a nurse, harvested from public Google reviews and the group's own social pages `[D §3.1 L125]`, `[D §3.2 L146]`, `[D §3.3 L160]`, `[D §3.5 L194]`. Those are identifiable licensed professionals. Wiring them into a fake booking system would attach invented availability, invented languages and invented consultation fees to a real person's professional name, and would put a patient in the position of choosing a real doctor on the strength of a fabricated schedule. The names' appearance in public reviews makes them public; it does not make them ours to schedule.

`[DEMO-01]` — the entire roster.

```
type Clinician = {
  id: string;                    // "dr-<slug>"
  nameAr: string; nameEn: string;
  gender: "female" | "male";     // patients frequently request a female clinician — first-class
  specialty: SpecialtyKey;
  subSpecialties: SpecialtyKey[];
  languages: ("ar" | "en" | "ur" | "fr")[];
  siteIds: SiteId[];             // may serve more than one site
  seniority: "consultant" | "specialist" | "general_practitioner";
  fictional: true;               // literal type. A false value does not compile.
};
```

| id | Name (AR) | Name (EN) | Gender | Specialty | Languages | Site(s) |
|---|---|---|---|---|---|---|
| dr-aldosari | د. عبدالله الدوسري | Abdullah Al-Dosari | M | Internal medicine | ar, en | wattan-1 |
| dr-alotaibi | د. منيرة العتيبي | Munirah Al-Otaibi | F | Family medicine | ar, en | wattan-1 |
| dr-alshammari | د. طارق الشمري | Tariq Al-Shammari | M | Emergency medicine | ar, en | wattan-1 |
| dr-hegazy | د. ياسمين حجازي | Yasmin Hegazy | F | Paediatrics | ar, en | wattan-1 |
| dr-alqahtani | د. سامي القحطاني | Sami Al-Qahtani | M | Neurology | ar, en | wattan-1 |
| dr-albaqami | د. ريم البقمي | Reem Al-Baqami | F | Dermatology & laser | ar, en | wattan-2 |
| dr-alkhatib | د. لينا الخطيب | Lina Al-Khatib | F | Dermatology & laser | ar, en, fr | wattan-2 |
| dr-almutairi | د. فهد المطيري | Fahd Al-Mutairi | M | Orthodontics | ar, en | wattan-2, wattan-4 |
| dr-alharbi | د. نورة الحربي | Noura Al-Harbi | F | General dentistry | ar, en | wattan-2 |
| dr-alghamdi | د. عمر الغامدي | Omar Al-Ghamdi | M | ENT | ar, en | wattan-2 |
| dr-saadeldin | د. أميرة سعد الدين | Amira Saad El-Din | F | OB-GYN | ar, en | wattan-2 |
| dr-alzahrani | د. بدر الزهراني | Badr Al-Zahrani | M | Ophthalmology | ar, en | wattan-2 |
| dr-mansour | د. هالة منصور | Hala Mansour | F | Paediatrics | ar, en | wattan-2 |
| dr-alansari | د. وليد الأنصاري | Waleed Al-Ansari | M | Endodontics | ar, en | wattan-3 |
| dr-alsaleh | د. دانة الصالح | Dana Al-Saleh | F | General dentistry | ar, en | wattan-3 |
| dr-alsubaie | د. ماجد السبيعي | Majed Al-Subaie | M | General / internal medicine | ar, en, ur | wattan-3 |
| dr-benyoussef | د. عائشة بن يوسف | Aisha Ben Youssef | F | Dermatology (medical) | ar, en, fr | wattan-3 |
| dr-alnuaimi | د. إبراهيم النعيمي | Ibrahim Al-Nuaimi | M | Orthodontics | ar, en | wattan-4 |
| dr-altayeb | د. سلمى الطيب | Salma Al-Tayeb | F | Family medicine | ar, en | wattan-4 |
| dr-alajmi | د. راكان العجمي | Rakan Al-Ajmi | M | General dentistry | ar, en | wattan-4 |
| dr-alhamdan | د. عبدالرحمن الحمدان | Abdulrahman Al-Hamdan | M | General surgery / day-case | ar, en | shoaa-wurud |
| dr-binomar | د. ليلى بن عمر | Layla Bin Omar | F | OB-GYN | ar, en | shoaa-wurud |
| dr-alshehri | د. مها الشهري | Maha Al-Shehri | F | OB-GYN | ar, en | shoaa-wurud |
| dr-alhalabi | د. زياد الحلبي | Ziad Al-Halabi | M | ENT | ar, en | shoaa-wurud |
| dr-abdeljalil | د. أنس عبد الجليل | Anas Abdel-Jalil | M | Paediatrics | ar, en, ur | shoaa-wurud |
| dr-alqarni | د. رنا القرني | Rana Al-Qarni | F | Dermatology & laser | ar, en | shoaa-wurud |
| dr-bashir | د. عثمان بشير | Othman Bashir | M | Occupational / employment medicals | ar, en, ur | shoaa-wurud, shoaa-rawdah |
| dr-aldakhil | د. هيفاء الدخيل | Haifa Al-Dakhil | F | Paediatrics | ar, en | shoaa-rawdah |
| dr-alnour | د. مصعب النور | Musab Al-Nour | M | Internal medicine | ar, en | shoaa-rawdah |
| dr-alfahad | د. جواهر الفهد | Jawaher Al-Fahad | F | General dentistry | ar, en | shoaa-rawdah |

30 clinicians; 15 female, 15 male; every site carries at least four (Al Yamamah 5, Ar Rawabi 8, Ar Rabwah 4, Ash Shifa 4, Shoaa Al Wurud 7, Shoaa Ar Rawdah 4) and at least one female clinician. Two work across sites (`dr-almutairi` at Rawabi + Shifa, matching the Shifa orthodontics campaign; `dr-bashir` across both Shoaa sites), which exercises multi-site scheduling in the demo.

Roster construction notes, all `[DEMO-01]`:
- The specialty mix mirrors the dossier's per-site emphases: Rawabi is derm/laser and dental-heavy `[D §3.2 L146]`; Rabwah carries the endodontics capability `[D §3.3 L160]`; Al Yamamah carries neurology and emergency medicine `[D §3.1 L127]`; Shoaa Al Wurud carries day-case surgery and employment medicals `[D §3.5 L194]`.
- Name stock is Saudi and Arab-expatriate (Egyptian, Levantine, Sudanese, Tunisian), which is the realistic staffing mix for a Riyadh private polyclinic `[INF-08]`. Urdu is on three clinicians reflecting Riyadh's South Asian patient population `[INF-08]`. Both are demo colour and are labelled as such.
- Every OB-GYN in the roster is female, and both derm/laser sites have female clinicians, because a female-clinician request is one of the most common real filters in this market `[INF-09]` and the demo must be able to satisfy it rather than apologise for it.

**Rule DOC-1 — gender is a filter, never a recommendation.** Faysal offers a female clinician when asked, and lists both when not asked. It never volunteers gender as a reason to prefer one clinician, and never infers a preference from the patient's name or wording.

**Rule DOC-2 — no credentials Faysal cannot support.** The roster carries specialty and seniority only. Faysal never states a licence number, a university, years of experience, or a sub-specialty certification. Those would be pure fabrication dressed as credentials, which is the most harmful possible class of invented data in a medical context.

**Rule DOC-3 — availability is bounded by hours.** A clinician may only be scheduled inside `bookableWindows(site, "clinic", day)`. Given §4.7 and §4.6, that means the Wave 1 demo's bookable inventory sits at Ar Rawabi, Shoaa Al Wurud and Shoaa Rawdah (subject to their own confidences), with Al Yamamah, Ar Rabwah-Friday and Ash Shifa exercising the callback and verify paths. **This is the demo's most valuable scene, not a limitation to engineer around.**

### 6.4 The denylist guard — build-time, not a review checklist

These names appear in the dossier as real people `[D §3.1 L125]`, `[D §3.2 L146]`, `[D §3.3 L160]`, `[D §3.5 L194]`:

> Heba Ahmed · Ahmed Sayed Mustafa · Noreen · Huda Al-Rashidi · Sarah Al-Jundi · Hanan Ali
> (and their Arabic renderings: هبة أحمد · أحمد سيد مصطفى · نورين · هدى الرشيدي · سارة الجندي · حنان علي)

**Rule DOC-4.** A test in the Faysal suite scans all seed data, prompt templates and fixtures for these strings — Arabic and Latin, diacritic-normalised using the same `norm()` treatment `lib/order-pricing.ts` L99–105 applies to Arabic menu matching — and **fails the build** on any hit. A prohibition that lives only in a review comment gets forgotten at 2am by someone adding a doctor; a failing test does not. `[POL-02]`

Note also that the Faysal seed roster is checked against the denylist *by construction*: no given name and no family name above is shared with any denylisted entry.

**Implementation gotcha, found while validating this roster.** The match must be on the **full name string** (normalised), not on tokens. A naive token matcher flags the particle «ال» / "al" in *Ahmed Sayed Mustafa* against 23 of the 30 invented names and fails the build on every one of them — after which someone loosens the test, and the guard is gone. Match full names; normalise diacritics, «ال» prefixes, hamza forms and whitespace on both sides first.

---

## 7. Slot model

### 7.1 States

```
type AppointmentKind = "slot" | "callback_request";

type SlotState =
  | "offered"    // shown in a WhatsApp reply. NOT reserved. Costs nothing.
  | "held"       // reserved for one patient, TTL-bounded
  | "confirmed"  // booked
  | "expired"    // hold TTL elapsed; inventory returned
  | "cancelled"
  | "checked_in"
  | "no_show";
```

**Rule SLOT-1 — offering is not holding.** Faysal shows up to `FAYSAL_MAX_SLOTS_PER_REPLY` (3) options without reserving any. A WhatsApp conversation that reserved every option it displayed would drain a clinic's day in ten conversations.

### 7.2 Deterministic generation

Availability in the demo is **generated, not stored** — but generated deterministically, so the same query returns the same day forever and the salesperson's screen matches the client's phone.

```
seed = fnv1a32(`${siteId}|${clinicianId}|${dateISO}|${FAYSAL_SLOT_SALT}`)
rng  = xorshift32(seed)          // pure; no Math.random anywhere in the slot path
```

Generation, in order:
1. Take `bookableWindows(site, "clinic", day)`. **Empty ⇒ no slots.** This is the gate everything else sits behind; there is no path that mints a slot without passing it (Invariant H1).
2. Lay a **15-minute grid** across each window, aligned to the window's `open`.
3. Drop grid points that cannot fit `duration + buffer` before `close` (§7.3, §4.8).
4. Mark each remaining point busy with probability `p(site, weekday, hour)` — a fixed, documented, deterministic occupancy curve, denser at 09:00–11:00 and 17:00–20:00 `[INF-10]`, which are the peaks implied by Complex 1's published clinic-shift pattern `[D §3.1 L126]`.
5. Subtract holds and confirmed appointments from the live demo store.
6. Subtract device/room reservations (§7.4).

`FAYSAL_SLOT_SALT` is a pinned constant, never accepted from a request — the same posture as `DEMO_RESTAURANT_ID` in `lib/demo/config.ts` L13. A caller-supplied salt is a caller-supplied schedule.

Demo bounds, all named constants:

| Constant | Value | Why |
|---|---|---|
| `FAYSAL_BOOKING_HORIZON_DAYS` | 14 | Bounds generation; beyond it Faysal takes a callback request rather than inventing a schedule three months out. |
| `FAYSAL_MIN_LEAD_MINUTES` | 120 | No booking inside two hours. A same-day slot at 14:55 for 15:00 is not a booking, it is a walk-in. |
| `FAYSAL_MAX_SLOTS_PER_REPLY` | 3 | WhatsApp readability. |
| `FAYSAL_HOLD_TTL_MS` | 10 min | §7.5. |
| `FAYSAL_MAX_ACTIVE_HOLDS_PER_PATIENT` | 1 (family blocks count as one) | §7.5. |
| `FAYSAL_SLOT_GRID_MINUTES` | 15 | Grid alignment. |

### 7.3 Durations and buffers

`[DEMO-02]` — all figures are demo values, clinically plausible but not the client's.

| Service | Duration | **Buffer after** | Buffer rationale |
|---|---:|---:|---|
| GP / family consult | 20 | 0 | |
| Specialist consult (derm, ENT, ophth, internal) | 20 | 0 | |
| Paediatric consult | 15 | 0 | |
| OB-GYN consult | 20 | 0 | |
| OB-GYN consult + ultrasound | 40 | 10 | Room turnover, probe cleaning |
| Orthodontic assessment (new case) | 40 | 10 | Records, photos, impressions |
| Orthodontic adjustment | 20 | 0 | |
| **Laser hair removal session** | 30 | **15** | Device cool-down and post-care observation; the room is not re-enterable immediately |
| Dental scaling / polishing | 30 | 10 | Surgery turnover |
| **Dental extraction** | 30 | **15** | Haemostasis check before the patient leaves the chair |
| In-office whitening | 60 | 15 | Chair reset |
| Employment medical | 30 | 0 | |
| Day-case procedure | 90 | 30 | Recovery/observation |

**Rule BUF-1 — the buffer blocks the resource, is never offered as a slot, and is never billed.** It is part of `end` for occupancy and part of nothing for money. Keeping it out of the price calculator is the `order-pricing.ts` separation: one function decides money, a different one decides time, and neither reaches into the other.

**Rule BUF-2 — a buffer may not overhang a window close.** `start + duration + buffer ≤ windowClose` (§4.8). If the buffer doesn't fit, the slot is not offered. A 30-minute laser session at 23:45 in a window closing at 24:00 is exactly the kind of slot that produces a patient in an empty corridor.

### 7.4 Constrained resources

```
type Resource = { id: string; siteId: SiteId; kind: "room" | "device" | "chair"; capacity: number };
```

Laser sessions consume a laser device at the site. The dossier names a **GentleMax Pro** at Complex 2, from patient reviews `[D §3.2 L146]`. Modelled as `capacity: 1` at `wattan-2`, `[INF-11]` — a single named device in reviews is weak evidence of exactly one machine, but a capacity-1 constraint is the conservative reading (over-constraining loses a demo slot; under-constraining double-books a laser room).

**Rule RES-1 — Faysal does not name the device to the patient.** The evidence is a review, not a spec sheet, and quoting equipment brands is a claim about the client's capital. If the patient names it first, Faysal says the branch is the group's laser branch and offers to confirm the device with the clinic.

### 7.5 Hold-then-confirm

WhatsApp is asynchronous, so the two-phase shape is not optional: between "10:30 works" and the patient's confirmation there is a real gap in which someone else must not take the slot, and in which we must not have told a clinic to expect anyone.

```
hold(slotRef, patientRef) -> { holdToken, expiresAt }        // TTL 10 min
confirm(holdToken)        -> { appointmentId, state: "confirmed" }
release(holdToken)        -> void
```

| Rule | Statement |
|---|---|
| **HOLD-1** | A hold is **not** a booking. Faysal never says «تم الحجز» / "booked" for a held slot. It says the slot is reserved for ten minutes and asks for confirmation. |
| **HOLD-2** | One active hold per patient identity (WhatsApp number). A new hold **releases** the previous one atomically — no accumulating locks from an indecisive conversation. Family blocks (§7.6) count as one hold. |
| **HOLD-3** | Expiry is enforced **server-side on read**, never by a client timer. An expired hold returns inventory whether or not any sweep has run. Same posture as `DEMO_SESSION_TTL_MS` in `lib/demo/config.ts` L182–190. |
| **HOLD-4** | `confirm()` is **idempotent on the hold token**. WhatsApp double-taps and network retries are routine; a second confirm returns the same `appointmentId`, never a second appointment. |
| **HOLD-5** | `confirm()` **re-validates the window** before writing. Hours can be edited during the ten-minute hold. A confirm whose window has become unbookable fails with `hours_changed_reverify` and Faysal re-offers — it never writes an appointment into a window that stopped being open while the patient was typing. This is the direct analogue of `order-pricing.ts` recomputing rather than trusting the draft's stored price. |
| **HOLD-6** | Confirming at a site with `operatingStatus.state = "operational_contested"` yields `state: "confirmed", pendingBranchConfirmation: true`, and the confirmation message says the branch will confirm by phone (Rule C4-1). |

### 7.6 Family blocks

The requirement: a mother books for herself and then for two children, back-to-back, in one conversation. Common in this market `[INF-12]`, and the failure mode — three appointments scattered across a day and two clinics — is the thing that makes an agent feel stupid.

```
type FamilyBlock = {
  familyGroupId: string;
  siteId: SiteId;              // ONE site. No cross-site blocks.
  dateISO: string;             // ONE day.
  legs: Array<{ patientRef; clinicianId; serviceKey; duration; buffer }>;
  maxGapMinutes: 15;
  atomic: true;
};
```

Rules:

| # | Rule |
|---|---|
| **FAM-1** | **Atomic.** All legs hold or none do. A partial family block is worse than a refusal — it commits the family to a trip that only half works. |
| **FAM-2** | **Contiguous, ≤ 15 minutes between legs**, including each leg's buffer. Beyond that it is not a block, it is two visits, and Faysal says so. |
| **FAM-3** | **One site, one day.** A block spanning two branches is not offered — the point of the block is one journey. |
| **FAM-4** | Every leg must sit inside its **own** clinic's bookable windows. A paediatric clinic that ends at 21:00 and an OB-GYN clinic that ends at 21:30 give a block that must finish by 21:00 for the child's leg. The intersection is computed per-leg, never once for the site (Invariant H4 generalised). |
| **FAM-5** | Default ordering **adult first, then children**, on the grounds that the adult can supervise afterwards `[INF-13]`. Overridable on request; it is a default, not a policy. |
| **FAM-6** | Counts as **one** hold under HOLD-2, with a single `holdToken` covering all legs, and one confirmation. |
| **FAM-7** | A block that cannot be satisfied contiguously is **not** silently split. Faysal offers the nearest contiguous alternative (another day, another clinician) or explicitly proposes two visits with both times stated. |

---

## 8. Consent for booking data

Brief, because it is a demo, but a booking agent collects a name, a phone number and a stated health need — which is health data.

- `[POL-03]` The demo stores the minimum: display name, WhatsApp number, chosen service, site, time. **No** national ID, **no** Iqama number, **no** insurance member number, **no** clinical detail beyond the service name. The dossier notes that patients should bring ID and an insurance card *to reception* `[D §8 L281]` — that is a reception step, and Faysal tells the patient to bring them rather than collecting them in chat.
- `[POL-04]` Demo appointment records carry two markers, per the `config.ts` two-marker law: `source = "faysal_demo"` **and** `isTest = true`, and expire on a TTL like `DEMO_SESSION_TTL_MS`.
- `[OPEN-07]` A production deployment touches Saudi PDPL and, if it ever integrates with insurance eligibility, NPHIES. Out of scope for the demo, named here so nobody discovers it during a client call.

---

## 9. Service catalogue and demo prices

### 9.1 Why every price in this file is invented — the argument, in full

An auditor should be able to read this and stop worrying.

**What price information the dossier actually contains.** Exactly two kinds, and it disclaims both:

1. **A third-party marketplace range.** *"Cash-pay consultation fees seen on Tebcan for Shoaa doctors typically fall in the 56–200 SAR range depending on specialty (listed as 'free consultation' promotions that exclude procedures). **These are marketplace figures, not official tariffs.**"* `[D §4 L215]`
2. **TPA discount-card percentages.** At Complex 3: *"example published rates: 30% consultation, 25% lab/radiology, 20% dental, 20% laser — **these are insurer/TPA promotional rates, not walk-in cash prices**."* `[D §3.3 L161]` And group-wide: *"published discount percentages (20–30% on consults, labs, dental, laser) **apply to specific TPA cards and exclude some campaign days**."* `[D §4 L217]`

That is the entire price surface. There is **no** figure anywhere in the dossier for laser hair removal, orthodontics, whitening, an employment medical, a paediatric visit, or any women's-health service.

**Why we cannot use even the two we have.** A marketplace listing is what a booking platform advertises for a promotional slot; a TPA card percentage is a discount off an unpublished tariff, tied to a specific card, and excluded on campaign days. Rendering either as "Al Wattan's price" would be a false statement about the client's commercial terms — made by an agent wearing the client's brand, to the client's patients, in a demo shown to the client. A patient who arrives quoting a Tebcan promotion as the clinic's fee has been set up for an argument at the reception desk, and the clinic gets the blame. The dossier's own authors drew this line twice, in bold-equivalent language, in two separate sections. We honour it.

**Therefore:** every catalogue price is invented `[DEMO-03]`, labelled at the data layer *and* at the message layer, and structured so it can be swapped for the client's real tariff without touching any other part of the system.

### 9.2 The two-marker price model

```
type PriceBasis =
  | "demo_invented_anchored"   // invented, but sanity-checked against a dossier range
  | "demo_invented_unanchored" // invented with no dossier reference point at all
  | "client_confirmed";        // reserved. NOTHING carries this in Wave 1.

type ServicePrice = {
  amountSar: number;
  basis: PriceBasis;                     // marker 1 — data layer
  anchorNote: string | null;             // what the anchor was, if any
  requiresDemoLabel: true;               // marker 2 — message layer. Literal type.
  vatNote: "excluded_unknown";           // §9.5
};
```

Two markers, because they are read by different things — the same reasoning `lib/demo/config.ts` L176–179 gives for stamping a demo order with both `source` and `is_test`. `basis` governs code paths (a `client_confirmed` price would one day be quotable without a caveat). `requiresDemoLabel` governs what the patient sees. Neither can be satisfied by the other.

**Rule PRICE-1 — no bare number ever leaves the agent.** Every quoted figure is rendered with its demo label:
> «السعر تقريبي للعرض التجريبي، والمعتمد من الاستقبال.»
> "Indicative demo price — reception confirms the final amount."

**Rule PRICE-2 — one calculator.** A single `quote(serviceKey, siteId, modifiers)` returns the priced lines, exactly as `recomputeOrderPricing()` is the only thing in Kivo that decides money. No template, no prompt and no UI computes a total.

**Rule PRICE-3 — never a final payable amount for an insured patient.** See §10.4.

**Rule PRICE-4 — never quote the dossier's percentages as a price.** The 20–30% TPA figures are **not** in the catalogue at any level and are never spoken. If a patient mentions a discount card, Faysal confirms the group works with TPA cards and routes to reception for the card-specific rate (§10.4).

**Rule PRICE-5 — no site-level price variation in Wave 1.** We have no evidence prices differ by branch, and inventing branch-differentiated fees would fabricate a commercial structure. One catalogue, all sites. `[OPEN-05]`

### 9.3 The catalogue

All amounts SAR. **All are demo data.**
`A` = `demo_invented_anchored` (against the 56–200 SAR consultation band `[D §4 L215]`) · `U` = `demo_invented_unanchored` (no dossier reference exists)

#### Consultations — anchored

| Service | Price | Basis | Note |
|---|---:|:--:|---|
| General / family medicine consultation | 90 | A | Inside the dossier's 56–200 band |
| Paediatric consultation | 120 | A | |
| Internal medicine consultation | 130 | A | |
| Dermatology consultation | 150 | A | |
| ENT consultation | 150 | A | |
| Ophthalmology consultation | 150 | A | |
| OB-GYN consultation | 170 | A | |
| Neurology consultation | 200 | A | Top of the band |
| Follow-up within 14 days, same clinician | 0 | A | Included; `[INF-14]` a common regional convention, not a dossier fact |

The anchoring is a **sanity check, not a source**: the band comes from a marketplace listing for Shoaa doctors `[D §4 L215]`, so anchoring to it keeps the demo from showing absurd numbers while conceding it is not the client's tariff. `basis` still says invented.

#### Laser hair removal — unanchored

| Service | Price | Basis |
|---|---:|:--:|
| Single small area, one session (upper lip / chin) | 150 | U |
| Medium area, one session (underarms / bikini) | 300 | U |
| Large area, one session (full legs / back) | 700 | U |
| Full body, one session | 1,200 | U |
| Package — 6 sessions, small area | 750 | U |
| Package — 6 sessions, medium area | 1,500 | U |
| Package — 6 sessions, large area | 3,500 | U |
| Package — 6 sessions, full body | 6,000 | U |

**Rule PKG-1 — the package relationship is asserted by a test, not by a sentence.** Every package above is exactly `5 × session` (six sessions, one free). That relationship is stated to the patient — «باقة ٦ جلسات بسعر ٥» — so it must not drift from the stored numbers. A unit test asserts `package6 === 5 * session` for every area, and a change to either side fails the build. `lib/demo/config.ts` documents at length what happens when a figure is corrected where it is computed and left stale where it is *read* ("THIS SENTENCE IS THE ONE THAT GOES STALE… THREE times now"). Here the sentence and the number are pinned to each other mechanically.

Package terms `[DEMO-03]`: valid 12 months, one named patient, non-transferable, unused sessions not refundable. Faysal states these terms whenever it quotes a package — an unstated expiry on a 6,000 SAR package is a complaint waiting to happen.

#### Orthodontics — unanchored

| Service | Price | Basis |
|---|---:|:--:|
| Orthodontic assessment + records | 300 | U |
| Fixed metal braces, both arches, incl. 18 months of adjustments | 6,500 | U |
| Ceramic braces, both arches, incl. 18 months of adjustments | 9,000 | U |
| Clear aligners, basic case (≤ 14 steps) | 12,000 | U |
| Adjustment visit outside a package | 200 | U |
| Retainers, upper + lower | 900 | U |

Complex 4 carries an advertised orthodontics offer as of 29 July 2026 `[D §3.4 L171]`. **Faysal never states the offer's terms** — the dossier records that an offer exists, not what it contains. It says an offer is advertised at the Shifa branch and routes to the branch (Rule C4-1). Inventing the discount would be inventing the client's marketing.

#### Whitening and hygiene — unanchored

| Service | Price | Basis |
|---|---:|:--:|
| Scaling + polishing | 250 | U |
| In-office whitening, one session | 900 | U |
| In-office whitening + take-home kit | 1,300 | U |
| Take-home whitening kit only | 600 | U |

`[POL-05]` Faysal states that whitening normally requires a check-up and scaling first and that results vary — it never predicts a shade outcome.

#### Employment medicals — unanchored

| Service | Price | Basis |
|---|---:|:--:|
| Pre-employment medical, basic panel | 250 | U |
| Pre-employment medical + chest X-ray + labs | 400 | U |
| Corporate batch (≥ 20 employees) | **not quoted** | — |

Pre-employment screening for companies and government agencies is a named group service `[D §2 L76–77]` and is specifically marketed at Shoaa Al Wurud `[D §3.5 L194]`.

**Rule EMP-1 — Faysal never quotes a corporate contract.** Batch pricing is a commercial negotiation. Faysal collects company name, headcount and preferred site, and hands to the corporate desk.
**Rule EMP-2 — visa / residency medicals are out of scope.** Those run through licensed, accredited channels under their own rules; the dossier says nothing about the group holding such approval. Faysal states it cannot confirm that service and offers reception. Claiming it would be a regulatory claim on the client's behalf. `[POL-06]`

#### Paediatrics — mixed

| Service | Price | Basis |
|---|---:|:--:|
| Paediatric consultation | 120 | A |
| Well-baby / growth check | 150 | U |
| Nebuliser session | 120 | U |
| Vaccine administration fee | 100 | U |

**Rule PED-1 — Faysal never names a specific vaccine, schedule or availability.** The dossier contains no vaccine information, and routine childhood immunisation in Saudi Arabia runs on the national schedule through primary care `[INF-15]`. The administration fee is listed; the vaccine itself is not, and Faysal says the clinic confirms availability. A demo agent that told a parent a specific vaccine was in stock would be inventing a clinical supply claim.

#### Women's health — mixed

| Service | Price | Basis |
|---|---:|:--:|
| OB-GYN consultation | 170 | A |
| Pelvic ultrasound | 300 | U |
| Obstetric ultrasound (dating / growth, 2D) | 350 | U |
| Pap smear (collection + lab) | 300 | U |
| Antenatal package, per trimester | 1,200 | U |

`[POL-07]` Faysal offers a female clinician for women's-health bookings **by default at sites where one exists** (§6.3), without requiring the patient to ask, while making it clear it is an option and not an assignment.

### 9.4 What is deliberately absent from the catalogue

| Absent | Why |
|---|---|
| Laboratory and radiology price list | The dossier confirms diagnostics exist `[D §2 L74]` but gives no figures and mentions labs only inside TPA discount percentages `[D §3.3 L161]`. Inventing a lab menu invents dozens of clinical claims at once. Faysal books "lab tests as requested by the doctor" and quotes nothing. |
| ER fees | Never quoted. Emergency care is not a purchase decision and §11 outranks §9. |
| Day-case surgery prices | Case-dependent; a quoted surgical price is a clinical claim. Consultation-first only. |
| Any price by branch | Rule PRICE-5. |
| Any TPA/insurance discount amount | Rule PRICE-4. |

### 9.5 VAT

The dossier says nothing about VAT. `lib/order-pricing.ts` L239–249 shows Kivo carrying an explicit `taxMode` (`"added"` vs inclusive) and a documented ruling — that is the standard to meet, and we cannot meet it here because we have no ruling. Saudi VAT treatment of healthcare services is not uniform, and guessing would corrupt every figure in §9.3.

So: `vatNote: "excluded_unknown"` on every price, no tax line in the demo quote, and **Faysal never states whether a price includes VAT.** `[OPEN-06]`

---

## 10. Insurance

### 10.1 The carrier model

```
type PayerKind =
  | "insurer"            // a licensed carrier with a provider network
  | "tpa_discount_card"  // a discount card, NOT insurance cover
  | "directory_source";  // the network list a facility was observed on (provenance only)

type Payer = {
  id: string; nameEn: string; nameAr: string;
  kind: PayerKind;
  siteEvidence: Array<{ siteId: SiteId; dossierRef: string; note: string }>;
  /** DERIVED and always false in Wave 1. See Rule INS-1. */
  acceptanceConfirmed?: never;
};
```

The distinction between `insurer` and `tpa_discount_card` is load-bearing. A Takaful Al Arabia discount card is not health insurance, and a patient told "we accept Takaful" who arrives expecting cover has been misled by a category error. The dossier keeps them apart `[D §3.3 L161]`, `[D §4 L217]`, and so does the schema.

### 10.2 Payers named in the dossier

**Insurers** — from the group-wide network paragraph `[D §4 L216–217]`:

| Payer | Dossier evidence |
|---|---|
| Bupa Arabia | Explicit June 2024 announcement for Complex 4; historically listed among Shoaa's accepted insurers `[D §4 L217]`, `[D §3.4 L171]` |
| Tawuniya | "Tawuniya-class hospital lists" `[D §4 L217]`, `[D §3.1 L121]` |
| Medgulf | `[D §4 L217]` |
| Walaa | `[D §4 L217]` |
| Gulf General | `[D §4 L217]` |
| SAICO | `[D §4 L217]` |
| Malath | `[D §4 L217]` |
| United | `[D §4 L217]` |
| Al-Etihad | `[D §4 L217]` |
| Enaya Saudi | `[D §4 L217]` |
| Solidarity | `[D §4 L217]` |

**TPA / discount cards:**

| Card | Dossier evidence |
|---|---|
| Takaful Al Arabia | Discount card at Complex 3 and Complex 4 `[D §3.3 L161]`, `[D §3.4 L172–173]`, `[D §4 L217]` |
| Takaful Watan | `[D §4 L217]` |

**Directory sources** (provenance for facility codes, **not** payers to quote):

| Source | Evidence |
|---|---|
| Amana | Insurer PDFs carrying facility codes `[D §3.1 L121]`, `[D §9 L291]` |
| Al Jazeera Takaful | Insurer PDFs carrying facility codes `[D §3.1 L121]`, `[D §9 L291]` |
| Al Jazeera Maps registry | Registry numbers `[D §9 L291]` |

**Rule INS-2.** A `directory_source` is never named to a patient as an accepted payer. It is provenance for a code, nothing more. The dossier cites Amana and Al Jazeera Takaful as *sources of insurer PDFs* `[D §9 L291]` — that is where a facility code was read, not a statement of contract.

### 10.3 Network classes and facility codes

The dossier references **MPN / OCN / OHN** class lists `[D §4 L217]`, `[D §3.1 L121]` and instructs: *"Always verify the current network class (A/B/C) and deductible on the patient's card"* `[D §4 L217]`.

```
type NetworkClass = "A" | "B" | "C" | "MPN" | "OCN" | "OHN" | "unknown";
```

Faysal stores `networkClass: "unknown"` for every site-payer pair. **We were told to verify it on the card; we have not verified it; therefore it is unknown, and Faysal never states one.**

Facility codes as recorded:

| Site | Code | Kind | Confidence | Source |
|---|---|---|---|---|
| `wattan-1` | 18002 | cchi_style_network_code | medium | `[D §2 L84]`, `[D §3.1 L120–121]` |
| `wattan-2` | 18003 | cchi_style_network_code | medium | `[D §2 L84]`, `[D §3.2 L140–141]` |
| `wattan-3` | 17985 | cchi_style_network_code | medium | `[D §2 L84]`, `[D §3.3 L157–158]` |
| `wattan-4` | **null** | — | unknown | no code published anywhere in the dossier |
| `shoaa-wurud` | 18004 | cchi_style_network_code | medium | `[D §2 L84]`, `[D §3.5 L188–189]` |
| `shoaa-rawdah` | 17081 | **legacy_map_id** | **low** | "older codes such as 17081 in some maps" `[D §2 L84]`, `[D §3.6 L207–208]` |

**Rule INS-3 — a code is an internal key, not a licence number.** The dossier calls these "CCHI **/** insurance-network facility codes appearing in insurer PDFs" `[D §2 L84]` and, at Complex 1, a "CCHI-**style** ID" `[D §3.1 L121]`. It does not assert they are official CCHI licence numbers. Faysal therefore **never reads a code to a patient** and never calls it a CCHI licence. Codes exist to key the site to an insurer network list internally. Complex 4's is `null` — never borrowed from a sibling, for the same reason Friday is never borrowed from Thursday.

### 10.4 The coverage rule

> **Rule INS-1 — Faysal NEVER promises coverage. Not partial, not full, not "should be covered", not "usually covered".**

This follows the dossier's own instruction — *"Always verify the current network class (A/B/C) and deductible on the patient's card"* `[D §4 L217]` — and its practical note that a patient should *"Ask reception which network class the visit will bill under"* `[D §8 L281]`.

Coverage depends on the carrier, the policy class, the deductible, the service, pre-approval, and campaign-day exclusions `[D §4 L217]`. Faysal knows none of those. It has a list of networks the buildings appear on. That is not eligibility.

**Permitted sentence shapes:**
- «المجمع مدرج ضمن شبكات عدة شركات تأمين، منها [X].» — "The complex appears on several insurers' networks, including [X]."
- «تغطية زيارتك تعتمد على فئة شبكتك والتحمّل في بطاقتك — الاستقبال يتحقق لك منها قبل الكشف.» — "Your cover depends on your network class and deductible; reception verifies before the consultation."
- «احضر الهوية أو الإقامة وبطاقة التأمين، واسأل الاستقبال تحت أي فئة شبكة تُحتسب الزيارة.» — directly from `[D §8 L281]`.
- «هذا سعر نقدي تجريبي؛ المبلغ المعتمد للمؤمَّن يحدده الاستقبال بعد التحقق.» — the demo cash price, plus the refusal to compute an insured amount.

**Banned outright:**
- Any form of "you're covered", "it's free with your insurance", "insurance will pay X".
- Any stated network class, deductible, co-payment or approval outcome.
- Any TPA discount percentage (Rule PRICE-4).
- Reading a facility code aloud (Rule INS-3).
- "Bupa is accepted at Complex 4" as a present-tense fact — the dossier's evidence is a **June 2024 announcement** `[D §3.4 L171]` at a branch whose status is contested (§3.4.1). Faysal says Bupa patients were announced as being received there and that reception confirms.

**Rule INS-4 — aesthetic services.** Laser hair removal, whitening and cosmetic orthodontics are typically not covered by Saudi health policies `[INF-16]`. Faysal does **not** state this as fact. It says these are usually treated as cash services and that reception confirms — the same posture as INS-1, in the direction that happens to favour the patient checking rather than assuming.

**Rule INS-5 — insurance never gates the booking.** Faysal completes the appointment and tells the patient to bring ID/Iqama and their card `[D §8 L281]`. It never refuses a booking over insurance and never asks for a member number in chat (§8).

---

## 11. Clinical safety, refusals and escalation

The dossier is a commercial research file and has nothing to say here. Everything in this section is `[POL-08]` — product policy. A booking agent for a clinic network without it should not ship, demo or otherwise.

**Rule MED-1 — Faysal gives no medical advice.** No diagnosis, no triage, no medication guidance, no "that sounds like", no interpretation of a symptom, a result or an image. It books, informs about branches and hours, quotes demo prices, and hands off.

**Rule MED-2 — red flags stop the booking flow immediately.** On any mention of chest pain, difficulty breathing, stroke signs, severe bleeding, loss of consciousness, seizure, anaphylaxis, a serious injury, a burn, poisoning, suicidal intent, severe abdominal pain, or a distressed infant, Faysal **abandons scheduling** and directs to emergency care. It does not offer a slot, does not quote a price, does not ask which branch.

The escalation line names the emergency number and the nearest 24-hour site with an ER — Complex 1 is open 24 hours with an ER and duty doctor `[D §3.1 L112–113, L127]`, and Shoaa Al Wurud advertises 24/7 including ER `[D §3.5 L184–185]`. **The emergency number itself must be confirmed with the client before the demo** — `[OPEN-08]`; 997 (Saudi Red Crescent) and the 911 unified number used in Riyadh are both in circulation, and this is not a detail to get from memory.

**Rule MED-3 — no results, no records.** Faysal does not read out lab results, does not confirm what a doctor said, and does not access any record. It has none.

**Rule MED-4 — pregnancy, paediatrics and mental health are booked, not discussed.** Faysal books the clinic and stops. It offers no reassurance about a symptom in these areas, because reassurance is advice.

**Rule MED-5 — no clinician recommendation on quality.** "Who's the best doctor for this?" is answered with availability, specialty, gender and language — never with a ranking. Reinforced by Rule RATE-1 and Rule STR-2.

**Rule MED-6 — cancellation and no-show are never argued.** Faysal cancels on request without friction, and does not quote a penalty; we have no penalty policy from the client. `[OPEN-09]`

**Rule MED-7 — Faysal identifies as an assistant when asked**, and hands to a human on request. A patient who asks for a person gets one.

---

## 12. Open questions — the client call agenda

Ordered by how much they unblock.

| # | Question | Blocked by it | Interim behaviour |
|---|---|---|---|
| `[OPEN-01]` | **Real clinic-session timetables per branch, per specialty.** The dossier gives *facility* hours; it gives clinic hours only once, for Complex 1, from an Arabic guide it calls "older" `[D §3.1 L126]`. | Bookable inventory at Complex 1 and Ar Rabwah; §4.7. | Facility hours answer "are you open"; clinic booking falls back to callback. |
| `[OPEN-02]` | **Which specialties actually run at which branch.** The matrix in §6.2 is mostly group-wide inference. | Confident routing beyond derm/laser/dental. | Rule SPEC-1 — "let me confirm which branch runs that clinic." |
| `[OPEN-03]` | **Friday, definitively, at all six sites** — and specifically: is Ar Rabwah open Friday (§4.5)? What are Complex 4's hours (§4.6)? Which of Complex 1's two Friday closing times is right (§4.7)? | The whole Friday surface. | `unknown` / `conflicted` → no Friday slots at the affected sites; disclosure + phone number every time (Rule FRI-1). |
| `[OPEN-04]` | **Ramadan and Eid hours**, and the group's holiday calendar. | Any booking inside those windows. | Rule HRS-SEASON downgrades affected days to unbookable. |
| `[OPEN-05]` | **The real tariff**, and whether prices differ by branch. | Every figure in §9. | All prices `demo_invented`, labelled in-message (Rule PRICE-1). |
| `[OPEN-06]` | **VAT treatment** of each service line. | Any total the patient could rely on. | `vatNote: "excluded_unknown"`; no tax line; Faysal never says whether VAT is included (§9.5). |
| `[OPEN-07]` | **PDPL posture**, and whether NPHIES eligibility is ever in scope. | Production, not the demo. | Minimal data, TTL, two markers (§8). |
| `[OPEN-08]` | **The emergency number to publish** — 997 vs the Riyadh 911 unified line — and which branches have a genuinely staffed ER at which hours. | The MED-2 escalation script. | Escalation directs to emergency services and names Complex 1 / Shoaa Al Wurud as 24h sites; the number is a config value, unset until confirmed. |
| `[OPEN-09]` | **Cancellation, no-show and late-arrival policy.** | Rule MED-6. | Cancel freely, quote nothing. |
| `[OPEN-10]` | **Which WhatsApp number Faysal answers on** — the group line 050 449 0460 serves both brands `[D §1 L45]`, and both brands' patients would land in one thread. | Brand-aware greeting and routing. | Faysal greets as the group and asks which branch or which service. |
| `[OPEN-11]` | **Does Complex 4 share Complex 1's switchboard?** The group used 011 458 8444 for Shifa offers (§3.4). | Whether the alt number can be un-suppressed. | Suppressed; Faysal gives 011 497 7900 only. |
| `[OPEN-12]` | **Is Shoaa's mobile app the preferred booking channel** for the two Shoaa sites `[D §3.5 L175]`, and does Faysal hand off to it or book alongside it? | Shoaa-site booking flow. | Faysal books and mentions the app as an option. |
| `[OPEN-13]` | **The Shifa orthodontics offer's actual terms** `[D §3.4 L171]`. | Quoting the offer. | Faysal says an offer is advertised and routes to the branch; never states terms. |

---

## 13. Assumption register

Every non-dossier claim in this document, in one place.

### Inferences `[INF]`

| # | Inference | Rests on | Risk if wrong |
|---|---|---|---|
| INF-01 | Saudi 920 unified numbers are not reliably dialable in +966 form from abroad. | General KSA telephony. | An overseas patient fails to connect. Mitigated: Faysal offers the landline and WhatsApp. |
| INF-02 | A Google Maps wheelchair icon speaks to entrance access, not interior accessibility. | Maps listing conventions. | Overstating access. Mitigated by Rule ACC-1's explicit "entrance" wording. |
| INF-03 | Riyadh is UTC+03:00 with no DST. | Standard. | Low. |
| INF-04 | Complex 1's "24 hours" and its two-shift clinic pattern are layers of one operation, not a contradiction. | `[D §3.1 L112–113, L126]`. | Used to shape the schema only; confidence deliberately left `low` so it mints no slots (§4.7). |
| INF-05 | Riyadh clinic hours shift materially in Ramadan. | Regional norm. | Wrong-hours bookings in that window. Mitigated by Rule HRS-SEASON. |
| INF-06 | Complex 3 provides consultation, lab/radiology, dental and laser, because its TPA card publishes discounts for exactly those. `[D §3.3 L161]` | A TPA does not discount an absent service. | Recorded as `inferred` ⇒ not bookable (Rule SPEC-1). |
| INF-07 | Al Yamamah is the sensible fallback for an Ash Shifa patient. | Both are southern-quadrant Riyadh districts. | A longer drive. Faysal states the district and lets the patient choose. |
| INF-08 | Saudi + Arab-expatriate name mix and Urdu among languages reflect Riyadh private-clinic staffing and patient mix. | Market norm. | Demo colour only. |
| INF-09 | Female-clinician requests are common in this market. | Market norm. | Drives roster composition only. |
| INF-10 | Demand peaks 09:00–11:00 and 17:00–20:00. | Complex 1's published clinic-shift pattern `[D §3.1 L126]`. | Demo realism only. |
| INF-11 | One laser device at Complex 2 (capacity 1). | A single device named in reviews `[D §3.2 L146]`. | Over-constrains rather than double-books — the safe direction. |
| INF-12 | Family bookings (mother + children, one trip) are common. | Market norm. | Feature-shaping only. |
| INF-13 | Adult-first ordering in a family block. | Supervision. | Overridable default. |
| INF-14 | Free follow-up within 14 days is a common regional convention. | Market norm. | Priced as demo data; labelled. |
| INF-15 | Routine childhood vaccines run on the national schedule via primary care. | KSA public health. | Drives Rule PED-1's refusal to name vaccines — the cautious direction. |
| INF-16 | Aesthetic laser, whitening and cosmetic orthodontics are typically uninsured. | Market norm. | Never stated as fact; Rule INS-4 routes to reception. |

### Product policies `[POL]`

POL-01 Complex 1's Friday disclosure uses the **intersection** of the two conflicting claims (13:00–24:00) — the narrower window both sources support — for information only, minting no slots.
POL-02 The real-clinician denylist is enforced by a build-failing test, not by review.
POL-03 Minimal data capture: no ID, no Iqama, no insurance member number, no clinical detail.
POL-04 Demo appointments carry two markers and a TTL.
POL-05 Whitening: prerequisites stated, outcomes never predicted.
POL-06 Visa/residency medicals declared out of scope.
POL-07 Female clinician offered by default for women's health where one exists.
POL-08 The whole of §11 — clinical safety, refusals, escalation.

### Demo data `[DEMO]`

DEMO-01 The entire clinician roster (§6.3) — 30 invented people.
DEMO-02 All durations and buffers (§7.3).
DEMO-03 All prices and package terms (§9.3).

---

## 14. Acceptance criteria for Wave 2

An auditor or implementer can check the code against these directly. Each maps to a rule above.

**Hours and the Friday problem**
1. `bookableWindows()` returns `[]` for `wattan-4` on **every** day in the horizon. (§4.6, H3)
2. `bookableWindows()` returns `[]` for `wattan-3` on **Friday**, and a non-empty result on Saturday. (§4.5)
3. `wattan-3.clinic.week.fri.status === "unknown"`, **not** `"closed"`. (§4.5)
4. `bookableWindows()` returns `[]` for `wattan-1` on the **clinic** layer while `openStateAt(wattan-1, "facility", <a Tuesday 03:00>) === "open"`. (§4.7, H4)
5. No Friday `DayHours` is byte-identical to that site's Thursday record. (H3)
6. A `DayHours` whose `capturedAt` exceeds `staleAfterDays` mints no slots. (Rule HRS-FRESH)
7. No slot's `start + duration + buffer` exceeds its window's `close`. (BUF-2, §4.8)
8. Every reply containing a Friday date contains a branch phone number. (FRI-1)

**Contested site**
9. Any reply recommending `wattan-4` also names a second site. (C4-2)
10. A `wattan-4` request produces `appointmentKind: "callback_request"`, never `"slot"`. (§4.6)
11. No confirmation message for `wattan-4` renders a bare "confirmed". (C4-1)

**Real people**
12. The denylist test fails the build when any denylisted name (Latin or Arabic, diacritic-normalised) appears in seed data, prompts or fixtures. (DOC-4)
13. Every `Clinician` record has `fictional: true`; the type makes any other value uncompilable. (§6.3)

**Money**
14. Every price rendered to a patient carries the demo label. (PRICE-1)
15. `package6 === 5 * session` for all four laser areas. (PKG-1)
16. No TPA percentage (20 / 25 / 30) appears in any catalogue row or prompt template. (PRICE-4)
17. No reply states a final payable amount for a patient who mentioned insurance. (PRICE-3, INS-1)
18. No reply contains a facility code. (INS-3)

**Slots**
19. `confirm()` twice with one hold token yields one `appointmentId`. (HOLD-4)
20. `confirm()` on a hold whose window became unbookable fails with `hours_changed_reverify`. (HOLD-5)
21. A second `hold()` by the same WhatsApp number releases the first, atomically. (HOLD-2)
22. A family block either holds all legs or none. (FAM-1)
23. The same `(siteId, clinicianId, dateISO)` yields an identical slot list across processes and runs. (§7.2)

**Safety**
24. A red-flag phrase in any language produces the escalation message and **zero** slot offers. (MED-2)
25. No reply contains a star rating or review count. (RATE-1)
26. A `group_only` or `inferred` specialty is never offered as bookable. (SPEC-1)

---

*End of SPEC-1-DOMAIN. Wave 1 is specification only: no `.ts`, no `.tsx`, nothing outside `docs/faysal/`.*
