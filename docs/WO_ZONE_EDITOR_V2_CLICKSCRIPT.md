# WO-ZONE-EDITOR-V2 — Founder click-script (human pass)

The R4 proof (`scripts/proof-zone-editor-v2.test.ts`) already proves the geometry and
the wiring in CI. This script is the **human** pass: it drives the two founder-reported
defects by hand so a person confirms the feel, not just the math.

- **Where:** Console → Settings → التوصيل → «افتح محرر المناطق» (also reachable from
  Onboarding → «افتح المحرر» — same component).
- **Do it on the test tenant / Kivo Demo**, not Wesaya's live row.
- Run it once on **desktop** and once on a **phone** (touch).

Legend: ✅ = must pass. Any ❌ is a bug to file.

---

## Part A — State leak (D1): dismissal is a full discard

1. Open the editor, tap an existing zone to edit it (or «منطقة جديدة»).
2. Drag the **center pin** somewhere new AND drag the **gold radius handle** to change
   the size. Do **not** press «حفظ المنطقة».
3. Dismiss via the **✕** button (top-left).
4. Reopen the editor.
   - ✅ You land on the **zone list**, not back inside the half-edited draft.
   - ✅ Re-open that same zone: the circle is at its **last SAVED** center and radius —
     none of your unsaved drag survived.
5. Repeat steps 1–4, but this time dismiss by **tapping the dark backdrop** outside the
   sheet. Same expectation ✅.
6. Repeat again, dismissing with the **Esc** key (desktop). Same expectation ✅.
7. Sanity: make a real change and press **«حفظ المنطقة»**. Reopen.
   - ✅ The saved change is there. Save persists; only *dismissal* discards.

## Part B — Precision (D2): what you see is what saves

8. Edit a zone. Note the radius shown in the gold chip (top-left of the map) and on the
   handle's floating **… كم** label — they must read the **same** number. ✅
9. **Drag test (the original bug):** pick a landmark on the map about **2.85 km** from
   the center. Drag the gold handle out to sit on it, in one smooth motion, then release.
   - ✅ The circle grows *while you drag* (live), smoothly, with no jump-back or stutter.
   - ✅ On release the handle snaps neatly onto the circle's east edge.
   - ✅ The chip / handle label now reads ~**٢٫٨٥ كم** (± a rounding tick) — NOT a wild
     under-shoot like ١٫٩٧ or ٢٫٧٠.
10. Do the drag **fast**. ✅ The radius still tracks where you released — no lag, no
    reset to a smaller value.
11. **Numeric test (the exact path):** tap the **نصف القطر** field, clear it, and type
    **٣٫٥** (Arabic-Indic three-point-five).
    - ✅ The field accepts it (the Arabic digits are NOT swallowed).
    - ✅ The map circle resizes to exactly 3.5 km and the handle moves to match.
12. Type a Latin **7** into the same field. ✅ Also accepted; circle → 7 km.
13. **Byte-equal test:** set any radius (drag or type), press **«حفظ المنطقة»**, then
    reopen that zone.
    - ✅ The radius reads back **exactly** what you last saw before saving — no drift
      between the displayed number and the stored number.
14. **Center + radius are separate gestures:** ✅ dragging the **pin** moves the whole
    circle; dragging the **gold knob** only changes the size. They never fight each other.

## Part C — Mobile touch (phone pass)

15. Repeat steps 9–12 with your finger.
    - ✅ Both the pin and the knob are easy to grab (the knob hit-area is generous).
    - ✅ Dragging is smooth; the circle follows your finger; release commits cleanly.
16. ✅ The sheet sits over a fully **opaque** backdrop — no page content bleeds through.

---

**If every ✅ holds, WO-ZONE-EDITOR-V2 passes the human bar:** cancel always discards,
save is atomic with a read-back refresh, the radius has both a live-labelled drag handle
and an exact numeric field (Arabic-Indic accepted), gestures are unambiguous with no
jumps, and the saved values are byte-equal to what was displayed.
