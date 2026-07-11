// WO-LIVE-3 §2/§4 — RED-FIRST: media budget WINDOW reset + pre-turn directive (pure).
// §2: the 6/conversation budget resets on EITHER a rolling 24h OR a new order start,
// whichever first — from existing timestamps. §4: the directive tells Karim to point to
// the web menu link (never pretend photos were sent) when the budget is spent or the
// customer asked for the menu.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/test-media-window.test.ts
import { isMediaWindowReset, buildMediaDirective, MEDIA_WINDOW_MS } from "../lib/messaging/media-window.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

const NOW = 1_800_000_000_000; // fixed epoch for determinism
const H = 60 * 60 * 1000;

// ── §2 reset predicate ──
ok("no media yet (null) → reset", isMediaWindowReset({ lastMediaAtMs: null, nowMs: NOW, latestOrderAtMs: null }));
ok("MEDIA_WINDOW_MS is 24h", MEDIA_WINDOW_MS === 24 * H);

// Mohamed's red-first scenario A: spent 6 photos YESTERDAY → can send TODAY (24h rolled).
ok("A: last media 25h ago → reset (send today)",
  isMediaWindowReset({ lastMediaAtMs: NOW - 25 * H, nowMs: NOW, latestOrderAtMs: null }));
ok("exactly 24h ago → reset (>=)",
  isMediaWindowReset({ lastMediaAtMs: NOW - 24 * H, nowMs: NOW, latestOrderAtMs: null }));

// Mohamed's red-first scenario B: spent 6 this MORNING → can send again once a NEW ORDER
// starts (even though < 24h). Without a new order → NOT reset (stays capped, offers link).
ok("B: last media 4h ago, NO new order → NOT reset (still capped)",
  !isMediaWindowReset({ lastMediaAtMs: NOW - 4 * H, nowMs: NOW, latestOrderAtMs: NOW - 6 * H }));
ok("B: last media 4h ago, new order 1h ago (after) → reset (send again)",
  isMediaWindowReset({ lastMediaAtMs: NOW - 4 * H, nowMs: NOW, latestOrderAtMs: NOW - 1 * H }));
ok("B: last media 4h ago, latestOrder null → NOT reset",
  !isMediaWindowReset({ lastMediaAtMs: NOW - 4 * H, nowMs: NOW, latestOrderAtMs: null }));
ok("order exactly AT last media (not strictly after) → NOT reset",
  !isMediaWindowReset({ lastMediaAtMs: NOW - 4 * H, nowMs: NOW, latestOrderAtMs: NOW - 4 * H }));
ok("within 23h AND order before → NOT reset",
  !isMediaWindowReset({ lastMediaAtMs: NOW - 23 * H, nowMs: NOW, latestOrderAtMs: NOW - 30 * H }));

// ── §4 directive ──
ok("flag OFF → null (byte-identical) even if exhausted+asked",
  buildMediaDirective({ enabled: false, budgetExhausted: true, customerAskedForMenu: true }) === null);
ok("healthy budget, no ask → null (unperturbed normal turn)",
  buildMediaDirective({ enabled: true, budgetExhausted: false, customerAskedForMenu: false }) === null);
const askDir = buildMediaDirective({ enabled: true, budgetExhausted: false, customerAskedForMenu: true });
ok("menu ask → directive mentions the menu link", !!askDir && /المنيو/.test(askDir) && /👆/.test(askDir));
const exhDir = buildMediaDirective({ enabled: true, budgetExhausted: true, customerAskedForMenu: false });
ok("exhausted → directive says don't promise photos / point to link", !!exhDir && /لا تَعِد|رابط المنيو/.test(exhDir));
ok("menu ask WINS over exhausted (both true → the ask directive)",
  buildMediaDirective({ enabled: true, budgetExhausted: true, customerAskedForMenu: true }) === askDir);
ok("exhausted directive INSTRUCTS honesty (don't claim photos: «لا تقل … أرسلت صور»)",
  !!exhDir && /لا تقل/.test(exhDir) && /بصراحة/.test(exhDir));

console.log(`\n${fail === 0 ? "✅" : "❌"} media-window: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
