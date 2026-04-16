import { vi } from "vitest";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MockResult = { data?: unknown; error?: { message: string } | null };

// ─── Builder factory ──────────────────────────────────────────────────────────
// Creates a chainable Supabase query builder mock. Every method returns `this`
// so arbitrary chains work. Terminal methods (maybeSingle, single) resolve with
// the given result. The builder is also thenable so `await builder.update().eq()`
// and `await builder.select().order().then(fn)` both work.

export function makeBuilder(result: MockResult = {}) {
  const r = { data: result.data ?? null, error: result.error ?? null };

  const b: Record<string, unknown> = {};

  const self = () => b;

  b.select    = vi.fn().mockReturnValue(b);
  b.eq        = vi.fn().mockReturnValue(b);
  b.neq       = vi.fn().mockReturnValue(b);
  b.order     = vi.fn().mockReturnValue(b);
  b.limit     = vi.fn().mockReturnValue(b);
  b.in        = vi.fn().mockReturnValue(b);
  b.update    = vi.fn().mockReturnValue(b);
  b.delete    = vi.fn().mockReturnValue(b);
  b.maybeSingle = vi.fn().mockResolvedValue(r);
  b.single    = vi.fn().mockResolvedValue(r);

  // insert returns a sub-builder whose .select().single() and .select().maybeSingle()
  // resolve with the same result.
  b.insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single:       vi.fn().mockResolvedValue(r),
      maybeSingle:  vi.fn().mockResolvedValue(r),
    }),
  });

  // Thenable: makes `await builder` and `builder.then(fn)` work without a terminal method
  b.then = (resolve: (v: MockResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(r).then(resolve as never, reject);

  // Keep a reference so callers can spy on individual methods if needed
  (b as never as { _result: MockResult })._result = r;

  return b;
}

// ─── Client factories ─────────────────────────────────────────────────────────

/** A bare user-auth client (only .auth.getUser is relevant for our routes). */
export function makeUserClient(user: unknown = null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { message: "not authenticated" },
      }),
    },
  };
}

/**
 * A service client whose .from() responses you configure via `tables`.
 *
 * Pass an array for a table to return results in sequence (one per call);
 * pass a single MockResult to return the same value every time.
 *
 * Example:
 *   makeServiceClient({
 *     players: { data: playerRow },
 *     seasons: [{ data: season }, { data: seasonExtra }],
 *     signups: { data: null },
 *   })
 */
export function makeServiceClient(
  tables: Record<string, MockResult | MockResult[]> = {},
) {
  const queues: Record<string, MockResult[]> = {};
  for (const [table, val] of Object.entries(tables)) {
    queues[table] = Array.isArray(val) ? val : [val];
  }
  const calls: Record<string, number> = {};

  return {
    from: vi.fn().mockImplementation((table: string) => {
      calls[table] = (calls[table] ?? 0) + 1;
      const queue = queues[table] ?? [];
      // Pop from front; if exhausted return empty result
      const result: MockResult = queue.length > 0 ? queue.shift()! : {};
      return makeBuilder(result);
    }),
  };
}
