// ============================================================================
// MaitreAI — MIZAN reviewer token helper (WO-KHALID-STEP5B). Pure crypto, no I/O
// beyond reading the env allowlist. Usable from the API route, the page, and the
// unit test (no "server-only" so it strip-types cleanly under the test loader).
//
// ★ SECURITY DECISION: a reviewer's URL token IS their auth (no login). We NEVER
// store the raw token and NEVER commit it. The env var MIZAN_REVIEWER_TOKEN_HASHES
// holds the comma-separated SHA-256 HASHES of the minted tokens; the DB stores the
// same hash as the reviewer identity. Auth = sha256(url token) ∈ env hashes. The
// raw token exists only in the reviewer's URL and in whoever minted it.
// ============================================================================

import { createHash } from "node:crypto";

/** SHA-256 hex of a reviewer's URL token. Same function on both sides of auth:
 *  the minter hashes to produce the env allowlist, and the API hashes the incoming
 *  URL token to match against it (and to key the reviewer's DB rows). */
export function hashToken(token: string): string {
  return createHash("sha256").update(String(token), "utf8").digest("hex");
}

/** Parse MIZAN_REVIEWER_TOKEN_HASHES into a normalized Set of lowercase hex hashes.
 *  Blank/whitespace entries are dropped; anything that isn't a 64-char hex hash is
 *  ignored (a mis-pasted raw token can't accidentally become a valid credential). */
export function parseTokenHashes(raw: string | undefined | null): Set<string> {
  const out = new Set<string>();
  for (const part of String(raw ?? "").split(",")) {
    const h = part.trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(h)) out.add(h);
  }
  return out;
}

/** True when the URL token authenticates against the env allowlist. Constant work
 *  regardless of match; returns false when the allowlist is empty (fail-closed). */
export function isValidReviewerToken(token: string, allowlist: Set<string>): boolean {
  if (!token || allowlist.size === 0) return false;
  return allowlist.has(hashToken(token));
}

/** Read the allowlist from the environment (server-side only). */
export function reviewerTokenAllowlist(): Set<string> {
  return parseTokenHashes(process.env.MIZAN_REVIEWER_TOKEN_HASHES);
}
