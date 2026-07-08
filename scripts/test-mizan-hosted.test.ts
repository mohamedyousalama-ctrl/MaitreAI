// Unit tests for the HOSTED MIZAN reviewer surface (WO-KHALID-STEP5B). Proves:
//   • token auth: sha256 hashing, env-allowlist parsing, fail-closed validation
//   • packet validation: only real (scenario, dimension) with an in-range score is
//     accepted; suiteId is taken from the packet, never trusted from the client
//   • DB layer (stub admin): upsert scopes by packet+token hash and uses the resume
//     upsert tuple; resume read maps rows and is scoped to the one reviewer.
// The honesty core is NOT re-tested here (see test-mizan-panel) — this surface only
// stores what humans tap. Run:
//   node --conditions=react-server --import ./scripts/ts-ext-loader.mjs \
//        --experimental-strip-types scripts/test-mizan-hosted.test.ts
import { hashToken, parseTokenHashes, isValidReviewerToken } from "../lib/mizan/token.ts";
import { reviewerPacket, validateSubmission } from "../lib/mizan/active-packet.ts";
import { upsertReview, getReviewsForReviewer } from "../lib/db/mizan-reviews.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// --- token hashing + allowlist ----------------------------------------------
const T = "BebjnMH0umG2dO40AW40PI11MV4Qx4-8";
const H = hashToken(T);
ok("hash: 64-char lowercase hex", /^[0-9a-f]{64}$/.test(H));
ok("hash: deterministic", hashToken(T) === H);
ok("hash: distinct tokens → distinct hashes", hashToken(T) !== hashToken(T + "x"));

const set = parseTokenHashes(` ${H} , ${hashToken("second")} , not-a-hash , `);
ok("allowlist: parses + trims valid hex hashes", set.has(H) && set.has(hashToken("second")));
ok("allowlist: drops non-hex junk (a raw token can't become a credential)", set.size === 2);
ok("allowlist: uppercase input normalized to lowercase", parseTokenHashes(H.toUpperCase()).has(H));

ok("auth: valid token ∈ allowlist → true", isValidReviewerToken(T, set));
ok("auth: unknown token → false", isValidReviewerToken("nope", set) === false);
ok("auth: empty allowlist → false (fail-closed)", isValidReviewerToken(T, new Set()) === false);
ok("auth: empty token → false", isValidReviewerToken("", set) === false);

// --- packet submission validation -------------------------------------------
const packet = reviewerPacket();
const scenario = packet.items[0].scenarioId;                // e.g. S1-01
const dim = packet.items[0].dimensions[0];                  // e.g. authenticity
const suiteId = packet.items[0].suiteId;

const good = validateSubmission(packet, { scenarioId: scenario, dimension: dim, score: 8, notes: "طبيعي" });
ok("validate: valid cell accepted", good.ok === true);
ok("validate: suiteId taken from packet (not client)", good.ok && good.value.suiteId === suiteId);
ok("validate: notes carried through", good.ok && good.value.notes === "طبيعي");
// suiteId sent by the client is ignored — packet wins
const spoof = validateSubmission(packet, { scenarioId: scenario, dimension: dim, score: 5, suiteId: 999 });
ok("validate: client-sent suiteId is overridden by the packet", spoof.ok && spoof.value.suiteId === suiteId);

ok("validate: unknown scenario rejected", validateSubmission(packet, { scenarioId: "S9-99", dimension: dim, score: 8 }).ok === false);
ok("validate: off-rubric dimension rejected", validateSubmission(packet, { scenarioId: scenario, dimension: "made_up", score: 8 }).ok === false);
ok("validate: score 0 rejected (below range)", validateSubmission(packet, { scenarioId: scenario, dimension: dim, score: 0 }).ok === false);
ok("validate: score 11 rejected (above scale)", validateSubmission(packet, { scenarioId: scenario, dimension: dim, score: 11 }).ok === false);
ok("validate: non-integer score rejected", validateSubmission(packet, { scenarioId: scenario, dimension: dim, score: 7.5 }).ok === false);
ok("validate: missing score rejected", validateSubmission(packet, { scenarioId: scenario, dimension: dim }).ok === false);
ok("validate: empty notes → null", (() => { const r = validateSubmission(packet, { scenarioId: scenario, dimension: dim, score: 6 }); return r.ok && r.value.notes === null; })());

// --- DB layer (stub admin) ---------------------------------------------------
function makeFakeAdmin(seed: { rows?: Record<string, unknown>[]; upsertError?: string; selectError?: string } = {}) {
  const calls: { upserts: { payload: Record<string, unknown>; opts: Record<string, unknown> }[] } = { upserts: [] };
  const rows = seed.rows ?? [];
  function builder() {
    const filters: Record<string, unknown> = {};
    const q: Record<string, unknown> = {};
    q.upsert = (payload: Record<string, unknown>, opts: Record<string, unknown>) => {
      calls.upserts.push({ payload, opts });
      return Promise.resolve({ error: seed.upsertError ? { message: seed.upsertError } : null });
    };
    q.select = () => q;
    q.eq = (c: string, v: unknown) => { filters[c] = v; return q; };
    (q as { then: unknown }).then = (resolve: (v: unknown) => void) => {
      if (seed.selectError) return resolve({ data: null, error: { message: seed.selectError } });
      const out = rows.filter((r) => Object.entries(filters).every(([k, val]) => r[k] === val));
      resolve({ data: out, error: null });
    };
    return q;
  }
  return { admin: { from: () => builder() } as any, calls };
}

// upsert: correct payload + resume tuple + ok
{
  const { admin, calls } = makeFakeAdmin();
  const r = await upsertReview(admin, { packetId: "pkt-1", tokenHash: "hash-abc", sub: { scenarioId: "S1-01", suiteId: 1, dimension: "authenticity", score: 8, notes: "x" } });
  const up = calls.upserts[0];
  ok("db upsert: returns ok", r.ok === true);
  ok("db upsert: scoped to packet + token hash", up.payload.packet_id === "pkt-1" && up.payload.reviewer_token_hash === "hash-abc");
  ok("db upsert: stores the validated cell", up.payload.scenario_id === "S1-01" && up.payload.suite_id === 1 && up.payload.dimension === "authenticity" && up.payload.score === 8 && up.payload.notes === "x");
  ok("db upsert: resume tuple (upsert, not insert)", up.opts.onConflict === "packet_id,reviewer_token_hash,scenario_id,dimension");
  ok("db upsert: bumps updated_at", typeof up.payload.updated_at === "string");
}
// upsert error → ok:false (never a silent success)
{
  const { admin } = makeFakeAdmin({ upsertError: "boom" });
  const r = await upsertReview(admin, { packetId: "p", tokenHash: "h", sub: { scenarioId: "S1-01", suiteId: 1, dimension: "authenticity", score: 8, notes: null } });
  ok("db upsert: error surfaces as ok:false", r.ok === false && r.error === "boom");
}
// resume read: maps rows + scoped to this reviewer only
{
  const seededRows = [
    { packet_id: "pkt-1", reviewer_token_hash: "me", scenario_id: "S1-01", suite_id: 1, dimension: "authenticity", score: 8, notes: "ok" },
    { packet_id: "pkt-1", reviewer_token_hash: "me", scenario_id: "S1-01", suite_id: 1, dimension: "warmth_karam", score: 7, notes: null },
    { packet_id: "pkt-1", reviewer_token_hash: "OTHER", scenario_id: "S1-01", suite_id: 1, dimension: "authenticity", score: 2, notes: "leak" },
    { packet_id: "pkt-2", reviewer_token_hash: "me", scenario_id: "S1-01", suite_id: 1, dimension: "authenticity", score: 9, notes: "other packet" },
  ];
  const { admin } = makeFakeAdmin({ rows: seededRows });
  const got = await getReviewsForReviewer(admin, { packetId: "pkt-1", tokenHash: "me" });
  ok("db read: only THIS reviewer's rows for THIS packet (no cross-reviewer/packet leak)", got.length === 2 && got.every((r) => r.score === 8 || r.score === 7));
  ok("db read: maps columns to camelCase", got[0].scenarioId === "S1-01" && got[0].dimension === "authenticity" && got[0].suiteId === 1);
  ok("db read: null notes preserved", got.some((r) => r.notes === null));
}
// resume read: query error throws (caller 500s, never returns partial)
{
  const { admin } = makeFakeAdmin({ selectError: "db down" });
  let threw = false;
  try { await getReviewsForReviewer(admin, { packetId: "p", tokenHash: "h" }); } catch { threw = true; }
  ok("db read: query error throws", threw === true);
}

console.log(`\nMIZAN HOSTED UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
