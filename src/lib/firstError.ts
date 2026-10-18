// The first error message among some query results, or null when all succeeded. No imports, so the unit tests can load it.

export type QueryResult = { error?: { message: string } | null } | null | undefined;

export function firstQueryError(...results: QueryResult[]): string | null {
  for (const r of results) if (r?.error?.message) return r.error.message;
  return null;
}
