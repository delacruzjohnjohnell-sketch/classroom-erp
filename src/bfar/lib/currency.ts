// Philippine peso arithmetic for the BFAR module. All money is an integer number of centavos (₱1.00 = 100), so nothing is ever added as a float.

export type Centavos = number;

/** Divides two integers and rounds half away from zero. */
export function roundDiv(n: number, d: number): number {
  if (d === 0) throw new Error("Division by zero");
  const q = Math.abs(n) / Math.abs(d);
  const r = Math.floor(q + 0.5);
  return (n < 0) !== (d < 0) ? -r : r;
}

/** Parses "1,234.50", "₱1,234.5", "(500)" or a number of pesos into centavos. Returns null when it is not an amount. */
export function parsePesos(input: string | number): Centavos | null {
  if (typeof input === "number") return Number.isFinite(input) ? roundDiv(Math.round(input * 1000), 10) : null;
  let s = input.trim().replace(/[₱,\s]/g, "");
  if (s === "") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^\d*\.?\d*$/.test(s) || s === "." ) return null;
  const [whole = "0", frac = ""] = s.split(".");
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2)) + (frac.length > 2 && Number(frac[2]) >= 5 ? 1 : 0);
  return neg ? -cents : cents;
}

/** Pesos as a number, only for display code that needs one. */
export const toPesos = (c: Centavos): number => c / 100;

/** "1,234.50", negatives in parentheses when `parens` is true. */
export function formatAmount(c: Centavos, parens = true): string {
  const abs = Math.abs(c);
  const s = `${Math.floor(abs / 100).toLocaleString("en-PH")}.${String(abs % 100).padStart(2, "0")}`;
  return c < 0 ? (parens ? `(${s})` : `-${s}`) : s;
}

/** "₱1,234.50" */
export function formatPeso(c: Centavos, parens = true): string {
  const abs = Math.abs(c);
  const s = `₱${Math.floor(abs / 100).toLocaleString("en-PH")}.${String(abs % 100).padStart(2, "0")}`;
  return c < 0 ? (parens ? `(${s})` : `-${s}`) : s;
}

/** A percentage of an amount (rate in percent, up to two decimals), rounded to the centavo. */
export function percentOf(c: Centavos, ratePercent: number): Centavos {
  return roundDiv(c * Math.round(ratePercent * 100), 10000);
}

export const sum = (xs: Centavos[]): Centavos => xs.reduce((a, b) => a + b, 0);

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const below1000 = (n: number): string => {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "")); } else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
};

/** "Five Hundred Thousand Pesos Only", as printed on receipts and checks. Centavos appear as "and 50/100". */
export function pesosInWords(c: Centavos): string {
  const abs = Math.abs(c);
  let whole = Math.floor(abs / 100);
  const cents = abs % 100;
  if (whole === 0 && cents === 0) return "Zero Pesos Only";
  const groups: [number, string][] = [[1_000_000_000, "Billion"], [1_000_000, "Million"], [1000, "Thousand"]];
  const words: string[] = [];
  for (const [size, name] of groups) {
    if (whole >= size) { words.push(`${below1000(Math.floor(whole / size))} ${name}`); whole %= size; }
  }
  if (whole > 0) words.push(below1000(whole));
  const pesos = words.join(" ") || "Zero";
  return `${pesos} Pesos${cents ? ` and ${String(cents).padStart(2, "0")}/100` : ""} Only`;
}
