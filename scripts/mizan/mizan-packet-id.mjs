// ============================================================================
// MIZAN — hosted packet-id uniquifier (WO-KHALID-STEP5B). PURE, importable (kept
// out of mizan-packet.mjs so a unit test can import it without triggering that
// script's main()).
//
// The hosted API + `mizan-aggregate --db` scope reviewer scores SOLELY by
// packet_id. A date-only id (`mizan-panel-YYYY-MM-DD`) collides when a capture is
// re-run the same day, silently blending/overwriting an earlier run's reviewer
// rows against new replies. So every `--emit-active` capture gets a run-unique id:
// the base id plus a UTC time component (traceable) and a short random nonce
// (collision-proof even within the same second).
// ============================================================================
import { randomBytes } from "node:crypto";

/** baseId + `-HHMMSS-<rand>` (UTC). Two calls never collide. */
export function uniqueHostedPacketId(baseId, now = new Date()) {
  const t = [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join("");
  const nonce = randomBytes(2).toString("hex"); // 4 hex chars
  return `${baseId}-${t}-${nonce}`;
}
