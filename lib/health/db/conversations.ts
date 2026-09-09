// ============================================================================
// فيصل / Faysal — conversations and messages.
//
// These are separate tables from Kivo's, and the reason is not tidiness: a
// clinic's conversations are health records end to end. A separate table means
// a separate retention policy, a separate deletion path and a separate export —
// things you want to be able to point at during a PDPL conversation rather than
// derive with a `where` clause.
//
// §8/POL-03 bounds what may be written here: a display name, a WhatsApp number,
// the chosen service, site and time. No national ID, no Iqama, no insurance
// member number, no clinical detail beyond the service name. This layer cannot
// enforce that — it is a shape, not a policy — but the storage is deliberately
// narrow so a violation has to be typed deliberately into `meta`.
// ============================================================================

import { HEALTH_TABLES } from "./types";
import type { HealthConversationRow, HealthMessageRow } from "./types";
import { unwrapMany, unwrapMaybeOne, unwrapOne } from "./client";
import type { HealthDb } from "./client";

export async function findConversation(
  db: HealthDb,
  clinicId: string,
  channel: HealthConversationRow["channel"],
  patientRef: string,
): Promise<HealthConversationRow | null> {
  return unwrapMaybeOne<HealthConversationRow>(
    db
      .from(HEALTH_TABLES.conversations)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("channel", channel)
      .eq("patient_ref", patientRef)
      .maybeSingle(),
    "findConversation",
  );
}

export interface NewConversation {
  clinic_id: string;
  channel: HealthConversationRow["channel"];
  patient_ref: string;
  site_id?: string | null;
  display_name?: string | null;
  locale?: string;
}

/**
 * Upsert on (clinic_id, channel, patient_ref) — the natural key. Returns the
 * row either way, so a webhook handler never has to branch on "did it exist".
 */
export async function upsertConversation(
  db: HealthDb,
  conversation: NewConversation,
): Promise<HealthConversationRow> {
  return unwrapOne<HealthConversationRow>(
    db
      .from(HEALTH_TABLES.conversations)
      .upsert(conversation, { onConflict: "clinic_id,channel,patient_ref" })
      .select("*")
      .maybeSingle(),
    "upsertConversation",
  );
}

export async function listConversations(
  db: HealthDb,
  clinicId: string,
  limit = 50,
): Promise<HealthConversationRow[]> {
  return unwrapMany<HealthConversationRow>(
    db
      .from(HEALTH_TABLES.conversations)
      .select("*")
      .eq("clinic_id", clinicId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit),
    "listConversations",
  );
}

export async function updateConversation(
  db: HealthDb,
  clinicId: string,
  conversationId: string,
  patch: Partial<
    Pick<
      HealthConversationRow,
      "site_id" | "display_name" | "state" | "owner" | "safety" | "consent" | "last_message_at"
    >
  >,
): Promise<HealthConversationRow | null> {
  return unwrapMaybeOne<HealthConversationRow>(
    db
      .from(HEALTH_TABLES.conversations)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("clinic_id", clinicId)
      .eq("id", conversationId)
      .select("*")
      .maybeSingle(),
    "updateConversation",
  );
}

export interface NewMessage {
  clinic_id: string;
  conversation_id: string;
  direction: HealthMessageRow["direction"];
  sender: HealthMessageRow["sender"];
  body: string;
  wa_message_id?: string | null;
  status?: HealthMessageRow["status"];
  meta?: Record<string, unknown>;
}

export async function insertMessage(db: HealthDb, message: NewMessage): Promise<HealthMessageRow> {
  return unwrapOne<HealthMessageRow>(
    db.from(HEALTH_TABLES.messages).insert(message).select("*").maybeSingle(),
    "insertMessage",
  );
}

export async function listMessages(
  db: HealthDb,
  clinicId: string,
  conversationId: string,
  limit = 200,
): Promise<HealthMessageRow[]> {
  return unwrapMany<HealthMessageRow>(
    db
      .from(HEALTH_TABLES.messages)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("conversation_id", conversationId)
      .order("created_at")
      .limit(limit),
    "listMessages",
  );
}

/** Inbound WhatsApp delivery is at-least-once; the provider id is the dedupe key. */
export async function findMessageByWaId(
  db: HealthDb,
  clinicId: string,
  waMessageId: string,
): Promise<HealthMessageRow | null> {
  return unwrapMaybeOne<HealthMessageRow>(
    db
      .from(HEALTH_TABLES.messages)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("wa_message_id", waMessageId)
      .maybeSingle(),
    "findMessageByWaId",
  );
}
