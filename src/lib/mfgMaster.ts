// Form rules and labels for the Manufacturing master data screens. The database re-checks everything
// (these checks exist so a student sees a plain message before anything is sent).
import { z } from "zod";

export const ITEM_TYPES = { RAW: "Raw material", SEMI: "Semi-finished", FINISHED: "Finished good", PACKAGING: "Packaging", SERVICE: "Service" } as const;
export const MAKE_OR_BUY = { MAKE: "Make", BUY: "Buy" } as const;
export const LOT_RULES = {
  LOT_FOR_LOT: "Lot-for-lot (exactly what is needed)",
  FIXED: "Fixed lot size",
  EOQ: "Economic order quantity",
  MIN_MAX: "Minimum / maximum",
  PERIODIC: "Periodic (order per period)",
} as const;
export const BOM_KINDS = { COMPONENT: "Component", COPRODUCT: "Co-product", BYPRODUCT: "By-product" } as const;
export const CONTROL_KEYS = { PP01: "PP01 — normal operation", PP02: "PP02 — inspection point", PP03: "PP03 — outside processing" } as const;
export const LOCATION_KINDS = { RM: "Raw materials", WIP: "Shop floor (WIP)", FG: "Finished goods", QUARANTINE: "Quarantine" } as const;
export const WEEKDAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]] as const;

/** The first problem in a failed check, as one sentence a student can act on. */
export const firstError = (e: z.ZodError): string => e.issues[0]?.message ?? "Please check the form.";

const num = (label: string) => z.coerce.number({ error: `${label} must be a number.` });
const nonNeg = (label: string) => num(label).min(0, `${label} can't be negative.`);
const intNonNeg = (label: string) => num(label).int(`${label} must be a whole number.`).min(0, `${label} can't be negative.`);
const pct = (label: string) => num(label).min(0, `${label} can't be negative.`).lt(100, `${label} must be below 100.`);
const text = (msg: string) => z.string().trim().min(1, msg);
const optId = z.string().optional().transform((v) => (v ? v : null));
const dateStr = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);

export const itemSchema = z.object({
  sku: text("Give the item a SKU or code.").max(40, "The SKU is too long."),
  name: text("Give the item a name.").max(120, "The name is too long."),
  item_type: z.enum(["RAW", "SEMI", "FINISHED", "PACKAGING", "SERVICE"], { error: "Choose an item type." }),
  make_or_buy: z.enum(["MAKE", "BUY"], { error: "Choose whether the item is made or bought." }),
  base_uom: text("Choose a unit of measure."),
  procurement_lead_days: intNonNeg("Procurement lead time"),
  production_lead_days: intNonNeg("Production lead time"),
  lot_rule: z.enum(["LOT_FOR_LOT", "FIXED", "EOQ", "MIN_MAX", "PERIODIC"]),
  lot_size: nonNeg("Lot size"),
  min_lot: nonNeg("Minimum lot"),
  max_lot: nonNeg("Maximum lot"),
  safety_stock: nonNeg("Safety stock"),
  scrap_pct: pct("Scrap %"),
  batch_tracked: z.boolean(),
  default_location_id: optId,
  active: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.lot_rule === "FIXED" && v.lot_size <= 0) ctx.addIssue({ code: "custom", message: "A fixed lot size needs a lot size above zero." });
  if (v.lot_rule === "MIN_MAX" && v.max_lot < v.min_lot) ctx.addIssue({ code: "custom", message: "The maximum lot can't be below the minimum." });
});
export type ItemForm = z.input<typeof itemSchema>;

export const bomLineSchema = z.object({
  component_item_id: text("Choose a component on every line."),
  qty: num("Quantity").gt(0, "Every line needs a quantity above zero."),
  uom: text("Choose a unit on every line."),
  scrap_pct: pct("Scrap %"),
  is_phantom: z.boolean(),
  kind: z.enum(["COMPONENT", "COPRODUCT", "BYPRODUCT"]),
  cost_share_pct: num("Cost share").min(0, "A cost share can't be negative.").max(100, "A cost share can't be above 100."),
});

export const bomSchema = z.object({
  item_id: text("Choose the item this bill of materials makes."),
  alt_no: num("Alternative").int("The alternative must be a whole number.").min(1, "The alternative must be 1 or higher."),
  base_qty: num("Base quantity").gt(0, "The base quantity must be above zero."),
  valid_from: dateStr("Choose the date this version starts."),
  valid_to: z.string().optional().transform((v) => (v ? v : null)),
  description: z.string().trim().optional().transform((v) => (v ? v : null)),
  lines: z.array(bomLineSchema).min(1, "Add at least one line."),
}).superRefine((v, ctx) => {
  if (v.valid_to && v.valid_to < v.valid_from) ctx.addIssue({ code: "custom", message: "\"Valid to\" can't be before \"valid from\"." });
  if (!v.lines.some((l) => l.kind === "COMPONENT")) ctx.addIssue({ code: "custom", message: "A bill of materials needs at least one component." });
  const share = v.lines.filter((l) => l.kind !== "COMPONENT").reduce((s, l) => s + l.cost_share_pct, 0);
  if (share > 100) ctx.addIssue({ code: "custom", message: `Co-product and by-product cost shares add up to ${share}%, which is more than 100%.` });
  v.lines.forEach((l, i) => {
    if (l.kind === "COMPONENT" && l.component_item_id === v.item_id) ctx.addIssue({ code: "custom", message: `Line ${i + 1}: an item can't be a component of itself.` });
  });
});

export const routingOpSchema = z.object({
  op_no: num("Operation number").int("Operation numbers are whole numbers.").min(1, "Operation numbers start at 1."),
  description: z.string().trim().optional().transform((v) => (v ? v : null)),
  work_center_id: text("Choose a work center on every operation."),
  setup_min: nonNeg("Setup time"),
  run_min_per_unit: nonNeg("Run time"),
  teardown_min: nonNeg("Teardown time"),
  queue_min: nonNeg("Queue time"),
  move_min: nonNeg("Move time"),
  control_key: z.enum(["PP01", "PP02", "PP03"]),
  component_line_nos: z.array(z.number().int()),
});

export const routingSchema = z.object({
  item_id: text("Choose the item this routing makes."),
  alt_no: num("Alternative").int("The alternative must be a whole number.").min(1, "The alternative must be 1 or higher."),
  description: z.string().trim().optional().transform((v) => (v ? v : null)),
  ops: z.array(routingOpSchema).min(1, "Add at least one operation."),
}).superRefine((v, ctx) => {
  const seen = new Set<number>();
  for (const o of v.ops) {
    if (seen.has(o.op_no)) ctx.addIssue({ code: "custom", message: `Operation number ${o.op_no} is used twice.` });
    seen.add(o.op_no);
  }
});

export const uomSchema = z.object({
  code: text("Give the unit a short code.").max(12, "Keep the code to 12 characters or fewer.").transform((v) => v.toUpperCase()),
  name: text("Give the unit a name."),
});
export const conversionSchema = z.object({
  item_id: optId,
  from_uom: text("Choose the unit to convert from."),
  to_uom: text("Choose the unit to convert to."),
  factor: num("Factor").gt(0, "The factor must be above zero."),
}).refine((v) => v.from_uom !== v.to_uom, { message: "Choose two different units." });

export const locationSchema = z.object({
  code: text("Give the location a code."),
  name: text("Give the location a name."),
  kind: z.enum(["RM", "WIP", "FG", "QUARANTINE"], { error: "Choose what is kept here." }),
});
export const costCenterSchema = z.object({ code: text("Give the cost center a code."), name: text("Give the cost center a name.") });
export const holidaySchema = z.object({ holiday_date: dateStr("Choose the date."), name: text("Give the holiday a name.") });

export const workCenterSchema = z.object({
  code: z.string().trim().optional().transform((v) => (v ? v : null)),
  name: text("Give the work center a name."),
  cost_center_id: optId,
  shifts: num("Shifts").int("Shifts must be a whole number.").min(1, "At least 1 shift.").max(3, "At most 3 shifts."),
  hours_per_shift: num("Hours per shift").gt(0, "Hours per shift must be above zero.").max(24, "A shift can't be longer than 24 hours."),
  utilization_pct: num("Utilization").gt(0, "Utilization must be above zero.").max(100, "Utilization can't be above 100%."),
  efficiency_pct: num("Efficiency").gt(0, "Efficiency must be above zero.").max(200, "Efficiency can't be above 200%."),
  working_days: z.array(z.number().int().min(1).max(7)).min(1, "Choose at least one working day."),
  active: z.boolean(),
});

export const rateSchema = z.object({
  work_center_id: text("Choose a work center."),
  activity_type_id: text("Choose an activity."),
  period_start: dateStr("Choose the month.").refine((v) => v.endsWith("-01"), { message: "A rate period starts on the 1st of a month." }),
  rate: nonNeg("Rate"),
});

export const costingSheetSchema = z.object({
  name: text("Give the surcharge a name."),
  kind: z.enum(["VARIABLE", "FIXED"]),
  base: z.enum(["MATERIAL", "LABOR", "BOTH"]),
  oh_pct: nonNeg("Percentage").max(1000, "A surcharge can't be above 1000%."),
  oh_rate_per_hour: nonNeg("Rate per hour"),
  active: z.boolean(),
});

/** The account type each posting key may point at (mirrors mfg_set_account in migration 0025). */
export function expectedAccountType(key: string): "asset" | "liability" | "expense" {
  if (["RM_INVENTORY", "WIP", "FG_INVENTORY", "PACKAGING_INVENTORY"].includes(key)) return "asset";
  if (key === "GR_IR") return "liability";
  return "expense";
}

/** Plain-language names for the posting keys, for the account determination screen. */
export const POSTING_LABEL: Record<string, string> = {
  RM_INVENTORY: "Raw materials inventory", WIP: "Work in process", FG_INVENTORY: "Finished goods inventory",
  PACKAGING_INVENTORY: "Packaging & supplies inventory", GR_IR: "Goods received / invoice received", PPV: "Purchase price variance",
  APPLIED_LABOR: "Applied direct labor", APPLIED_MACHINE: "Applied machine overhead", APPLIED_FIXED_OH: "Applied fixed overhead",
  MATERIAL_USAGE_VAR: "Material usage variance", LABOR_EFF_VAR: "Labor efficiency variance", LABOR_RATE_VAR: "Labor rate variance",
  MACHINE_OH_VAR: "Machine / variable overhead variance", FIXED_OH_VAR: "Fixed overhead volume variance", SCRAP_VAR: "Scrap variance",
  LOT_SIZE_VAR: "Lot-size variance", MIX_VAR: "Mix variance", REVALUATION: "Inventory revaluation", ROUNDING: "Rounding differences",
  COGS: "Cost of goods sold", SCRAP_LOSS: "Scrap & rework loss", COPQ: "Cost of poor quality", PAYROLL_EXPENSE: "Payroll expense",
};
