// ============================================================================
// MaitreAI — resolve members.id → display name (server-only).
// `members` has no name column, so the name comes from the auth user
// (user_metadata.name → email local-part → safe fallback). Used by HX1 to label
// human-authored turns in Karim's context. Batched (one auth lookup per distinct
// member). Resolved server-side from the member record — never client-supplied.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const FALLBACK = "موظف";

export async function resolveMemberNames(
  admin: SupabaseClient,
  memberIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const ids = [...new Set(memberIds.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!ids.length) return out;

  const { data: members } = await admin.from("members").select("id, user_id").in("id", ids);
  for (const m of (members ?? []) as { id: string; user_id: string }[]) {
    let name = FALLBACK;
    try {
      const { data } = await admin.auth.admin.getUserById(m.user_id);
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const metaName = typeof meta.name === "string" ? meta.name.trim() : "";
      const email = data.user?.email ?? "";
      name = metaName || (email ? email.split("@")[0] : "") || FALLBACK;
    } catch {
      /* name stays the safe fallback — never blank */
    }
    out.set(m.id, name);
  }
  return out;
}
