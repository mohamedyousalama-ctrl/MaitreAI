// ============================================================================
// فيصل / Faysal — signed opaque tokens.  ⚠ TEMPORARY — the DB replaces this.
//
// WHY THIS EXISTS. The first cut kept the session and the slot holds in a
// process-local Map, and it was wrong in a way that only shows up off a laptop:
// on Vercel, `/api/faysal/reset` and `/api/faysal/turn` are separate functions
// and can land on separate instances, so the greeting was re-sent on the first
// real message and a hold placed by one instance did not exist to the next.
// (It reproduced immediately in `next dev`, which is the good news.)
//
// The fix is to carry the state in the client's own hand, SEALED. Every session
// and every hold is a base64url JSON payload with an HMAC-SHA256 tag. The client
// echoes the token; the server verifies before it parses. Tampering does not
// produce an altered session — it produces NO session, and a fresh one is minted.
//
// THE ONE FIELD THAT MAKES THIS A SAFETY DECISION, not just a plumbing one:
// `triageHold`. SPEC-4 §1.5 R2 requires the rail's verdict to be non-revisable
// for the life of the thread. In a signed token the visitor cannot clear it —
// they can only discard the token, which is a NEW conversation, which is exactly
// what "a new thread is a new patient" means. An unsigned client-carried session
// would have handed them a `triageHold: false` and a booking path out of an
// emergency, which is the single worst bug this product could ship.
//
// THE KEY is derived, never used raw: HMAC(server-secret, a fixed label). The
// secret prefers an explicit `FAYSAL_SESSION_SECRET`, then falls back to another
// server-only secret that is already required in production, and finally to a
// dev-only constant. `isEphemeralSecret()` reports which, so the route can say so
// rather than pretend. The threat model is small by construction: the payload
// holds only what the visitor typed about themselves in a demo, and the tag stops
// them editing it, which is all it has to do.
// ============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";

const DEV_SECRET = "faysal-demo-unsigned-dev-only";

function rawSecret(): string {
  return (
    process.env.FAYSAL_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    DEV_SECRET
  );
}

/** True when the only available secret is the dev constant — tokens are forgeable. */
export function isEphemeralSecret(): boolean {
  return rawSecret() === DEV_SECRET;
}

function keyFor(label: string): Buffer {
  return createHmac("sha256", rawSecret()).update(`faysal/v1/${label}`).digest();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function tag(label: string, body: string): string {
  return b64url(createHmac("sha256", keyFor(label)).update(body).digest()).slice(0, 27);
}

/** Seal an arbitrary JSON-serialisable value under a label. */
export function seal(label: string, value: unknown): string {
  const body = b64url(Buffer.from(JSON.stringify(value), "utf8"));
  return `${body}.${tag(label, body)}`;
}

/**
 * Open a sealed token. Returns null on a bad shape, a bad tag or unparseable
 * JSON — never a partially-trusted object. The comparison is constant-time.
 */
export function open<T>(label: string, token: unknown): T | null {
  if (typeof token !== "string" || token.length > 16_384) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = tag(label, body);
  if (given.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
    return JSON.parse(unb64url(body).toString("utf8")) as T;
  } catch {
    return null;
  }
}
