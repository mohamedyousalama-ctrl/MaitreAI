# Smart-menu conversation playbook (WO-MENU-PLAYBOOK, V1)

A **persona-agnostic** prompt-level overlay — it applies to **both** personas (Karim / Egyptian and
Khalid / Saudi) because menu conversation is engine behaviour, not a persona voice. Source of the
behaviours: Mohamed's menu doc (intent router · media rules · §12 example conversation · §24 reply
templates). The doc itself is not in the repo, so the behaviours below are reconstructed faithfully from
the work-order spec; when the verbatim §12/§24 text lands, tighten the anchors and eval assertions to match.

**Division of labour (binding):** the **HARD CAPS are engine-enforced by Core** — the max photos per
turn, which tools exist, money-from-tools, and the allergy safety gate/law. **This layer is the JUDGMENT
ABOVE those caps** — *when* to narrow instead of dump, *how* to classify a photo request, *when* to pause
media, *what* the next-action question is. It never changes a fact, price, availability, allergen
clearance, or a cap.

## Files
| file | what |
|---|---|
| `lib/ai/menu-playbook.ts` | `buildMenuPlaybook(ctx)` → the overlay section; `classifyPhotoRequest()` + `mediaPaused()` judgment helpers; `MENU_PLAYBOOK_FLAG`. Pure leaf, imported by nothing yet. |
| `scripts/test-menu-playbook.test.ts` | 37 pure cases (classifier + overlay contract, both dialects). CI gate 10. |
| `scripts/eval-scenarios.mjs` · `EVAL_MODE=menu` | 7 live scenarios × both dialects — the §12/§24 behaviours as regression evals. |

## Intent router (judgment)
| intent | behaviour |
|---|---|
| **browse** | ONE structured narrowing question («تحب تشوف المنيو بأي طريقة؟ …») — never a 60-item dump, never a content-free deflection — then SHOW the chosen slice. |
| **recommend** | 2–3 **ranked** picks (signature + honest sensory truth) + ONE preference question. |
| **constraint** (price/spice/kids/diet) | filtered picks that meet the constraint; **diet/health answers carry the mandatory health-caution line** and never assert medical suitability. |
| **compare** | plain-difference answer from item data; help them choose, no dishonest upsell. |
| **availability** | **engine truth only** (live menu/86 state); unavailable → acknowledge-then-pivot; never guess. |
| **allergy** | safety flow takes over — **ALL selling and ALL media PAUSE** (existing law); follow the deterministic gate. |

## Media rules (judgment; Core enforces the numeric cap)
`classifyPhotoRequest(text)` → the intended plan (Core clamps the count):
- **specific** item → **1** photo.
- **category / offers** → sample of **~3**.
- **full menu** → **0 photos first**: ask a category or offer the web-menu link, then send the slice.
- **more** → next **~3**, then offer the web-menu link.
- **after ANY photos** → always a **next-action question**.
- **safety / allergy / complaint / payment** → **no media** (paused).
- **no good photo** → describe honestly in words; never send an unapproved/substitute image.

## Wiring (Core)
Flag **`menu_playbook`, default OFF**, read via `isFeatureExplicitlyEnabled` (same path as `khalid_persona`
/ the other flags). When on, append `buildMenuPlaybook({ dialect, hasWebMenuLink })` to the engine prompt
(after the persona overlay, before the restaurant-data block). No schema change. The overlay refines the
engine's existing browse/photo rules and defers to them on every hard cap; it does not replace the
`present_menu` / `send_item_photos` tools — it is the judgment about *how* to use them.
