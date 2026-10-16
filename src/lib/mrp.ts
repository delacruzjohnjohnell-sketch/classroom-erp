// Pure mirror of the planning rules in migration 0034 (mfg_run_mrp, mfg__lot_qty, mfg__bucket and the pegging join).
// No database, no React: the screens use it to explain a plan, and the tests pin it to the same numbers the SQL test checks.

export type LotRule = "LOT_FOR_LOT" | "FIXED" | "EOQ" | "MIN_MAX" | "PERIODIC";

export const LOT_RULE_LABEL: Record<LotRule, string> = {
  LOT_FOR_LOT: "Lot for lot",
  FIXED: "Fixed lot size",
  EOQ: "Economic order quantity",
  MIN_MAX: "Minimum and maximum",
  PERIODIC: "Periodic (several periods at once)",
};

export const LOT_RULE_HELP: Record<LotRule, string> = {
  LOT_FOR_LOT: "Order exactly what is short, every time.",
  FIXED: "Order in whole multiples of the lot size, so the shortage is rounded up.",
  EOQ: "Order the shortage, but never less than the economic order quantity (the lot size).",
  MIN_MAX: "Never order less than the minimum lot; split anything above the maximum into several orders.",
  PERIODIC: "When stock runs short, order enough for this period and the next (lot size − 1) periods.",
};

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const EPS = 0.000001;

/** Which time bucket a date falls in. Late dates go into the first bucket; dates beyond the horizon give -1. */
export function bucketOf(date: string, start: string, width: number, count: number): number {
  const days = Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000);
  if (days < 0) return 0;
  const b = Math.floor(days / width);
  return b >= count ? -1 : b;
}

/** Add days to an ISO date. */
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
}

/** The order quantities a lot rule gives for one shortage (MIN_MAX can split it into several orders). */
export function lotQty(rule: LotRule, need: number, p: { lot?: number; min?: number; max?: number } = {}): number[] {
  if (!(need > 0)) return [];
  const n = r6(need);
  const lot = p.lot ?? 0, min = p.min ?? 0, max = p.max ?? 0;
  if (rule === "FIXED") return [r6(Math.ceil(n / lot) * lot)];
  if (rule === "EOQ") return [Math.max(n, lot)];
  if (rule === "MIN_MAX") {
    let rest = Math.max(n, min);
    if (max > 0) {
      const out: number[] = [];
      while (rest > max + EPS) { out.push(max); rest = r6(rest - max); }
      if (rest > EPS) out.push(Math.max(rest, min));
      return out;
    }
    return [rest];
  }
  return [n]; // LOT_FOR_LOT and PERIODIC (the periodic widening happens in planItem)
}

export type PlanInput = {
  onHand: number;
  gross: number[];          // requirements per bucket
  scheduled: number[];      // receipts already on order per bucket
  safetyStock?: number;
  lotRule?: LotRule;
  lotSize?: number;
  minLot?: number;
  maxLot?: number;
  scrapPct?: number;
  leadDays?: number;
  startDate: string;
  bucketDays: number;
};

export type PlannedLot = { bucket: number; qty: number; good: number; receiveOn: string; startOn: string; lateDays: number };
export type PlanResult = { projectedEnd: number[]; projectedStart: number[]; net: number[]; receipts: number[]; lots: PlannedLot[] };

/** Net the requirements against stock and receipts, bucket by bucket, and size the orders that cover every shortage. */
export function planItem(x: PlanInput): PlanResult {
  const nb = x.gross.length;
  const safety = x.safetyStock ?? 0;
  const scrap = Math.min(x.scrapPct ?? 0, 95);
  const rule = x.lotRule ?? "LOT_FOR_LOT";
  const lead = x.leadDays ?? 0;
  const projectedStart: number[] = [], projectedEnd: number[] = [], net: number[] = [], receipts: number[] = [], lots: PlannedLot[] = [];
  let proj = Math.max(x.onHand, 0);
  for (let i = 0; i < nb; i++) {
    projectedStart.push(proj);
    net.push(0);
    receipts.push(0);
    proj = r6(proj + (x.scheduled[i] ?? 0) - x.gross[i]);
    if (proj < safety - EPS) {
      let need = safety - proj;
      net[i] = need;
      if (rule === "PERIODIC") {
        const k = Math.max(1, Math.round(x.lotSize ?? 1));
        let acc = proj, best = need;
        for (let j = i + 1; j <= Math.min(i + k - 1, nb - 1); j++) {
          acc = r6(acc + (x.scheduled[j] ?? 0) - x.gross[j]);
          best = Math.max(best, safety - acc);
        }
        need = best;
      }
      for (const q of lotQty(rule, r6(need / (1 - scrap / 100)), { lot: x.lotSize, min: x.minLot, max: x.maxLot })) {
        const good = r6(q * (1 - scrap / 100));
        receipts[i] = r6(receipts[i] + good);
        proj = r6(proj + good);
        const receiveOn = addDays(x.startDate, i * x.bucketDays);
        const rawStart = addDays(receiveOn, -lead);
        const late = rawStart < x.startDate;
        lots.push({ bucket: i, qty: q, good, receiveOn, startOn: late ? x.startDate : rawStart, lateDays: late ? Math.round((Date.parse(x.startDate) - Date.parse(rawStart)) / 86400000) : 0 });
      }
    }
    projectedEnd.push(proj);
  }
  return { projectedStart, projectedEnd, net, receipts, lots };
}

export type PegDemand = { ref: string; qty: number };
export type PegSupply = { ref: string; qty: number };
export type Peg = { demand: string; supply: string; qty: number };

/** Match requirements to supply first come, first served (both lists already in date order). Stock left over is not pegged. */
export function pegFifo(demands: PegDemand[], supplies: PegSupply[]): Peg[] {
  const out: Peg[] = [];
  let si = 0, sLeft = supplies[0]?.qty ?? 0;
  for (const d of demands) {
    let need = d.qty;
    while (need > EPS && si < supplies.length) {
      const take = Math.min(need, sLeft);
      if (take > EPS) out.push({ demand: d.ref, supply: supplies[si].ref, qty: r6(take) });
      need = r6(need - take);
      sLeft = r6(sLeft - take);
      if (sLeft <= EPS) { si++; sLeft = supplies[si]?.qty ?? 0; }
    }
  }
  return out;
}

export const EXCEPTION_LABEL: Record<string, string> = {
  LATE_START: "Should already have started",
  PAST_DUE_RECEIPT: "Overdue order",
  NO_ACTIVE_BOM: "No bill of materials",
  RESCHEDULE_IN: "Bring forward",
  NOT_NEEDED: "Not needed",
};

export const EXCEPTION_HELP: Record<string, string> = {
  LATE_START: "The lead time is longer than the time left, so this will finish late however fast you act.",
  PAST_DUE_RECEIPT: "An order that should have arrived has not been received.",
  NO_ACTIVE_BOM: "A product you make has no active bill of materials, so its components can't be planned.",
  RESCHEDULE_IN: "An order is on its way, but it arrives after the first shortage.",
  NOT_NEEDED: "An order is on its way that stock already covers. Postpone or cancel it.",
};

export const DEMAND_LABEL: Record<string, string> = {
  SALES_ORDER: "Sales order",
  FORECAST: "Forecast",
  ORDER_COMPONENT: "Open production order",
  DEPENDENT: "Planned order (components)",
};

export const SUPPLY_LABEL: Record<string, string> = {
  ONHAND: "On hand",
  PURCHASE_ORDER: "Purchase order",
  PRODUCTION_ORDER: "Production order",
  PLANNED_ORDER: "Planned order",
  REQUISITION: "Purchase requisition",
};
