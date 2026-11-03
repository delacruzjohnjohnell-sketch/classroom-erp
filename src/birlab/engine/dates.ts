// Date helpers shared by the due-date rules (all ISO strings).
const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const addDays = (iso: string, days: number): string => { const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10); };
export const lastDay = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** MM/YYYY text to [month, year], or null. */
export const parseMonth = (s: string | undefined): [number, number] | null => { const m = (s ?? "").match(/^(\d{2})\/(\d{4})$/); return m && +m[1] >= 1 && +m[1] <= 12 ? [+m[1], +m[2]] : null; };
/** The day `d` of the month after (m, y); `d` past the month's length is clamped. */
export const dayOfNextMonth = (y: number, m: number, d: number): string => { const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; return ymd(ny, nm, Math.min(d, lastDay(ny, nm))); };

/** The last day of quarter `q` (1 to 4) of a taxable year ending in month/year `yearEnd` (MM/YYYY), as an ISO date. */
export const quarterEnd = (yearEnd: string | undefined, q: number): string => {
  const p = parseMonth(yearEnd);
  if (!p || !(q >= 1 && q <= 4)) return "";
  const idx = p[1] * 12 + (p[0] - 1) - 12 + 3 * q;
  const y = Math.floor(idx / 12), m = (idx % 12) + 1;
  return ymd(y, m, lastDay(y, m));
};
