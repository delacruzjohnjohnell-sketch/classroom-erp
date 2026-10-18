import { toast } from "./toast";
import { firstQueryError, type QueryResult } from "./firstError";

let lastMessage = "";
let lastAt = 0;

/**
 * Tell the user when a screen's data could not be loaded. Without this a failed query looks exactly like an empty list, which is how a
 * mistyped column once left a purchase-order picker silently empty. The same message is shown once every few seconds, not once per
 * query, because a screen often fires several queries at the same time. Returns true when an error was shown.
 */
export function showQueryErrors(...results: QueryResult[]): boolean {
  const message = firstQueryError(...results);
  if (!message) return false;
  const now = Date.now();
  if (message !== lastMessage || now - lastAt > 4000) {
    toast.error(`Some data could not be loaded: ${message}`);
    lastMessage = message;
    lastAt = now;
  }
  return true;
}
