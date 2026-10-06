import { toast } from "./toast";

type SupabaseLikeResult = { error: { message: string } | null; [key: string]: any };

/**
 * Wraps a Supabase insert/update/delete/rpc call, surfaces any error as a toast
 * instead of failing silently, and optionally shows a success toast.
 *
 * Returns the same result the query would have returned, so call sites that
 * read `.data` off the result keep working unchanged:
 *
 *   const { data } = await mutate(supabase.from("customers").insert({...}).select().single());
 */
// Database error text means nothing to a student. Plain-English messages the app
// raises on purpose (e.g. "This period is locked…") pass through unchanged.
const FRIENDLY_ERRORS: [RegExp, string][] = [
  [/violates foreign key constraint/i, "That record is used by something else, so it can't be removed or changed this way."],
  [/duplicate key value|already exists/i, "That already exists."],
  [/row-level security|permission denied/i, "You don't have permission to do that."],
  [/null value in column "?(\w+)"?/i, "A required field is missing — please fill in every required box."],
  [/invalid input syntax|out of range|numeric field overflow/i, "One of the values isn't in the right format — check the dates and amounts."],
  [/violates check constraint/i, "One of the values isn't allowed — check the amounts and statuses."],
  [/JWT|not authenticated|Auth session missing/i, "Your session has expired — please sign in again."],
  [/Failed to fetch|NetworkError|Load failed/i, "Couldn't reach the server — check your connection and try again."],
];

export function friendlyError(message: string | undefined | null): string {
  const raw = message ?? "";
  const hit = FRIENDLY_ERRORS.find(([re]) => re.test(raw));
  return hit ? hit[1] : raw || "Something went wrong — the change was not saved.";
}

export async function mutate<T extends SupabaseLikeResult>(
  promise: PromiseLike<T>,
  opts?: { successMessage?: string; errorMessage?: string }
): Promise<T> {
  const result = await promise;
  if (result.error) {
    toast.error(opts?.errorMessage ?? friendlyError(result.error.message));
  } else if (opts?.successMessage) {
    toast.success(opts.successMessage);
  }
  return result;
}

/** True if the result came back clean (no error). Use to gate follow-up steps/closing a modal. */
export function ok(result: SupabaseLikeResult): boolean {
  return !result.error;
}
