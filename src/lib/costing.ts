// Pure helpers for the Manufacturing costing screens. No imports, so they run in the unit tests.

export const ELEMENT_ORDER = ["MATERIAL", "LABOR", "MACHINE", "VAR_OH", "FIX_OH"] as const;
export type Element = (typeof ELEMENT_ORDER)[number];

export const ELEMENT_LABEL: Record<Element, string> = {
  MATERIAL: "Material", LABOR: "Direct labor", MACHINE: "Machine", VAR_OH: "Variable overhead", FIX_OH: "Fixed overhead",
};

export const ESTIMATE_STATUS_TONE: Record<string, "good" | "warn" | "muted" | "bad"> = {
  DRAFT: "warn", MARKED: "warn", RELEASED: "good", SUPERSEDED: "muted",
};

/** Peso amount with centavos. */
export const money = (n: number | string | null | undefined) =>
  `₱${Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A unit cost keeps up to six decimals (actual costs such as 505.306122) but never shows trailing zeros past centavos. */
export const unitMoney = (n: number | string | null | undefined) =>
  `₱${Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;

export type CostLine = { element: string; amount: number | string };

/** The cost structure: total per element, in the usual order, zero elements left out. */
export function elementTotals(lines: CostLine[]): { element: Element; amount: number }[] {
  const sums = new Map<string, number>();
  for (const l of lines) sums.set(l.element, (sums.get(l.element) ?? 0) + Number(l.amount));
  return ELEMENT_ORDER.filter((e) => Math.abs(sums.get(e) ?? 0) > 1e-9).map((e) => ({ element: e, amount: sums.get(e)! }));
}

/** Share of a whole, as a percentage rounded to one decimal (0 when the whole is 0). */
export const percentOf = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);

export type ReleaseLine = { item_name: string; value_change: number | string; account_key: string | null };
export type EntryLine = { account_key: string; debit: number; credit: number; items: string[] };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The revaluation entry a release would post, worked out the same way the database does it:
 * stock value changes are totalled per inventory account, and the Revaluation account takes the balance.
 * Returns [] when no stock on hand changes value (then no journal entry is made at all).
 */
export function revaluationEntry(lines: ReleaseLine[]): EntryLine[] {
  const groups = new Map<string, { amount: number; items: string[] }>();
  for (const l of lines) {
    const v = r2(Number(l.value_change));
    if (!l.account_key || v === 0) continue;
    const g = groups.get(l.account_key) ?? { amount: 0, items: [] };
    g.amount = r2(g.amount + v);
    g.items.push(l.item_name);
    groups.set(l.account_key, g);
  }
  const out: EntryLine[] = [];
  let net = 0;
  for (const key of [...groups.keys()].sort()) {
    const g = groups.get(key)!;
    if (g.amount === 0) continue;
    out.push({ account_key: key, debit: Math.max(g.amount, 0), credit: Math.max(-g.amount, 0), items: g.items });
    net = r2(net + g.amount);
  }
  if (out.length > 0 && net !== 0) out.push({ account_key: "REVALUATION", debit: Math.max(-net, 0), credit: Math.max(net, 0), items: [] });
  return out;
}

/** One plain sentence for an entry line, for the "show journal entry" panel. */
export function sentenceFor(line: EntryLine, accountName: string): string {
  const amt = money(line.debit || line.credit);
  if (line.account_key === "REVALUATION") {
    return line.credit > 0
      ? `${amt} is credited to ${accountName} — a gain, because the stock you hold is now worth more.`
      : `${amt} is debited to ${accountName} — a loss, because the stock you hold is now worth less.`;
  }
  const which = line.items.join(", ");
  return line.debit > 0
    ? `${accountName} goes up by ${amt} because ${which} on hand is now valued higher.`
    : `${accountName} goes down by ${amt} because ${which} on hand is now valued lower.`;
}
