# Al Wattan — client call brief

**One page. Take it to the call.** Everything here is a question only Al Wattan can answer,
ordered by what it unblocks. The four specifications behind it are 6,538 lines; this is the
part that needs a human on the other end of a phone.

Sources: `SPEC-1-DOMAIN.md` §12 (`[OPEN-01]`–`[OPEN-17]`), `SPEC-4-SAFETY.md` §12,
`REVIEW-WAVE1.md` §5.

---

## A. The twenty-minute unblock — ask these first

These three turn the demo's weakest moment into its strongest. Without them the product
**books nothing at any of the six sites**; with them it books at all of them.

| # | Ask | Why it matters |
|---|---|---|
| 1 | **The clinic timetable for each branch — by specialty, not the building's opening hours.** | We have when the *building* is open. We do not have when the *dermatology clinic* runs. Every bookable slot in the product depends on this one answer. |
| 2 | **Friday, definitively, at all six sites.** Is Ar Rabwah open? What are Complex 4's hours? Complex 1 closes at midnight or 07:00? | Public sources give six different Friday answers for six sites and contradict themselves on three. Until answered, Faysal refuses every Friday slot and gives the branch phone number instead. |
| 3 | **Which specialties actually run at which branch.** | We can route dermatology, laser and dental confidently. Everything else is inference from group-wide marketing. |

> **Arabic, if easier:** «نحتاج جدول العيادات لكل فرع — أوقات كل تخصص، مو أوقات فتح المبنى.
> وتحديداً الجمعة: أي فروع تفتح، ومن أي ساعة؟»

**Also ask who the named person is** who confirms hours and prices, and on what channel. The
system records a name, a role, a channel and a timestamp against any fact they give us —
"the client said so" is the highest-authority claim in the product, so it carries the
strongest provenance, not the weakest.

---

## B. The one question that decides what we are selling

> ### "What system do your receptionists book into — and does it have an API?"
>
> «الاستقبال يحجزون على أي نظام؟ وهل فيه ربط تقني معه؟»

Nobody had asked this. Al Wattan has run six sites for forty years — one CBAHI-accredited,
eleven insurer networks, employment-screening contracts, and a Shoaa booking app on both
app stores. **There is a scheduler behind all of that.** Our demo generates slots from a
random-number generator, which is correct for a demo and fatal for a pilot.

Three possible answers, all survivable if we know which one we're in **before** we quote:

| Their answer | What Faysal is | What changes |
|---|---|---|
| **It has an API** | A **booking agent** | Faysal writes real appointments; our slot model becomes a cache |
| **It doesn't** | A **triage and lead-capture funnel** | Reception gets a fully-qualified patient and books them. Different product, different price, still valuable — and the code path already exists |
| **Each site runs something different** | A **single-site pilot** | Start at Shoaa Al Wurud: accredited, has its own app, the group's showpiece |

Without a write path, every appointment Faysal confirms is invisible to the desk that owns
the room, every walk-in reception takes is invisible to Faysal, and the first collision is
two patients in one chair. We spent 6,538 lines making certain Faysal never sends a patient
to a **closed** desk. This is about never sending two to the same **open** one.

---

## C. Safety — needs their medical director, not us

**None of this blocks the demo. All of it blocks a real patient.** Say so plainly; asking is
a credibility signal, not a weakness.

1. **Which branches have a genuinely staffed ER, at which hours, on which weekday — including Friday.**
   Public sources contradict themselves on four of the six. One site's ER appears to stop at
   midnight. Sending chest pain to a closed branch is lethal and no test we write can catch
   it. **This is the single most important line on this page.**
2. **Sign-off that 997 is the right emergency number for this catchment.**
3. **A named clinician to review the red-flag list** — what counts as an emergency, and where
   the line sits between "go to the ER now" and "let me book you today."
4. **A mental-health support number.** We ship this **blank** until their medical director
   confirms it in writing. A wrong number is worse than none: it gets dialled, and it fails.
5. **Infant fever thresholds**, from a paediatrician.
6. **A live drill**: when Faysal pages a human for an emergency, does a human actually answer
   within minutes? That is a rehearsal, not a unit test.

---

## D. What we can show them regardless

Working in the demo without a single answer above: the Riyadh-Arabic greeting; branch
recommendation with the reason said out loud; insurance questions handled honestly without
ever promising coverage; demo-marked prices; the emergency rail **live** — invite their
medical director to type chest pain into it in the room, because that is the moment that
wins the meeting; and honest handling of the sites whose hours we genuinely don't know.

**Every screen carries a demo label**, including the booking confirmation:
«حجز تجريبي — غير مسجّل لدى الفرع». That message is the one that gets screenshotted and
forwarded, and it must never be mistakable for a real Al Wattan appointment.

Two things to say before they ask:

- **The doctors are invented.** Real clinicians named in their public reviews are blocked by
  a build-time guard. We are not scheduling real people against fake availability.
- **The prices are invented.** The public figures are a booking marketplace's numbers and
  insurance-card discount percentages — not Al Wattan's tariff. We won't quote a business's
  prices back to it from a third party.

---

## E. Lower priority — ask if the call has room

Ramadan and Eid hours · the real tariff and whether it varies by branch · VAT treatment ·
cancellation and no-show policy · which WhatsApp number Faysal answers on (the group line
serves both brands, so both brands' patients land in one thread) · whether Complex 4 shares
Complex 1's switchboard · whether Shoaa's app is the preferred channel for the two Shoaa
sites · the actual terms of the Shifa orthodontics offer · whether they accept our demo
disclaimer wording on a channel carrying their registered trade name.
