# Specs

> **Owner:** PM + Engineering · **Status:** Active · **Last reviewed:** 2026-07-10

Product/feature specifications that are part of Kivo's in-repo canon. A spec describes
WHAT a module does and the rules it must honor; ADRs (`../decisions/`) record the
cross-cutting decisions a spec inherits.

Add a spec here as `MODULE_NAME_SPEC.md`, with the standard header
(`Owner` / `Status` / `Last reviewed`) at the top.

## Pending import (canon currently outside git)

The repo-canon WO (T3) called for moving two existing specs into this folder:

- `ALLERGY_COMPANION_SPEC.md`
- `DELIVERY_MODULE_SPEC.md`

**Neither is committed to this repository** (no `*SPEC*.md` exists in git today), so they
could not be `git mv`d — moving preserves history only for files already tracked, and
fabricating their contents would invent canon rather than relocate it. They remain part
of the "canon that lives outside git" this WO exists to fix. **Action for the owner:**
add each file's real content here (with the standard header) so it becomes tracked
canon; this README is the placeholder until then.
