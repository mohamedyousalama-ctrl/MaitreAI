// ============================================================================
// Multi-tenant isolation & concurrency harness — orchestrator.
// Provisions two disposable tenants (A, B), runs the selected suites, prints a
// pass/fail table, tears the tenants down. Safe-by-default (see config.mjs).
// Run: node tests/multitenant/run.mjs  [--keep] [--only=isolation,concurrency,...]
// ============================================================================
import {
  assertSafeTarget, admin, userClient, anonClient, guardRestaurantId, guardName,
  TEST_PREFIX, APP_URL, SKIP_SIG, rand,
} from "./config.mjs";

assertSafeTarget();

const ARGS = process.argv.slice(2);
const KEEP = ARGS.includes("--keep");
const ONLY = (ARGS.find((a) => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean);
const want = (name) => ONLY.length === 0 || ONLY.includes(name);

const A = admin();
const createdRestaurants = new Set();
const createdUsers = [];
const results = []; // {suite, name, pass, detail, severity}
const rec = (suite, name, pass, detail = "", severity = "") => results.push({ suite, name, pass, detail, severity });

// ── provisioning ────────────────────────────────────────────────────────────
async function provisionTenant(tag) {
  const name = guardName(`${TEST_PREFIX}${tag}_${rand()}`);
  const email = `${TEST_PREFIX}${tag}_${rand()}@example.test`;
  const password = `Pw_${rand()}${rand()}!`;

  const { data: u, error: ue } = await A.auth.admin.createUser({ email, password, email_confirm: true });
  if (ue) throw new Error(`createUser(${tag}): ${ue.message}`);
  createdUsers.push(u.user.id);

  const { data: r, error: re } = await A.from("restaurants").insert({
    name, currency: "EGP", default_language: "ar", timezone: "Africa/Cairo", active: true,
    // a per-tenant inbound number so the webhook routing suite can distinguish A vs B
    wa_phone_number_id: `pnid_${tag}_${rand()}`,
    wa_verify_token: `vt_${tag}_${rand()}`,
  }).select("id, wa_phone_number_id").single();
  if (re) throw new Error(`insert restaurant(${tag}): ${re.message}`);
  const restaurantId = r.id;
  createdRestaurants.add(restaurantId);

  const { error: me } = await A.from("members").insert({ restaurant_id: restaurantId, user_id: u.user.id, role: "manager" });
  if (me) throw new Error(`insert member(${tag}): ${me.message}`);

  // seed distinct data so any cross-read is unambiguous
  const { data: cat } = await A.from("menu_categories").insert({ restaurant_id: restaurantId, name: `cat_${tag}`, sort: 0 }).select("id").single();
  await A.from("menu_items").insert({ restaurant_id: restaurantId, category_id: cat?.id ?? null, name: `SECRET_ITEM_${tag}_${rand()}`, price: 100, available: true });
  const { data: cust } = await A.from("customers").insert({ restaurant_id: restaurantId, name: `cust_${tag}`, phone: `+2010${Math.floor(Math.random()*1e8)}` }).select("id").single();
  const { data: conv } = await A.from("conversations").insert({ restaurant_id: restaurantId, customer_id: cust?.id ?? null, channel: "whatsapp" }).select("id").single();
  if (conv?.id) await A.from("messages").insert({ restaurant_id: restaurantId, conversation_id: conv.id, sender: "customer", text: `SECRET_MSG_${tag}` });
  const { data: ord } = await A.from("orders").insert({
    restaurant_id: restaurantId, customer_id: cust?.id ?? null, conversation_id: conv?.id ?? null,
    order_status: "pending_confirmation", payment_status: "pending", total: 100, subtotal: 100, currency: "EGP",
  }).select("id").single();

  // sign in to get a real user JWT (RLS path)
  const probe = anonClient();
  const { data: sess, error: se } = await probe.auth.signInWithPassword({ email, password });
  if (se) throw new Error(`signIn(${tag}): ${se.message}`);

  return {
    tag, restaurantId, userId: u.user.id, email, password,
    jwt: sess.session.access_token,
    waPnid: r.wa_phone_number_id,
    ids: { categoryId: cat?.id, customerId: cust?.id, conversationId: conv?.id, orderId: ord?.id },
  };
}

async function teardown() {
  // delete only what we created, FK-safe order, id-guarded
  for (const rid of createdRestaurants) {
    guardRestaurantId(createdRestaurants, rid);
    for (const t of ["messages","order_events","orders","conversations","customers",
                      "menu_item_modifiers","menu_items","menu_categories","members"]) {
      await A.from(t).delete().eq("restaurant_id", rid);
    }
    await A.from("conversation_locks").delete().in("conversation_id", []); // no-op guard
    await A.from("restaurants").delete().eq("id", rid);
  }
  for (const uid of createdUsers) await A.auth.admin.deleteUser(uid).catch(() => {});
}

// ── suites ───────────────────────────────────────────────────────────────────

// 1. RLS cross-tenant read/write denial — A's authed session vs B's data.
async function suiteIsolation(a, b) {
  const ca = userClient(a.jwt);
  const tables = [
    ["orders", "restaurant_id"], ["conversations", "restaurant_id"], ["customers", "restaurant_id"],
    ["messages", "restaurant_id"], ["menu_items", "restaurant_id"], ["restaurants", "id"],
  ];
  for (const [table, col] of tables) {
    const { data, error } = await ca.from(table).select("*").eq(col, b.restaurantId);
    const leaked = (data?.length ?? 0) > 0;
    rec("isolation", `A reads B.${table}`, !leaked && !error?.message?.includes("permission"),
      leaked ? `LEAK: returned ${data.length} of B's ${table} rows` : "0 rows (denied by RLS)",
      leaked ? "CRITICAL" : "");
  }
  // cross-tenant WRITE: A tries to update B's order
  const { data: upd, error: we } = await ca.from("orders").update({ total: 999999 }).eq("restaurant_id", b.restaurantId).select("id");
  const wrote = (upd?.length ?? 0) > 0;
  rec("isolation", "A writes B.orders", !wrote, wrote ? `LEAK: updated ${upd.length} of B's orders` : `denied (${we?.code || "0 rows affected"})`,
    wrote ? "CRITICAL" : "");
  // sanity: A CAN read its own
  const { data: own } = await ca.from("orders").select("id").eq("restaurant_id", a.restaurantId);
  rec("isolation", "A reads A.orders (control)", (own?.length ?? 0) > 0, `${own?.length ?? 0} own rows`);
}

// 2. Cache bleed — interleaved per-tenant reads must stay separated.
async function suiteCache(a, b) {
  const ca = userClient(a.jwt), cb = userClient(b.jwt);
  const calls = await Promise.all([
    ca.from("menu_items").select("name").eq("restaurant_id", a.restaurantId),
    cb.from("menu_items").select("name").eq("restaurant_id", b.restaurantId),
    ca.from("menu_items").select("name").eq("restaurant_id", a.restaurantId),
    cb.from("menu_items").select("name").eq("restaurant_id", b.restaurantId),
  ]);
  const aNames = [...calls[0].data ?? [], ...calls[2].data ?? []].map((x) => x.name);
  const bNames = [...calls[1].data ?? [], ...calls[3].data ?? []].map((x) => x.name);
  const aClean = aNames.every((n) => n.includes(`_${a.tag}_`)) && aNames.length > 0;
  const bClean = bNames.every((n) => n.includes(`_${b.tag}_`)) && bNames.length > 0;
  rec("cache", "interleaved loadBrain reads stay tenant-separated", aClean && bClean,
    aClean && bClean ? "each side saw only its own SECRET_ITEM" : `A=${JSON.stringify(aNames)} B=${JSON.stringify(bNames)}`,
    aClean && bClean ? "" : "CRITICAL");
}

// 3. conversation_locks mutex correctness + anon-tamper exposure.
async function suiteLock(a) {
  const convId = a.ids.conversationId;
  // 3a. PK serialization: two concurrent inserts for one conversation → exactly one wins.
  await A.from("conversation_locks").delete().eq("conversation_id", convId);
  const tok = () => rand() + rand();
  const ins = await Promise.allSettled([
    A.from("conversation_locks").insert({ conversation_id: convId, lock_token: tok() }),
    A.from("conversation_locks").insert({ conversation_id: convId, lock_token: tok() }),
  ]);
  const ok = ins.filter((r) => r.status === "fulfilled" && !r.value.error).length;
  const conflict = ins.filter((r) => r.status === "fulfilled" && r.value.error?.code === "23505").length;
  rec("lock", "PK serializes concurrent lock acquire", ok === 1 && conflict === 1,
    `${ok} acquired / ${conflict} conflicted (want 1/1)`, ok === 1 ? "" : "HIGH");

  // 3b. EXPOSURE: can a pure-anon client tamper with the lock table? (it should NOT)
  const anon = anonClient();
  const { error: delErr, count } = await anon.from("conversation_locks").delete({ count: "exact" }).eq("conversation_id", convId);
  const anonCouldDelete = !delErr; // no error => the delete was permitted
  rec("lock", "anon CANNOT delete conversation_locks", !anonCouldDelete,
    anonCouldDelete ? `LEAK: anon delete permitted (removed lock rows) — defeats Pillar-3 serialization` : `denied (${delErr?.code})`,
    anonCouldDelete ? "HIGH" : "");
  await A.from("conversation_locks").delete().eq("conversation_id", convId); // cleanup
}

// 4. Concurrency — concurrent edits to one order + concurrent menu publish-shape.
async function suiteConcurrency(a) {
  const oid = a.ids.orderId;
  // 4a. 10 concurrent status updates → row must end in exactly one valid state, no error storm.
  const states = ["paid","preparing","ready","out_for_delivery","delivered"];
  const res = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) => A.from("orders").update({ order_status: states[i % states.length] }).eq("id", oid))
  );
  const errs = res.filter((r) => r.status === "rejected" || r.value?.error).length;
  const { data: final } = await A.from("orders").select("order_status").eq("id", oid).single();
  const consistent = states.includes(final?.order_status);
  rec("concurrency", "concurrent order edits leave a consistent state", errs === 0 && consistent,
    `errors=${errs}, final=${final?.order_status}`, consistent ? "" : "HIGH");

  // 4b. concurrent menu-item insert race (publish-shape): N parallel inserts of the
  // same item name; assert no crash and count is deterministic (idempotency is the
  // app's job — here we surface whether the DB layer dupes silently).
  const itemName = `RACE_ITEM_${rand()}`;
  await Promise.allSettled(Array.from({ length: 5 }, () =>
    A.from("menu_items").insert({ restaurant_id: a.restaurantId, name: itemName, price: 1, available: true })));
  const { data: dupes } = await A.from("menu_items").select("id").eq("restaurant_id", a.restaurantId).eq("name", itemName);
  rec("concurrency", "concurrent identical menu inserts (dupe visibility)", true,
    `${dupes?.length ?? 0} rows created for same name (no uniqueness at DB layer — relies on app publish lock)`,
    (dupes?.length ?? 0) > 1 ? "INFO" : "");
  await A.from("menu_items").delete().eq("restaurant_id", a.restaurantId).eq("name", itemName);
}

// 5. API routes — A's auth against B's restaurant_id must be denied (needs APP_URL).
async function suiteApi(a, b) {
  if (!APP_URL) { rec("api", "(skipped)", true, "TEST_APP_URL not set"); return; }
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${a.jwt}` };
  // menu publish against B's restaurant — must 403
  const r1 = await fetch(`${APP_URL}/api/onboarding/menu/publish`, {
    method: "POST", headers: authHeaders, body: JSON.stringify({ restaurantId: b.restaurantId, draftId: "x" }),
  }).catch((e) => ({ status: 0, _e: e.message }));
  rec("api", "POST menu/publish {B} as A → denied", [401,403].includes(r1.status), `status ${r1.status}`, [401,403].includes(r1.status) ? "" : "CRITICAL");
  // settings/ops GET resolves tenant from session, not param — confirm it returns A's, never B's
  const r2 = await fetch(`${APP_URL}/api/settings/whatsapp`, { headers: authHeaders }).catch((e) => ({ status: 0 }));
  rec("api", "GET settings/whatsapp resolves caller's own tenant", r2.status === 200 || r2.status === 404, `status ${r2.status}`);
}

// 6. Webhook routing + no-match misroute (needs APP_URL).
async function suiteWebhook(a, b) {
  if (!APP_URL) { rec("webhook", "(skipped)", true, "TEST_APP_URL not set"); return; }
  if (!SKIP_SIG) { rec("webhook", "(skipped)", true, "TEST_WEBHOOK_SKIP_SIG not set (cannot sign per-tenant)"); return; }
  const inbound = (pnid, text, from) => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: pnid },
      messages: [{ from, id: `wamid_${rand()}`, type: "text", text: { body: text }, timestamp: `${Math.floor(Date.now()/1000)}` }],
      contacts: [{ profile: { name: "tester" }, wa_id: from }],
    } }] }],
  });
  const post = (body) => fetch(`${APP_URL}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  await post(inbound(a.waPnid, `HELLO_A_${rand()}`, "201000000A1"));
  await post(inbound(b.waPnid, `HELLO_B_${rand()}`, "201000000B1"));
  await new Promise((r) => setTimeout(r, 1500));
  // assert each landed under the right tenant
  const { data: aMsgs } = await A.from("messages").select("text").eq("restaurant_id", a.restaurantId).ilike("text", "HELLO_A_%");
  const { data: bMsgs } = await A.from("messages").select("text").eq("restaurant_id", b.restaurantId).ilike("text", "HELLO_B_%");
  const { data: aWrong } = await A.from("messages").select("text").eq("restaurant_id", a.restaurantId).ilike("text", "HELLO_B_%");
  rec("webhook", "inbound A stored under A", (aMsgs?.length ?? 0) > 0, `${aMsgs?.length ?? 0} msgs`);
  rec("webhook", "inbound B stored under B", (bMsgs?.length ?? 0) > 0, `${bMsgs?.length ?? 0} msgs`);
  rec("webhook", "no A/B crossing", (aWrong?.length ?? 0) === 0, `${aWrong?.length ?? 0} crossed`, (aWrong?.length ?? 0) ? "CRITICAL" : "");

  // FAILURE PATH: phone_number_id matching NO tenant must NOT be persisted under a default.
  const marker = `NOMATCH_${rand()}`;
  const before = createdRestaurants.size;
  await post(inbound(`pnid_nomatch_${rand()}`, marker, "201000000X1"));
  await new Promise((r) => setTimeout(r, 1500));
  // search every created tenant — the message must be NOWHERE (rejected), not on a fallback tenant
  let landedOn = null;
  for (const rid of createdRestaurants) {
    const { data } = await A.from("messages").select("text").eq("restaurant_id", rid).ilike("text", `${marker}%`);
    if ((data?.length ?? 0) > 0) { landedOn = rid; break; }
  }
  rec("webhook", "no-match inbound is NOT misrouted to a default tenant", landedOn === null,
    landedOn ? `MISROUTE: stored under fallback tenant ${landedOn} (env-fallback path)` : "not persisted to any tenant (correct)",
    landedOn ? "HIGH" : "");
}

// ── run ──────────────────────────────────────────────────────────────────────
(async () => {
  let a, b;
  try {
    console.log("→ provisioning disposable tenants A, B …");
    [a, b] = await Promise.all([provisionTenant("A"), provisionTenant("B")]);
    console.log(`  A=${a.restaurantId}  B=${b.restaurantId}`);

    if (want("isolation")) await suiteIsolation(a, b);
    if (want("cache")) await suiteCache(a, b);
    if (want("lock")) await suiteLock(a);
    if (want("concurrency")) await suiteConcurrency(a);
    if (want("api")) await suiteApi(a, b);
    if (want("webhook")) await suiteWebhook(a, b);
  } catch (e) {
    rec("harness", "fatal", false, e.message, "BLOCKER");
    console.error(e);
  } finally {
    if (!KEEP) { console.log("→ tearing down …"); await teardown().catch((e) => console.error("teardown error:", e.message)); }
    else console.log("→ --keep set, leaving tenants in place");
  }

  // report
  const pad = (s, n) => String(s).padEnd(n);
  console.log("\n================ RESULTS ================");
  console.log(pad("SUITE", 13), pad("RESULT", 7), pad("SEV", 9), "TEST / DETAIL");
  let fails = 0;
  for (const r of results) {
    if (!r.pass) fails++;
    console.log(pad(r.suite, 13), pad(r.pass ? "PASS ✅" : "FAIL 🚩", 7), pad(r.severity || "-", 9), `${r.name} — ${r.detail}`);
  }
  console.log("=========================================");
  console.log(`${results.length} tests, ${fails} failed.`);
  process.exit(fails ? 1 : 0);
})();
