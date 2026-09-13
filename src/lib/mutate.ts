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
export async function mutate<T extends SupabaseLikeResult>(
  promise: PromiseLike<T>,
  opts?: { successMessage?: string; errorMessage?: string }
): Promise<T> {
  const result = await promise;
  if (result.error) {
    toast.error(opts?.errorMessage ?? result.error.message ?? "Something went wrong — the change was not saved.");
  } else if (opts?.successMessage) {
    toast.success(opts.successMessage);
  }
  return result;
}

/** True if the result came back clean (no error). Use to gate follow-up steps/closing a modal. */
export function ok(result: SupabaseLikeResult): boolean {
  return !result.error;
}
