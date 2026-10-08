// Date and period helpers shared by the UI and the tests. All dates are plain
// "YYYY-MM-DD" strings (no time zones), matching the database's date columns.

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate(); // m1 = 1..12
const fmt = (y: number, m1: number, d: number) => `${y}-${pad(m1)}-${pad(d)}`;
const parts = (s: string): [number, number, number] => {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m, d];
};

/** Last day of the month containing `date`. */
export function monthEnd(date: string): string {
  const [y, m] = parts(date);
  return fmt(y, m, daysIn(y, m));
}

/** Month-end `n` months after the month containing `date` (n = 0 is the same month). */
export function monthEndAfter(date: string, n: number): string {
  const [y, m] = parts(date);
  const idx = y * 12 + (m - 1) + n;
  const yy = Math.floor(idx / 12), mm = (idx % 12) + 1;
  return fmt(yy, mm, daysIn(yy, mm));
}

/**
 * The date of the next occurrence of a recurring entry. Months clamp to the end of
 * a shorter month the same way the database's `date + interval '1 month'` does.
 */
export function nextRecurringDate(date: string, frequency: string): string {
  const [y, m, d] = parts(date);
  if (frequency === "weekly") {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 7);
    return dt.toISOString().slice(0, 10);
  }
  const idx = y * 12 + (m - 1) + 1;
  const yy = Math.floor(idx / 12), mm = (idx % 12) + 1;
  return fmt(yy, mm, Math.min(d, daysIn(yy, mm)));
}

/**
 * True when a ledger entry dated `date` is refused by the books lock. Only dates on
 * or before the lock date are closed; every later period stays open.
 */
export function isDateLocked(date: string, lockedThrough: string | null | undefined): boolean {
  return !!lockedThrough && date <= lockedThrough;
}

/**
 * Default date for an asset's next monthly depreciation: the end of the month that
 * follows the months already recorded, counted from the purchase month.
 * (Bought Nov 2 → first entry Nov 30, second Dec 31, …)
 */
export function nextDepreciationDate(purchaseDate: string, monthsRecorded: number): string {
  return monthEndAfter(purchaseDate, Math.max(0, monthsRecorded));
}
