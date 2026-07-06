// ============================================================================
// WO-PHOTO-THREAD proof — the compact captioned photo SEQUENCE (Mohamed's note 4,
// "small thread moving"). Pure tests of buildPhotoThreadCaptions + source-asserts
// that it reshapes ONLY the post-cap slice, so every media law still binds.
//
// Run: node --experimental-strip-types scripts/proof-photo-thread.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildPhotoThreadCaptions } from "../lib/messaging/photo-thread.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

const P = (name: string, price: number) => ({ name, caption: `${name} — ${price} ر.س`, imageUrl: `https://x/${name}` });

// ---- single image: UNCHANGED (no lead — one card isn't a wall) --------------
{
  const one = [P("كبسة لحم", 45)];
  const c = buildPhotoThreadCaptions(one);
  ok("single image → one caption", c.length === 1);
  ok("single image → caption unchanged (no lead)", c[0] === one[0].caption && !c[0].includes("📸"));
}

// ---- empty ------------------------------------------------------------------
ok("empty → []", buildPhotoThreadCaptions([]).length === 0);

// ---- 2 images: lead on image 0 names the set; each keeps name—price ---------
{
  const two = [P("كبسة لحم", 45), P("مندي دجاج", 50)];
  const c = buildPhotoThreadCaptions(two);
  ok("2 images → 2 captions", c.length === 2);
  ok("(2) image0 has the lead marker", c[0].includes("📸 صور:"));
  ok("(2) lead names BOTH items", c[0].includes("كبسة لحم") && c[0].includes("مندي دجاج"));
  ok("(2) image0 keeps its own name—price line", c[0].includes("كبسة لحم — 45 ر.س"));
  ok("(2) image1 = its own name—price, NO lead", c[1] === two[1].caption && !c[1].includes("📸"));
}

// ---- 3 images: order preserved; every image name+price present --------------
{
  const three = [P("كبسة لحم", 45), P("مندي دجاج", 50), P("مظبي", 55)];
  const c = buildPhotoThreadCaptions(three);
  ok("3 images → 3 captions", c.length === 3);
  ok("(3) order preserved — each caption aligns to its item",
    c[0].includes("كبسة لحم — 45") && c[1] === three[1].caption && c[2] === three[2].caption);
  ok("(3) lead names all three", ["كبسة لحم", "مندي دجاج", "مظبي"].every((n) => c[0].includes(n)));
  ok("(3) every price still present across the set",
    c.join("\n").includes("45") && c.join("\n").includes("50") && c.join("\n").includes("55"));
}

// ---- 4+ (guard against runaway; cap makes this rare) → lead summarizes tail --
{
  const four = [P("a", 1), P("b", 2), P("c", 3), P("d", 4)];
  const c = buildPhotoThreadCaptions(four);
  ok("(4) lead summarizes with «وغيرها» past the name limit", c[0].includes("وغيرها"));
  ok("(4) all four still captioned in order", c.length === 4 && c[3] === four[3].caption);
}

// ---- purity: input not mutated ----------------------------------------------
{
  const items = [P("x", 9), P("y", 8)];
  const before = JSON.stringify(items);
  buildPhotoThreadCaptions(items);
  ok("does not mutate input", JSON.stringify(items) === before);
}

// ============================================================================
// SOURCE-ASSERTS — the wiring preserves every media law (presentation within cap)
// ============================================================================
const rs = read("lib/messaging/respond-and-send.ts");

ok("imports buildPhotoThreadCaptions", /import \{ buildPhotoThreadCaptions \} from "\.\/photo-thread"/.test(rs));

// It runs on the POST-CAP slice — decideMediaSend still decides which/how many.
ok("caps unchanged: decideMediaSend still called with requested = photoRequests.length",
  /decideMediaSend\(\{[\s\S]*requested: photoRequests\.length/.test(rs));
ok("reshapes the post-cap slice (photoRequests.slice(0, decision.allowed))",
  /const shown = photoRequests\.slice\(0, decision\.allowed\)/.test(rs) &&
  /buildPhotoThreadCaptions\(shown\)/.test(rs));

// GATED behind media_guard (standing law: behavior change flaggable, OFF by default):
// a flag-OFF tenant keeps byte-identical per-image captions.
ok("reshape is GATED behind media_guard (OFF → per-image captions unchanged)",
  /const captions = mediaGuardOn \? buildPhotoThreadCaptions\(shown\) : shown\.map\(\(p\) => p\.caption\)/.test(rs));

// The hard-zero / budget-exhausted early return happens BEFORE the sequencing, so
// safety-zero (and complaint/payment) still send nothing and the reshape never runs.
const idxZeroReturn = rs.indexOf("if (decision.allowed === 0)");
const idxReshape = rs.indexOf("buildPhotoThreadCaptions(shown)");
ok("hard-zero / exhausted early-return exists before the reshape",
  idxZeroReturn > 0 && idxReshape > idxZeroReturn);
ok("safety-zero note still fires (media_suppressed on hardZero)",
  /if \(hardZero\)[\s\S]*media_suppressed/.test(rs));

// The send loop uses the sequenced captions, in order.
ok("send loop uses captions[i] for each shown image, in order",
  /for \(let i = 0; i < shown\.length; i\+\+\)[\s\S]*caption: captions\[i\]/.test(rs));

// The existing next-action question is downstream of the reply (unchanged): the
// photo path is fire-and-forget and never suppressed the reply text before it.
ok("photo send remains additive (reply text path untouched — sendRequestedPhotos is separate)",
  rs.includes("async function sendRequestedPhotos("));

console.log(`\nWO-PHOTO-THREAD PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
