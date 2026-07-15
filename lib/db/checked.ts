import type { PostgrestError } from "@supabase/supabase-js";

export type CheckedQueryResult<T> = {
  data: T | null;
  error: PostgrestError | null;
};

export type CheckedQuery<T> =
  | CheckedQueryResult<T>
  | PromiseLike<CheckedQueryResult<T>>;

export type MustWriteOptions = {
  exactRows?: number;
  minRows?: number;
};

function buildMessage(context: string, error: PostgrestError): string {
  const code = error.code ? ` (${error.code})` : "";
  return `Database operation failed: ${context}${code}`;
}

function syntheticPostgrestError(code: string, message: string): PostgrestError {
  return {
    code,
    message,
    details: "",
    hint: "",
  } as PostgrestError;
}

export class DatabaseOperationError extends Error {
  readonly context: string;
  readonly pgError: PostgrestError;
  readonly code: string | null;

  constructor(context: string, pgError: PostgrestError) {
    super(buildMessage(context, pgError));
    this.name = "DatabaseOperationError";
    this.context = context;
    this.pgError = pgError;
    this.code = pgError.code ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

async function resolveQuery<T>(
  query: CheckedQuery<T>,
  context: string,
): Promise<T | null> {
  const result = await query;
  if (result.error) {
    throw new DatabaseOperationError(context, result.error);
  }
  return result.data;
}

/**
 * Strict success helper for operations where a row/value must exist.
 * `data: null, error: null` is treated as a failed "not found" result and
 * throws DatabaseOperationError instead of being returned as success.
 */
export async function mustSucceed<T>(
  query: CheckedQuery<T>,
  context: string,
): Promise<T> {
  const data = await resolveQuery(query, context);
  if (data === null) {
    throw new DatabaseOperationError(
      `${context}: not found`,
      syntheticPostgrestError("KIVO_NOT_FOUND", "Expected data was not returned"),
    );
  }
  return data;
}

/**
 * Success helper for legitimate maybe-single reads.
 * `data: null, error: null` is returned as null deliberately; database errors
 * still throw DatabaseOperationError.
 */
export async function maybeSucceed<T>(
  query: CheckedQuery<T>,
  context: string,
): Promise<T | null> {
  return resolveQuery(query, context);
}

/**
 * Checked write helper for writes that return affected rows, usually via
 * `.select()`. It throws on Supabase errors, null data, and optional row-count
 * mismatches so callers cannot confuse a blocked write for success.
 */
export async function mustWrite<T>(
  query: CheckedQuery<T[]>,
  context: string,
  options: MustWriteOptions = {},
): Promise<T[]> {
  const rows = await mustSucceed(query, context);

  if (options.exactRows !== undefined && rows.length !== options.exactRows) {
    throw new DatabaseOperationError(
      `${context}: row count mismatch`,
      syntheticPostgrestError(
        "KIVO_ROW_COUNT_MISMATCH",
        `Expected ${options.exactRows} row(s), received ${rows.length}`,
      ),
    );
  }

  if (options.minRows !== undefined && rows.length < options.minRows) {
    throw new DatabaseOperationError(
      `${context}: row count mismatch`,
      syntheticPostgrestError(
        "KIVO_ROW_COUNT_MISMATCH",
        `Expected at least ${options.minRows} row(s), received ${rows.length}`,
      ),
    );
  }

  return rows;
}
