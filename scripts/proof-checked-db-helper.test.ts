import type { PostgrestError } from "@supabase/supabase-js";
import {
  DatabaseOperationError,
  maybeSucceed,
  mustSucceed,
  mustWrite,
} from "../lib/db/checked.ts";

let passed = 0;
let failed = 0;

function ok(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL ${name}`);
}

function postgrestError(fields: Partial<PostgrestError>): PostgrestError {
  return {
    code: fields.code ?? "XX000",
    message: fields.message ?? "database error",
    details: fields.details ?? "",
    hint: fields.hint ?? "",
  } as PostgrestError;
}

async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

const secret = "sk_test_51SECRET";
const phone = "+966501234567";
const email = "guest@example.com";
const rawProviderBody = `provider body ${secret} ${phone} ${email}`;

const pgError = postgrestError({
  code: "23505",
  message: `duplicate ${rawProviderBody}`,
  details: `violates constraint ${rawProviderBody}`,
  hint: `retry with ${rawProviderBody}`,
});

const thrown = await captureError(() =>
  mustSucceed(Promise.resolve({ data: { id: "ignored" }, error: pgError }), "orders.create"),
);

ok("mustSucceed throws DatabaseOperationError when error is present", thrown instanceof DatabaseOperationError);
ok(
  "DatabaseOperationError carries the context",
  thrown instanceof DatabaseOperationError && thrown.context === "orders.create",
);
ok(
  "DatabaseOperationError retains the original PostgrestError",
  thrown instanceof DatabaseOperationError && thrown.pgError === pgError,
);
ok(
  "DatabaseOperationError message includes context and pg code",
  thrown instanceof DatabaseOperationError &&
    thrown.message.includes("orders.create") &&
    thrown.message.includes("23505"),
);
ok(
  "DatabaseOperationError message does not leak raw error details or secrets",
  thrown instanceof DatabaseOperationError &&
    !thrown.message.includes(secret) &&
    !thrown.message.includes(phone) &&
    !thrown.message.includes(email) &&
    !thrown.message.includes("duplicate") &&
    !thrown.message.includes("violates constraint") &&
    !thrown.message.includes("retry with"),
);

const returned = await mustSucceed(
  Promise.resolve({ data: { id: "order_123" }, error: null }),
  "orders.read",
);
ok("mustSucceed returns data when error is null", returned.id === "order_123");

const maybeMissing = await maybeSucceed(
  Promise.resolve<{ data: { id: string } | null; error: PostgrestError | null }>({
    data: null,
    error: null,
  }),
  "orders.maybe_read",
);
ok("maybeSucceed returns null for legitimate maybe-single no-row results", maybeMissing === null);

const missingError = await captureError(() =>
  mustSucceed(
    Promise.resolve<{ data: { id: string } | null; error: PostgrestError | null }>({
      data: null,
      error: null,
    }),
    "orders.must_read",
  ),
);
ok("mustSucceed throws when data is null and error is null", missingError instanceof DatabaseOperationError);
ok(
  "mustSucceed null-data error is explicit not found context",
  missingError instanceof DatabaseOperationError &&
    missingError.context === "orders.must_read: not found" &&
    missingError.code === "KIVO_NOT_FOUND",
);

const rows = await mustWrite(
  Promise.resolve({ data: [{ id: "a" }, { id: "b" }], error: null }),
  "orders.update",
  { exactRows: 2 },
);
ok("mustWrite returns write rows when row count matches", rows.length === 2 && rows[1].id === "b");

const mismatchError = await captureError(() =>
  mustWrite(
    Promise.resolve({ data: [{ id: "a" }], error: null }),
    "orders.update",
    { exactRows: 2 },
  ),
);
ok("mustWrite throws DatabaseOperationError on row-count mismatch", mismatchError instanceof DatabaseOperationError);
ok(
  "mustWrite row-count error is sanitized and coded",
  mismatchError instanceof DatabaseOperationError &&
    mismatchError.code === "KIVO_ROW_COUNT_MISMATCH" &&
    mismatchError.message.includes("orders.update: row count mismatch") &&
    !mismatchError.message.includes("Expected 2") &&
    !mismatchError.message.includes("received 1"),
);

console.log(`\nCHECKED-DB-HELPER PROOF: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
