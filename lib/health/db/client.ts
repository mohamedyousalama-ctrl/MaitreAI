// ============================================================================
// فيصل / Faysal — data-layer plumbing.
//
// There is no client constructed here, on purpose. Every helper takes the
// Supabase client as its first argument, exactly as `lib/db/*` does, so this
// directory never imports "server-only" and can be driven from a script, a
// proof, or a server route without three different wiring stories.
//
// The unwrap helpers exist so a query's failure is a THROWN error with the
// table and the operation in the message. A Supabase call that returns
// `{ data: null, error }` and is read as "no rows" is the quiet failure this
// repo has already paid for: an empty list is indistinguishable from a broken
// query at the call site unless somebody checks, and nobody checks every time.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/** The Supabase client this layer runs against. Service-role on the server. */
export type HealthDb = SupabaseClient;

interface PostgrestResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export class HealthDbError extends Error {
  readonly operation: string;
  constructor(operation: string, message: string) {
    super(`[health.db] ${operation}: ${message}`);
    this.name = "HealthDbError";
    this.operation = operation;
  }
}

/** Rows, or a thrown error. Never a silent empty list. */
export async function unwrapMany<T>(
  query: PromiseLike<PostgrestResult<unknown>>,
  operation: string,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new HealthDbError(operation, error.message);
  return (data ?? []) as T[];
}

/** Exactly one row, or null when the query legitimately matched nothing. */
export async function unwrapMaybeOne<T>(
  query: PromiseLike<PostgrestResult<unknown>>,
  operation: string,
): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    // PGRST116 is maybeSingle()'s "no rows" — a legitimate empty answer.
    if (/PGRST116|no rows|multiple \(or no\) rows/i.test(error.message)) return null;
    throw new HealthDbError(operation, error.message);
  }
  return (data ?? null) as T | null;
}

/** Exactly one row. Absence is an error — the caller asserted it exists. */
export async function unwrapOne<T>(
  query: PromiseLike<PostgrestResult<unknown>>,
  operation: string,
): Promise<T> {
  const row = await unwrapMaybeOne<T>(query, operation);
  if (row === null) throw new HealthDbError(operation, "expected exactly one row, found none");
  return row;
}
