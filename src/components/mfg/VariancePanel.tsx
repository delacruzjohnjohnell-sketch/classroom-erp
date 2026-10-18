"use client";

import { useEffect, useState } from "react";
import { Empty, Panel } from "../ui";
import { Chip } from "../ListReport";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { money } from "@/lib/costing";
import { qtyText, VARIANCE_HELP } from "@/lib/mfgOps";

type Line = { bucket: string; label: string; actual: number; target: number; variance: number };
type Settlement = {
  id: string; document_number: string | null; posting_date: string; residual: number; reversal_of: string | null;
  detail: { lines?: Line[]; scrap_qty?: number; scrap_value?: number };
};

/**
 * What an order cost against its standard. Before settlement it shows what settling WILL write off (a read-only preview from
 * the database); after settlement it shows what was written off and where it went.
 */
export default function VariancePanel({ orderId, status, costing, reloadKey }: { orderId: string; status: string; costing: string; reloadKey?: unknown }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [settled, setSettled] = useState<Settlement | null>(null);

  useEffect(() => {
    (async () => {
      const s = await supabase.from("mfg_settlements").select("id, document_number, posting_date, residual, reversal_of, detail").eq("order_id", orderId).order("created_at", { ascending: false });
      showQueryErrors(s);
      const rows = (s.data as Settlement[]) ?? [];
      const reversed = new Set(rows.map((r) => r.reversal_of).filter((x): x is string => !!x));
      const active = rows.find((r) => r.reversal_of === null && !reversed.has(r.id)) ?? null;
      setSettled(active);
      if (active) {
        setLines(active.detail.lines ?? []);
      } else if (status === "CONFIRMED" || status === "DELIVERED") {
        const v = await supabase.rpc("mfg_order_variances", { p_order: orderId });
        setLines((v.data as Line[]) ?? []);
      } else {
        setLines([]);
      }
    })();
  }, [orderId, status, reloadKey]);

  if (!settled && !(status === "CONFIRMED" || status === "DELIVERED")) return null;
  const total = lines.reduce((sum, l) => sum + Number(l.variance), 0);
  const standard = costing === "STANDARD";
  const scrapQty = Number(settled?.detail.scrap_qty ?? 0);

  return (
    <Panel title={settled ? `Settled ${settled.document_number ?? ""} · ${settled.posting_date}` : "Variance so far — what settling will write off"}>
      {lines.length === 0 ? <Empty>Nothing to show yet.</Empty> : (
        <div className="overflow-x-auto">
          <table style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>{standard ? "Variance" : "Cost"}</th>
                {standard && <><th style={{ textAlign: "right" }}>Really cost</th><th style={{ textAlign: "right" }}>Standard allowed</th></>}
                <th style={{ textAlign: "right" }}>{standard ? "Difference" : "Written off"}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.bucket} title={VARIANCE_HELP[l.bucket]}>
                  <td>{l.label}<div className="text-[11px] text-[#7F8EA0] max-w-[420px]">{VARIANCE_HELP[l.bucket]}</div></td>
                  {standard && <><td style={{ textAlign: "right" }}>{money(l.actual)}</td><td style={{ textAlign: "right" }}>{money(l.target)}</td></>}
                  <td style={{ textAlign: "right" }}>
                    {Math.abs(Number(l.variance)) < 0.005 ? "—" : <Chip label={money(l.variance)} tone={Number(l.variance) > 0 ? "bad" : "good"} />}
                  </td>
                </tr>
              ))}
              <tr>
                <td><b>Total</b></td>
                {standard && <td colSpan={2} />}
                <td style={{ textAlign: "right" }}><b>{money(total)}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[11.5px] text-[#7F8EA0] mt-3">
        {standard
          ? "A positive difference means the order cost more than the standard allowed for the good units (an unfavourable variance); a negative one means it cost less. The difference is written off to the matching variance account."
          : "Under actual costing the good units take the order's real cost, so normally nothing is left to write off."}
        {scrapQty > 0 && standard ? ` ${qtyText(scrapQty)} unit${scrapQty === 1 ? " was" : "s were"} scrapped, worth ${money(settled?.detail.scrap_value ?? 0)} at standard; that cost is part of the material variance above.` : ""}
      </div>
    </Panel>
  );
}
