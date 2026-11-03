// The 10-column worksheet: Trial Balance, Adjustments, Adjusted Trial Balance, Income Statement, Balance Sheet (each Dr/Cr).
// Net income goes to column 7 (Dr) and column 10 (Cr); a net loss goes to column 8 (Cr) and column 9 (Dr).
import { accountOrder, requireAccount } from "./chart-of-accounts";
import { postToLedger } from "./ledger-posting";
import { sum, type Centavos } from "../lib/currency";
import type { JournalEntry } from "./types";

export interface WorksheetRow {
  code: string; name: string;
  tbDr: Centavos; tbCr: Centavos; adjDr: Centavos; adjCr: Centavos; atbDr: Centavos; atbCr: Centavos;
  isDr: Centavos; isCr: Centavos; bsDr: Centavos; bsCr: Centavos;
  /** Letters of the adjusting entries that touch this account, e.g. ["a", "c"]. */
  adjRefs: string[];
}
export type ColumnKey = "tbDr" | "tbCr" | "adjDr" | "adjCr" | "atbDr" | "atbCr" | "isDr" | "isCr" | "bsDr" | "bsCr";
export const COLUMN_KEYS: ColumnKey[] = ["tbDr", "tbCr", "adjDr", "adjCr", "atbDr", "atbCr", "isDr", "isCr", "bsDr", "bsCr"];

export interface Worksheet {
  rows: WorksheetRow[];
  /** Column totals before the net income/loss line is added (the "subtotal" row). */
  subtotals: Record<ColumnKey, Centavos>;
  /** Column totals after net income/loss is added; each Dr/Cr pair must agree. */
  totals: Record<ColumnKey, Centavos>;
  netIncome: Centavos;
  isNetIncome: boolean;
  crossFooted: boolean;
}

const signed = (ledger: ReturnType<typeof postToLedger>, code: string) => {
  const l = ledger.find((x) => x.account.code === code);
  return l ? (l.balanceSide === "debit" ? l.balance : -l.balance) : 0;
};

/** `endingInventory` is the physical count under the periodic system; leave it out for service businesses or perpetual inventory. */
export function buildWorksheet(entries: JournalEntry[], opts: { endingInventory?: Centavos } = {}): Worksheet {
  const tb = postToLedger(entries, ["transaction"]);
  const adj = postToLedger(entries, ["adjusting"]);
  const codes = new Set<string>([...tb.map((l) => l.account.code), ...adj.map((l) => l.account.code)]);
  if (opts.endingInventory !== undefined) codes.add("130");
  const periodic = opts.endingInventory !== undefined;

  const rows: WorksheetRow[] = [...codes].sort((a, b) => accountOrder(a) - accountOrder(b)).map((code) => {
    const acc = requireAccount(code);
    const t = signed(tb, code), a = adj.find((x) => x.account.code === code);
    const atb = t + signed(adj, code);
    const row: WorksheetRow = {
      code, name: acc.name,
      tbDr: t > 0 ? t : 0, tbCr: t < 0 ? -t : 0,
      adjDr: a?.debitTotal ?? 0, adjCr: a?.creditTotal ?? 0,
      atbDr: atb > 0 ? atb : 0, atbCr: atb < 0 ? -atb : 0,
      isDr: 0, isCr: 0, bsDr: 0, bsCr: 0,
      adjRefs: [...new Set(entries.filter((e) => e.stage === "adjusting" && e.lines.some((l) => l.accountCode === code)).map((e) => e.tag ?? ""))].filter(Boolean),
    };
    if (periodic && code === "130") {
      row.isDr = row.atbDr; row.isCr = opts.endingInventory!; row.bsDr = opts.endingInventory!;
    } else if (acc.type === "revenue" || acc.type === "expense") {
      row.isDr = row.atbDr; row.isCr = row.atbCr;
    } else {
      row.bsDr = row.atbDr; row.bsCr = row.atbCr;
    }
    return row;
  });

  const total = (k: ColumnKey) => sum(rows.map((r) => r[k]));
  const subtotals = Object.fromEntries(COLUMN_KEYS.map((k) => [k, total(k)])) as Record<ColumnKey, Centavos>;
  const net = subtotals.isCr - subtotals.isDr;
  const isNetIncome = net >= 0;
  const totals = { ...subtotals };
  if (isNetIncome) { totals.isDr += net; totals.bsCr += net; } else { totals.isCr += -net; totals.bsDr += -net; }
  const crossFooted = totals.tbDr === totals.tbCr && totals.adjDr === totals.adjCr && totals.atbDr === totals.atbCr && totals.isDr === totals.isCr && totals.bsDr === totals.bsCr;
  return { rows, subtotals, totals, netIncome: Math.abs(net), isNetIncome, crossFooted };
}
