// ============================================================================
// WO-LANDING-CTA — the public marketing page has no self-serve entry, and every
// call to action goes somewhere real.
//
// Run: node --experimental-strip-types scripts/proof-landing-no-login-cta.test.ts
//
// TWO THINGS THIS PROTECTS, AND THEY PULL IN OPPOSITE DIRECTIONS
// --------------------------------------------------------------
// 1. NO SELF-SERVE ENTRY ON THE MARKETING PAGE. Kivo is sold as a custom
//    implementation project. Nobody signs up; they ask for a workflow assessment.
//    A "دخول" or "ابدأ" CTA promises a product you cannot buy that way.
//
// 2. THE AUTH ROUTES MUST STAY ALIVE. This is the dangerous half. getkivo.io and
//    console.wesayachicken.com are the SAME Vercel deployment (project maitre-ai
//    serves getkivo.io, maitre.chat, and every wesayachicken.com subdomain).
//    /login is the real Supabase magic-link auth for a working restaurant with
//    live orders and cash. "Remove login" means remove the marketing LINK, never
//    the route — deleting app/login would lock that operator out of their own
//    console. This test fails if anyone confuses the two.
//
// It also pins the CTA destinations, because all of them were dead in production:
// DEMO_WA_LINK was https://wa.me/000000000000 (a placeholder number) and
// BOOK_CALL_LINK was "#book" (an anchor with no section). Between them they were
// the nav CTA, both hero CTAs and both closing CTAs — so every call to action on
// the public homepage did nothing at all.
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  ✗   ${label}`); }
};
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const page = read("components/landing/Landing.tsx");
const copy = read("components/landing/copy.ts");

// ── 1. no self-serve entry on the marketing surface ────────────────────────
ok("the landing renders no link to /login",
  !/href=\{APP_LOGIN\}/.test(page) && !/href="\/login"/.test(page));
ok("the landing renders no link to /onboarding",
  !/href=\{APP_ONBOARDING\}/.test(page) && !/href="\/onboarding"/.test(page));
ok("neither route constant is even imported into the page",
  !/\bAPP_LOGIN\b/.test(page) && !/\bAPP_ONBOARDING\b/.test(page));

// ── 2. the auth ROUTES are untouched — the half that must never be 'fixed' ──
// If these disappear, console.wesayachicken.com cannot sign in.
ok("app/login still exists (console.wesayachicken.com signs in through it)",
  existsSync(resolve(ROOT, "app/login/page.tsx")));
ok("the console_v2 login still exists", existsSync(resolve(ROOT, "app/(console-v2)/c/login/page.tsx")));
ok("the auth callback still exists", existsSync(resolve(ROOT, "app/auth")));
// Read defensively: if the file is gone the assertion must FAIL and the run must
// still print its summary, not die with an uncaught ENOENT halfway through.
const loginForm = existsSync(resolve(ROOT, "app/login/LoginForm.tsx"))
  ? read("app/login/LoginForm.tsx")
  : "";
ok("/login still performs a real magic-link sign-in", /signInWithOtp\(/.test(loginForm));
ok("copy.ts records WHY the routes are kept but unlinked",
  /must not be deleted/i.test(copy) && /wesayachicken/i.test(copy));

// ── 3. every CTA goes somewhere real ───────────────────────────────────────
ok("the only contact destination is the real inbox",
  /export const CONTACT_EMAIL = "info@getkivo\.io";/.test(copy));
ok("CONTACT_LINK is a mailto built from it",
  /export const CONTACT_LINK = `mailto:\$\{CONTACT_EMAIL\}`;/.test(copy));

// The two dead links, by name. A placeholder number is worse than no CTA: it
// looks live, and the visitor blames the company when nothing happens.
ok("the placeholder WhatsApp number is gone from the page",
  !/wa\.me\/000000000000/.test(page) && !/DEMO_WA_LINK/.test(page));
ok("the placeholder booking anchor is gone from the page",
  !/BOOK_CALL_LINK/.test(page) && !/href="#book"/.test(page));
// Statements only. The copy file DOCUMENTS the two dead links it replaced, so a
// raw-text check matches its own explanation and fails. Same trap as elsewhere.
const copyCode = copy.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
ok("no dead placeholder link survives in the landing copy's actual code",
  !/wa\.me\/0{6,}/.test(copyCode) && !/"#book"/.test(copyCode));

// Every anchor that looks like a CTA must resolve: an in-page anchor, or the
// real mailto. Anything else is a link to nowhere.
const hrefs = [...page.matchAll(/href=(?:\{([^}]+)\}|"([^"]+)")/g)]
  .map((m) => (m[1] ?? m[2]).trim());
// An INTERNAL href must resolve to a real page file. The footer links /privacy,
// /terms, /data-deletion and /contact; if one is ever removed, the live site gets
// a 404 in its legal footer — which for a page that collects personal data is a
// compliance problem, not a broken link.
const internal = hrefs.filter((h) => h.startsWith("/") && h !== "/");
const missing = internal.filter(
  (h) => !existsSync(resolve(ROOT, `app${h}/page.tsx`)) && !existsSync(resolve(ROOT, `app${h}/page.ts`)),
);
ok(`every internal landing link resolves to a real page${missing.length ? ` — 404: ${missing.join(", ")}` : ""}`,
  missing.length === 0);
ok("the legal footer links are all present", ["/privacy", "/terms", "/contact"].every((r) => internal.includes(r)));
ok("at least one CTA actually points at CONTACT_LINK", hrefs.includes("CONTACT_LINK"));

console.log(`\nLANDING-CTA PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
