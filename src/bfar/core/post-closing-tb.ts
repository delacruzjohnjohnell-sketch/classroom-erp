// The post-closing trial balance: after closing, only the permanent accounts (assets, liabilities, Owner's Capital) may carry a balance.
import { postToLedger } from "./ledger-posting";
import { trialBalance } from "./trial-balance";
import type { JournalEntry, TrialBalance } from "./types";
import { getAccount } from "./chart-of-accounts";

export interface PostClosing extends TrialBalance { onlyPermanentAccounts: boolean }

export function postClosingTrialBalance(entries: JournalEntry[]): PostClosing {
  const tb = trialBalance(postToLedger(entries, ["transaction", "adjusting", "closing"]));
  const onlyPermanentAccounts = tb.rows.every((r) => {
    const t = getAccount(r.code)?.type;
    return t === "asset" || t === "liability" || r.code === "301";
  });
  return { ...tb, onlyPermanentAccounts };
}
