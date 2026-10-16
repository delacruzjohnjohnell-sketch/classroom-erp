// Form rules and small helpers for Manufacturing purchasing, stock and production screens.
// The database re-checks everything; these checks give a student a plain message before anything is sent.
import { z } from "zod";

const num = (label: string) => z.coerce.number({ error: `${label} must be a number.` });
const nonNeg = (label: string) => num(label).min(0, `${label} can't be negative.`);
const pos = (label: string) => num(label).gt(0, `${label} must be above zero.`);
const text = (msg: string) => z.string().trim().min(1, msg);
const dateStr = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);
const optText = z.string().optional().transform((v) => (v && v.trim() ? v.trim() : null));
const optDate = z.string().optional().transform((v) => (v ? v : null));
const optId = z.string().optional().transform((v) => (v ? v : null));

export const poSchema = z.object({
  vendor_id: text("Choose a vendor."),
  order_date: dateStr("Choose the order date."),
  expected_date: optDate,
  lines: z.array(z.object({
    item_id: text("Choose an item on every line."),
    qty: pos("Quantity"),
    unit_price: nonNeg("Price"),
  })).min(1, "Add at least one line."),
}).superRefine((v, ctx) => {
  if (v.expected_date && v.expected_date < v.order_date) ctx.addIssue({ code: "custom", message: "The expected date can't be before the order date." });
});

export const receiptSchema = z.object({
  receipt_date: dateStr("Choose the receipt date."),
  lines: z.array(z.object({
    po_line_id: text("A line is missing its purchase-order line."),
    qty: nonNeg("Received quantity"),
    location_id: optId,
    batch_no: optText,
    expiry: optDate,
  })),
}).superRefine((v, ctx) => {
  if (!v.lines.some((l) => l.qty > 0)) ctx.addIssue({ code: "custom", message: "Enter the quantity you received on at least one line." });
});

export const adjustmentSchema = z.object({
  item_id: text("Choose an item."),
  location_id: text("Choose a storage location."),
  reason: z.enum(["OPENING", "COUNT"], { error: "Choose opening balance or stock count." }),
  qty_change: num("Quantity").refine((n) => n !== 0, { message: "Enter how much the stock changes by." }),
  unit_cost: z.string().optional().transform((v) => (v === undefined || v === "" ? null : Number(v))),
  posting_date: dateStr("Choose the date."),
  batch_no: optText,
  expiry: optDate,
}).superRefine((v, ctx) => {
  if (v.reason === "OPENING" && v.qty_change < 0) ctx.addIssue({ code: "custom", message: "An opening balance adds stock. Use a stock count to take stock away." });
  if (v.unit_cost !== null && (Number.isNaN(v.unit_cost) || v.unit_cost < 0)) ctx.addIssue({ code: "custom", message: "The unit cost can't be negative." });
});

export const transferSchema = z.object({
  item_id: text("Choose an item."),
  from_id: text("Choose where the stock is now."),
  to_id: text("Choose where it is going."),
  qty: pos("Quantity"),
  posting_date: dateStr("Choose the date."),
}).refine((v) => v.from_id !== v.to_id, { message: "Choose two different locations." });

export const orderSchema = z.object({
  item_id: text("Choose the item to make."),
  qty: pos("Quantity"),
  planned_start: dateStr("Choose the start date."),
  planned_end: optDate,
  backflush: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.planned_end && v.planned_end < v.planned_start) ctx.addIssue({ code: "custom", message: "The finish date can't be before the start date." });
});

export const issueSchema = z.object({
  posting_date: dateStr("Choose the date."),
  lines: z.array(z.object({ component_id: text("A line is missing its component."), qty: nonNeg("Quantity"), location_id: optId })),
}).superRefine((v, ctx) => {
  if (!v.lines.some((l) => l.qty > 0)) ctx.addIssue({ code: "custom", message: "Enter a quantity to issue on at least one component." });
});

export const confirmationSchema = z.object({
  op_no: z.union([z.literal(""), z.coerce.number().int()]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  yield_qty: nonNeg("Good units"),
  scrap_qty: nonNeg("Scrap units"),
  scrap_reason: optText,
  setup_h: nonNeg("Setup hours"),
  labor_h: nonNeg("Labor hours"),
  machine_h: nonNeg("Machine hours"),
  is_final: z.boolean(),
  posting_date: dateStr("Choose the date."),
}).superRefine((v, ctx) => {
  if (v.yield_qty + v.scrap_qty === 0 && v.setup_h + v.labor_h + v.machine_h === 0) ctx.addIssue({ code: "custom", message: "Enter the units made or the hours worked." });
  if (v.scrap_qty > 0 && !v.scrap_reason) ctx.addIssue({ code: "custom", message: "Say why the units were scrapped." });
});

export const fgReceiptSchema = z.object({
  qty: pos("Quantity"),
  location_id: optId,
  batch_no: optText,
  expiry: optDate,
  posting_date: dateStr("Choose the date."),
});

export const reverseSchema = z.object({
  reason: z.string().trim().min(3, "Say why you are reversing it — the reason stays on the record."),
  posting_date: dateStr("Choose the date of the reversal."),
});

export const settleSchema = z.object({ posting_date: dateStr("Choose the settlement date.") });

export const outputReceiptSchema = z.object({
  output_id: text("Choose the co-product or by-product."),
  qty: pos("Quantity"),
  location_id: optId,
  batch_no: optText,
  expiry: optDate,
  posting_date: dateStr("Choose the date."),
});

export const deliverySchema = z.object({
  so_id: text("Choose a sales order."),
  posting_date: dateStr("Choose the delivery date."),
  lines: z.array(z.object({ so_line_id: text("A line is missing its sales-order line."), qty: nonNeg("Quantity"), location_id: optId })),
}).superRefine((v, ctx) => {
  if (!v.lines.some((l) => l.qty > 0)) ctx.addIssue({ code: "custom", message: "Enter a quantity to deliver on at least one line." });
});

export const firstIssue = (e: z.ZodError): string => e.issues[0]?.message ?? "Please check the form.";

// ---------- labels ----------
export const ORDER_STATUS_LABEL: Record<string, string> = {
  CREATED: "Created", PENDING_APPROVAL: "Waiting for approval", RELEASED: "Released", PARTIALLY_CONFIRMED: "In progress",
  CONFIRMED: "Confirmed", DELIVERED: "Delivered to stock", TECHNICALLY_COMPLETE: "Technically complete", CLOSED: "Closed",
  LOCKED: "Locked", CANCELLED: "Cancelled",
};
export const ORDER_STATUS_TONE: Record<string, "good" | "warn" | "muted" | "bad"> = {
  CREATED: "muted", PENDING_APPROVAL: "bad", RELEASED: "warn", PARTIALLY_CONFIRMED: "warn", CONFIRMED: "warn",
  DELIVERED: "good", TECHNICALLY_COMPLETE: "good", CLOSED: "muted", LOCKED: "bad", CANCELLED: "muted",
};
export const DOC_TYPE_LABEL: Record<string, string> = {
  GR: "Goods receipt", GI: "Material issue", FGR: "Finished goods receipt", TRF: "Transfer", ADJ: "Adjustment", DLV: "Delivery", REV: "Reversal",
};

/** Plain-language reasons shown beside each variance line (the database names the buckets). */
export const VARIANCE_HELP: Record<string, string> = {
  MATERIAL: "More or less material went into the order than the standard allowed for the good units. Scrap and waste show up here.",
  LABOR: "The labor hours worked, compared with the standard hours for the good units.",
  MACHINE: "Machine time and variable overhead, compared with the standard for the good units.",
  FIX_OH: "Fixed overhead applied to the order, compared with the standard for the good units.",
  RESIDUAL: "Cost that was put into the order but never reached stock, for example a co-product that was not received. It is written off.",
};

export type Reversible = { id: string; doc_type?: string; reversal_of: string | null };

/** The ids that have already been reversed: a reversal points back at the document it undoes. */
export const reversedIds = (rows: Reversible[]): Set<string> => new Set(rows.map((r) => r.reversal_of).filter((x): x is string => !!x));

/** Can the Reverse button be shown? Not for a reversal itself, and not for something already reversed. */
export const canReverse = (row: Reversible, reversed: Set<string>): boolean =>
  row.doc_type !== "REV" && row.reversal_of === null && !reversed.has(row.id);

/** What is still to deliver, invoice or receive on a line, never below zero and without float noise. */
export const remaining = (total: number, done: number) => Math.max(Math.round((total - done) * 1e6) / 1e6, 0);

// ---------- helpers ----------
export type Lot = { id: string; batch_no: string | null; qty: number; expiry: string | null; received_on: string | null };

/**
 * Which lots an issue of `qty` would take: earliest expiry first, then oldest first, lots without a date last.
 * Mirrors mfg__pick in the database; used only to preview what an issue will do.
 */
export function pickLots(lots: Lot[], qty: number): { picks: { id: string; batch_no: string | null; qty: number }[]; short: number } {
  const order = [...lots].filter((l) => l.qty > 0).sort((a, b) => {
    const ea = a.expiry ?? "9999-12-31", eb = b.expiry ?? "9999-12-31";
    if (ea !== eb) return ea < eb ? -1 : 1;
    const ra = a.received_on ?? "9999-12-31", rb = b.received_on ?? "9999-12-31";
    if (ra !== rb) return ra < rb ? -1 : 1;
    return 0;
  });
  const picks: { id: string; batch_no: string | null; qty: number }[] = [];
  let rem = qty;
  for (const l of order) {
    if (rem <= 0) break;
    const take = Math.min(rem, l.qty);
    picks.push({ id: l.id, batch_no: l.batch_no, qty: take });
    rem -= take;
  }
  return { picks, short: Math.max(rem, 0) };
}

/** What is still to come on an ordered line. */
export const outstanding = (ordered: number, received: number) => Math.max(Math.round((ordered - received) * 1e6) / 1e6, 0);

/** Stock value, rounded to the centavo like the ledger. */
export const stockValue = (qty: number, unitCost: number) => Math.round(qty * unitCost * 100) / 100;

/** Quantity text without trailing noise: 12, 12.5, 0.2 (never 12.000000). */
export const qtyText = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 4 });

/** Is a lot close to its expiry date (within `days`) on `today`? */
export function expiresSoon(expiry: string | null, today: string, days = 30): boolean {
  if (!expiry) return false;
  const ms = Date.parse(expiry + "T00:00:00Z") - Date.parse(today + "T00:00:00Z");
  return ms <= days * 86400000;
}
