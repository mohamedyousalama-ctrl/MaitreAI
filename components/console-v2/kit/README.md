# console_v2 dark-glass KIT — the shared build contract (v35 rebuild)

**Read this before rebuilding any page.** This is the collision-preventer for the
parallelized rebuild. The shell + kit shipped in #362; every page window composes
from it. Design canon = `HANDOFF_v2_design_package` (15 page HTMLs +
`Kivo_Design_Handoff.md` + `Kivo_Chromatic_Truth_System.md` + `Kivo_Console_UI_Master_Map.md`).

---

## 1. Page ownership (no two windows touch the same page)

- **LEAD / SHELL (window A):** shell + kit (done, #362) → Live Shift (01), Ask Kivo (14), Login (11), Kitchen ticket (13).
- **Window B:** Conversations (02), Outcomes (03), Approvals (04), Knowledge (05).
- **Window C:** Customers (06), Insights (08), Campaigns (09), Team (10), Settings (07), Onboarding (12).

Each page lives at its existing route under `app/(console-v2)/c/(app)/…`. Edit only
your own page files + your own page-specific components. Shared changes to the kit,
`globals.css` `.kvx`, `nav.ts`, or `dictionary.ts` shared keys → coordinate (ping A).

---

## 2. Composition pattern

The AppFrame already wraps every page in `.kvx` (the dark token scope) and renders
the `Device` + 84px `IconRail`. **Your page renders into `.kvx-main`** — do NOT add
your own shell, rail, or background.

```tsx
"use client";
import { PageGrid, SectionHeader, Panel, StatTile, TruthChip, /* … */ } from "@/components/console-v2/kit";
import { HeaderRow } from "@/components/console-v2/kit"; // optional sticky page header

export default function MyPage() {
  return (
    <>
      <HeaderRow title="…" jobLine="…" right={<TruthChip state="live" />} />
      <PageGrid
        context={/* the 348px left column: stat tiles, leaderboard, spotlight, doctrine */}
        hero={/* the 1fr hero: the page's main surface */}
      />
    </>
  );
}
```

- `PageGrid` = the design's `348px context col / 1fr hero`. It stacks to one column < 1100px.
- **Every block gets a `SectionHeader`** (30px gradient icon-badge + title + uppercase sub + optional right state-chip). This is mandatory anatomy, not optional.
- Wrap grouped content in `Panel` (glass card). Vivid summary numbers → `StatTile`.

---

## 3. Import surface (exact names + key props)

All from `@/components/console-v2/kit`:

| Primitive | Signature (key props) | Notes |
|---|---|---|
| `TruthChip` | `{ state: "live"\|"gather"\|"soon"\|"pro"\|"wo"\|"degraded"; label? }` | `gather`/`soon` never colored as a verdict. `live` gets a pulsing dot. |
| `HandledByChip` | `{ by: "karim"\|"human"; name? }` | 🤖 Karim (blue) / ✋ name (amber). Mixed = render BOTH. |
| `SectionHeader` | `{ icon; title; sub?; tier?: Tier; right? }` | `Tier` = `"gold"\|"green"\|"blue"\|"coral"\|"violet"`. |
| `Panel` | `{ children; style?; className? }` | glass card. |
| `StatTile` | `{ tier: Tier; label; value; fact?; countUp? }` | pass `countUp={n}` to animate; `value` is DISPLAYED never derived. |
| `CountUp` | `{ to: number; format? }` | reduced-motion snaps. |
| `ProgressRing` | `{ pct: 0..1; size?; stroke?; color?; children? }` | SVG dashoffset. |
| `LeaderRow` | `{ rank; avatar; name; meta?; value? }` | rank 1 → gold gradient + bobbing crown automatically. |
| `Spotlight` | `{ children; style? }` | coral + shine sweep (at-risk). |
| `LoyaltyCard` | `{ tier: "vip"\|"reg"\|"new"\|"risk"; avatar; ringPct?; name; phone?; tierLabel; orders; visits; usual?; spend; spendLabel?; atRisk? }` | ring→statline→favchip→LIFETIME hero→tier. `spend` is engine money. |
| `LockedSwitch` | `{ on; locked?; onToggle? }` | `locked` = gold, unclickable (safety flags). |
| `AuroraDrawer` | `{ open; onClose; safety?; children }` | 432–452px, rotating aurora; `safety` → red aurora. Esc closes. |
| `MiniModal` | `{ open; onClose; children }` | 82–84vh glass modal. |
| `Toasts` + `pushToast(text, tone?)` | mount `<Toasts/>` once per page; call `pushToast("…","ok"\|"blue"\|"amber")` on every mutation. |
| `Device`, `IconRail`, `HeaderRow`, `PageGrid` | shell — you only use `HeaderRow` + `PageGrid`. |

### Token names (CSS vars, available anywhere inside `.kvx`)
`--bg --panel --inset --inset2 --stroke --stroke2 --txt --dim --faint` ·
identity: `--blue --blue2 --teal --violet --gold --amber` · **`--red` (SAFETY ONLY)** · `--coral` (trend floor) ·
vivid gradients: `--g-gold --g-green --g-blue --g-coral --g-violet` · dark-ink: `--ink --ink-soft --ink-line --ink-chip` ·
fonts: `--kvx-font-ui` (Inter/UI), `--kvx-font-ar` (Readex Pro / Arabic + names).
Legacy `--kv-*` are remapped to dark inside `.kvx` — prefer the canon tokens above in new code.

---

## 4. Hard rules (the skeleton failure we are rebuilding to fix)

1. **Data-blocked ≠ flat placeholder.** If a surface's engine doesn't exist yet
   (Outcomes ledger, loyalty rings, funnel, campaign recipes, Karim performance…),
   render the **FULL designed component in its GATHERING/SOON state** — the real
   card/drawer/tile chrome with a `TruthChip state="gather"` (or `"soon"`) and the
   honest "lights up when its engine ships" copy. Never a dashed empty box. Flag
   each data-blocked component in your PR body so we track which need backend.

2. **Every page ships ALL its popups/drawers/modals per the design.** A page
   without its popups IS the skeleton failure. Example — **Live Shift alone has
   ~10**: order-details, drill, evidence, lost-reason, pause/kill, POS-stamp,
   queue, kitchen-ticket, WhatsApp-preview, chat drawer. Enumerate your page's
   popup inventory from its design HTML and build every one (use `AuroraDrawer` /
   `MiniModal`). List them in your PR body as a checklist.

3. **Chromatic Truth System — non-negotiable:**
   - **red = safety only.** Never a trend, never "low sales", never decoration. A
     bad trend floors at coral, never escalates to red.
   - **GATHERING is never colored** green/orange — a trend without a real baseline
     is a lie. Use `TruthChip state="gather"` (shimmer slate).
   - Two layers only: Layer-1 identity (fixed, never animates) + Layer-2 state (the
     only animated layer). Trend deltas render ONLY with a real comparable baseline.

4. **Integrity laws survive the reskin** (the audit praised these — do not lose them):
   - **Attribution:** every restaurant-side message/event stamped `HandledByChip`
     (Karim / hand+name / both).
   - **Money is engine-computed** — display it, never derive it in the UI.
   - **Honest states** — no fabricated numbers; LIVE only from a real aggregate.
   - **Allergen gate untouched** — safety wording verbatim-frozen; safety is an
     ownership fact rendered locked, never a proposal in a swipe deck.

5. **Production hygiene / a11y:** AR is the DEFAULT (فصحى chrome; Karim's Egyptian
   dialect only inside quoted conversation content), EN toggle. ≥11px operator type
   floor, ≥40px tap targets. Escape every customer-controlled string (text nodes /
   `<bdi>` only — no `dangerouslySetInnerHTML` of data). Leaflet attribution
   required on every map; NO map timers / ambient rotators — use realtime.
   prefers-reduced-motion is already honored by the kit.

6. **Scope law:** Kivo ends at confirmed order + POS/kitchen handoff. No
   dispatch/driver/cash-settlement surfaces. Cash = one passive "payment mix" chip.

---

## 5. i18n

Add page copy as typed keys in `lib/i18n/dictionary.ts` (AR + EN, both required —
the shape is type-checked). Never inline a string; never interpolate a runtime
name/number into a dictionary value — compose with `<bdi>` / `CountUp` at the call
site. Section headers, chips, and every label read from `useT()`.

---

## 6. Verify before PR

`rm -rf .next/types && npx tsc --noEmit` · `npx next build` · `npx next lint --dir <your page dir>` ·
Playwright screenshot each page state (populated / GATHERING / each drawer + modal
open) against a dev server with `NEXT_PUBLIC_CONSOLE_V2=true` (intercept endpoints
via `page.route` for populated shots — never ship mocks). Put the popup checklist +
data-blocked flags in the PR body. Hold merge for guardian review (touches-shared).
