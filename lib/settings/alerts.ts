// ============================================================================
// MaitreAI — R4 Alert routing prefs validator (pure; browser+server safe)
// WHERE operational alerts (safety holds, send failures, payment mismatches) are
// delivered. Written to restaurants.alert_routing (JSONB, migration 0064). Purely
// a routing preference — it never suppresses an alert's RECORD (system_alerts is
// always written); it only decides which notification channels fire.
//
// Shape: { channels: { banner?, whatsapp?, email? }, whatsappNumber?: E.164 }.
// At least one channel must be present. Validated so garbage never persists.
// ============================================================================

export const ALERT_CHANNELS: readonly string[] = ["banner", "whatsapp", "email"] as const;

export interface AlertRouting {
  channels: Record<string, boolean>;
  whatsappNumber?: string;
}

export type AlertRoutingParse =
  | { ok: true; routing: AlertRouting }
  | { ok: false; error: string };

const E164 = /^\+[1-9]\d{7,14}$/;

export function parseAlertRouting(input: unknown): AlertRoutingParse {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "alert routing must be an object" };
  }
  const body = input as Record<string, unknown>;
  const rawChannels = body.channels;
  if (!rawChannels || typeof rawChannels !== "object" || Array.isArray(rawChannels)) {
    return { ok: false, error: "channels must be an object" };
  }
  const channels: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(rawChannels as Record<string, unknown>)) {
    if (!ALERT_CHANNELS.includes(k)) return { ok: false, error: `unknown channel: ${k}` };
    if (typeof v !== "boolean") return { ok: false, error: `${k}: must be boolean` };
    channels[k] = v;
  }
  if (!Object.values(channels).some(Boolean)) {
    return { ok: false, error: "at least one channel must be enabled" };
  }
  const routing: AlertRouting = { channels };
  if (channels.whatsapp) {
    const num = body.whatsappNumber;
    if (typeof num !== "string" || !E164.test(num.trim())) {
      return { ok: false, error: "whatsappNumber must be E.164 when whatsapp channel is on" };
    }
    routing.whatsappNumber = num.trim();
  }
  return { ok: true, routing };
}
