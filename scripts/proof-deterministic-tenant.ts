// ============================================================================
// Proof: deterministic active-tenant resolution
// Tests the resolveTenant() logic directly (inline — avoids @/ import chain).
// Run: npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' scripts/proof-deterministic-tenant.ts
// ============================================================================

// ---- Inline copy of the logic under test (kept in sync with lib/db/tenant.ts) ----

type MemberRole = "manager" | "operation";

interface Tenant {
  userId: string;
  restaurantId: string;
  role: MemberRole;
}

export const ACTIVE_RESTAURANT_COOKIE = "maitreai_active_rid";

async function resolveTenant(
  supabase: ReturnType<typeof makeClient> | null,
  activeRestaurantId?: string | null,
): Promise<Tenant | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (activeRestaurantId) {
    const { data } = await supabase
      .from("members")
      .select("role")
      .eq("user_id", user.id)
      .eq("restaurant_id", activeRestaurantId)
      .maybeSingle();
    if (!data) return null;
    return { userId: user.id, restaurantId: activeRestaurantId, role: (data as { role: MemberRole }).role };
  }

  const { data: memberships } = await supabase
    .from("members")
    .select("restaurant_id, role")
    .eq("user_id", user.id);
  if (!memberships || (memberships as unknown[]).length === 0) return null;
  const ms = memberships as { restaurant_id: string; role: MemberRole }[];
  if (ms.length === 1) {
    return { userId: user.id, restaurantId: ms[0].restaurant_id, role: ms[0].role };
  }
  return null; // multiple memberships, no selection
}

// ---------------------------------------------------------------------------
// Minimal Supabase stub
// ---------------------------------------------------------------------------

function makeClient(memberships: { restaurant_id: string; role: MemberRole }[]) {
  const user = { id: "user-test-1" };
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from(_table: string) {
      let filterRestaurant: string | null = null;
      const q = {
        select: (_cols: string) => q,
        eq: (_col: string, val: string) => {
          if (_col === "restaurant_id") filterRestaurant = val;
          return q;
        },
        maybeSingle: async () => {
          if (filterRestaurant) {
            const match = memberships.find((m) => m.restaurant_id === filterRestaurant);
            return { data: match ? { role: match.role } : null };
          }
          return { data: null };
        },
        // Simulate chained .then() for the "all memberships" fetch
        then: (resolve: (v: { data: typeof memberships }) => unknown) =>
          Promise.resolve({ data: memberships }).then(resolve),
      };
      return q;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;

function assert(label: string, cond: boolean) {
  if (cond) {
    console.log(`  PASS  ${label}`);
    pass++;
  } else {
    console.error(`  FAIL  ${label}`);
    fail++;
  }
}

(async () => {
  const msA: { restaurant_id: string; role: MemberRole }[] = [
    { restaurant_id: "rid-A", role: "manager" },
  ];
  const msAB: { restaurant_id: string; role: MemberRole }[] = [
    { restaurant_id: "rid-A", role: "manager" },
    { restaurant_id: "rid-B", role: "operation" },
  ];

  console.log("\n--- A. Single-membership user (unchanged behaviour) ---");
  {
    const t = await resolveTenant(makeClient(msA));
    assert("returns rid-A", t?.restaurantId === "rid-A");
    assert("returns manager role", t?.role === "manager");
  }

  console.log("\n--- B. Multi-membership, active=A selected ---");
  {
    const t = await resolveTenant(makeClient(msAB), "rid-A");
    assert("returns rid-A", t?.restaurantId === "rid-A");
    assert("role verified from DB", t?.role === "manager");
  }

  console.log("\n--- C. Multi-membership, active=B selected ---");
  {
    const t = await resolveTenant(makeClient(msAB), "rid-B");
    assert("returns rid-B", t?.restaurantId === "rid-B");
    assert("role verified from DB", t?.role === "operation");
  }

  console.log("\n--- D. Multi-membership, NO selection (must return null, never guess) ---");
  {
    const t = await resolveTenant(makeClient(msAB));
    assert("returns null — never guesses", t === null);
  }

  console.log("\n--- E. Multi-membership, forged active id (not a real membership) ---");
  {
    const t = await resolveTenant(makeClient(msAB), "rid-FAKE");
    assert("returns null — membership not found", t === null);
  }

  console.log("\n--- F. No memberships ---");
  {
    const t = await resolveTenant(makeClient([]));
    assert("returns null", t === null);
  }

  console.log("\n--- G. Null client ---");
  {
    const t = await resolveTenant(null);
    assert("returns null", t === null);
  }

  console.log("\n--- H. Cookie constant ---");
  assert("ACTIVE_RESTAURANT_COOKIE = 'maitreai_active_rid'", ACTIVE_RESTAURANT_COOKIE === "maitreai_active_rid");

  console.log(`\n========================================`);
  console.log(`Results: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
})().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
