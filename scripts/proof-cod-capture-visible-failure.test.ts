// KVO-010 / FR-028 proof: delivered COD capture failures are visible and persistent.
// Run: node --experimental-strip-types scripts/proof-cod-capture-visible-failure.test.ts

import { existsSync, readFileSync, statSync } from "node:fs";
import * as nodeModule from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveTsCandidate(basePath: string): string | null {
  const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.mjs`];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  const index = resolve(basePath, "index.ts");
  return existsSync(index) && statSync(index).isFile() ? index : null;
}

const registerHooks = (nodeModule as { registerHooks?: (hooks: {
  resolve: (specifier: string, context: { parentURL?: string }, nextResolve: (specifier: string, context: { parentURL?: string }) => unknown) => unknown;
}) => void }).registerHooks;

if (!registerHooks) throw new Error("node:module registerHooks is required for this proof");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const candidate = resolveTsCandidate(resolve(root, specifier.slice(2)));
      if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL) {
      const parentPath = fileURLToPath(new URL(".", context.parentURL));
      const candidate = resolveTsCandidate(resolve(parentPath, specifier));
      if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  },
});

const { runAction, useToastStore } = await import("../lib/console-toast.ts");
const { useOrderStore } = await import("../lib/order-store.ts");

type LocalOrder = {
  id: string;
  orderNumber: string;
  conversationId?: string;
  customerName: string;
  customerPhone: string;
  source: "whatsapp" | "web";
  branchName: string;
  fulfillmentType: "delivery" | "pickup";
  items: unknown[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency: string;
  paymentStatus: "unpaid" | "payment_link_sent" | "paid" | "failed" | "refunded";
  paymentMethod?: string | null;
  orderStatus: string;
  kitchenStatus: string;
  createdAt: number;
  updatedAt: number;
  events: unknown[];
};

let pass = 0;
let fail = 0;
function ok(name: string, condition: boolean): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
    return;
  }
  fail += 1;
  console.error(`FAIL ${name}`);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function order(overrides: Partial<LocalOrder> = {}): LocalOrder {
  const now = Date.now();
  return {
    id: "order-1",
    orderNumber: "1001",
    customerName: "Customer",
    customerPhone: "0500000000",
    source: "web",
    branchName: "Main",
    fulfillmentType: "delivery",
    items: [],
    subtotal: 100,
    deliveryFee: 10,
    total: 110,
    currency: "ر.س",
    paymentStatus: "unpaid",
    paymentMethod: null,
    orderStatus: "out_for_delivery",
    kitchenStatus: "ready",
    createdAt: now,
    updatedAt: now,
    events: [],
    ...overrides,
  };
}

type FetchCall = { url: string; body: Record<string, unknown> | null };

function installFetch(captureResponse: Response): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
    calls.push({ url, body });
    if (url.endsWith("/status")) return json({ ok: true });
    if (url === "/api/cod/capture-delivered") return captureResponse;
    if (url.endsWith("/payment")) return json({ ok: true });
    return json({ error: "unexpected_fetch", url }, 500);
  }) as typeof fetch;
  return calls;
}

function reset(o: LocalOrder): void {
  useToastStore.setState({ toasts: [] });
  useOrderStore.setState({
    orders: [o],
    nextNumber: 1048,
    _sb: {} as never,
    _rid: "restaurant-1",
    dbReady: true,
  } as never);
}

async function advanceWithToast(): Promise<{ ok: boolean; code?: string }> {
  let result: { ok: boolean; code?: string } = { ok: false };
  const okResult = await runAction(
    { pending: "جارٍ التحديث…", success: "تم تحديث الحالة", error: "تعذّر تحديث التسليم أو تسجيل تحصيل COD", retry: true },
    async () => {
      result = await useOrderStore.getState().updateOrderStatus("order-1", "delivered", "human");
      return result.ok;
    },
  );
  return { ...result, ok: okResult };
}

{
  reset(order());
  const calls = installFetch(json({ error: "no_driver" }, 409));
  const result = await advanceWithToast();
  const stored = useOrderStore.getState().orders[0];
  const failedToast = useToastStore.getState().toasts.find((t) => t.state === "failed");

  ok("409 capture failure is surfaced as a failed action", result.ok === false);
  ok("409 capture failure carries COD-specific code", result.code === "cod_capture_no_driver");
  ok("409 capture failure keeps delivered status (goods were delivered)", stored.orderStatus === "delivered");
  ok("409 capture failure persistently marks payment failed", stored.paymentStatus === "failed");
  ok("409 capture failure attempts to persist paymentStatus=failed", calls.some((c) => c.url.endsWith("/payment") && c.body?.paymentStatus === "failed"));
  ok("409 capture failure shows failed toast", !!failedToast && failedToast.message.includes("COD"));
}

{
  reset(order());
  const calls = installFetch(json({ error: "collection_write_failed" }, 500));
  const result = await advanceWithToast();
  const stored = useOrderStore.getState().orders[0];

  ok("500 capture failure is surfaced as a failed action", result.ok === false);
  ok("500 capture failure carries server reason in code", result.code === "cod_capture_collection_write_failed");
  ok("500 capture failure marks payment failed", stored.paymentStatus === "failed");
  ok("500 capture failure does not falsely mark payment paid", stored.paymentStatus !== "paid");
  ok("500 capture failure calls capture after status write", calls.findIndex((c) => c.url.endsWith("/status")) < calls.findIndex((c) => c.url === "/api/cod/capture-delivered"));
}

{
  reset(order());
  const calls = installFetch(json({ ok: true, collected: 110, expected: 110 }));
  const result = await advanceWithToast();
  const stored = useOrderStore.getState().orders[0];

  ok("successful capture returns success", result.ok === true);
  ok("successful capture does not set payment failed", stored.paymentStatus !== "failed");
  ok("successful capture does not call failed-payment persistence", !calls.some((c) => c.url.endsWith("/payment") && c.body?.paymentStatus === "failed"));
}

{
  reset(order({ paymentStatus: "failed", paymentMethod: null }));
  const calls = installFetch(json({ ok: true, collected: 110, expected: 110 }));
  const result = await advanceWithToast();
  const stored = useOrderStore.getState().orders[0];

  ok("successful retry after failure returns success", result.ok === true);
  ok("successful retry clears local payment failed", stored.paymentStatus === "unpaid");
  ok("successful retry marks local method as COD without claiming paid", stored.paymentMethod === "cod");
  ok("successful retry persists failed-status clear", calls.some((c) => c.url.endsWith("/payment") && c.body?.paymentStatus === "unpaid"));
}

{
  reset(order({ paymentStatus: "failed", paymentMethod: null }));
  const calls = installFetch(json({ ok: true, skipped: true }));
  const result = await advanceWithToast();
  const stored = useOrderStore.getState().orders[0];

  ok("server-side skipped capture returns success", result.ok === true);
  ok("server-side skipped capture does not clear payment failed", stored.paymentStatus === "failed");
  ok("server-side skipped capture does not persist a failed-status clear", !calls.some((c) => c.url.endsWith("/payment") && c.body?.paymentStatus === "unpaid"));
}

{
  reset(order({ paymentStatus: "paid" }));
  const calls = installFetch(json({ error: "should_not_capture" }, 500));
  const result = await advanceWithToast();

  ok("already-paid delivery succeeds without capture", result.ok === true);
  ok("already-paid delivery does not call capture", !calls.some((c) => c.url === "/api/cod/capture-delivered"));
}

{
  reset(order({ fulfillmentType: "pickup" }));
  const calls = installFetch(json({ error: "should_not_capture" }, 500));
  const result = await advanceWithToast();

  ok("pickup delivered transition succeeds without capture", result.ok === true);
  ok("pickup delivered transition does not call capture", !calls.some((c) => c.url === "/api/cod/capture-delivered"));
}

const storeSource = readFileSync("lib/order-store.ts", "utf8");
const ordersPageSource = readFileSync("app/(console)/orders/page.tsx", "utf8");
ok("source no longer fire-and-forgets COD capture", !/fire\(\s*fetch\("\/api\/cod\/capture-delivered"/.test(storeSource));
ok("source awaits COD capture helper", /await captureDeliveredCod\(id\)/.test(storeSource));
ok("order payment badge explicitly renders failed payment", /paymentStatus === "failed"[\s\S]*فشل الدفع/.test(ordersPageSource));

console.log(`\nCOD-CAPTURE-VISIBLE-FAILURE PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
