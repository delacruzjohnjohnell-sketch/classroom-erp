// Source documents drawn the way Philippine business papers look: BIR-style official receipts and invoices, check vouchers, payroll registers,
// bank deposit slips, and internal forms. The business names are fictional; the TINs and addresses are made up from the name.
import type { ReactNode } from "react";
import { formatAmount, formatPeso, pesosInWords, sum } from "../lib/currency";
import type { SourceDocument } from "../practice-sets/types";

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const tin = (name: string) => { const h = hash(name); const p = (n: number) => String((h >>> n) % 900 + 100); return `${p(1)}-${p(5)}-${p(9)}-000`; };
const STREETS = ["Rizal Avenue", "Mabini Street", "Aguinaldo Highway", "Bonifacio Drive", "Katipunan Avenue", "Quezon Boulevard", "P. Burgos Street", "Ayala Avenue"];
const CITIES = ["Quezon City", "Makati City", "Pasig City", "Mandaluyong City", "Manila", "Cebu City", "Davao City", "Taguig City"];
const address = (name: string) => { const h = hash(name); return `${(h % 880) + 20} ${STREETS[h % STREETS.length]}, ${CITIES[(h >>> 3) % CITIES.length]}, Philippines`; };
const nameOnly = (party: string) => party.split(",")[0];

const RED = "text-red-700";
const Sig = ({ label, className = "" }: { label: string; className?: string }) => (
  <div className={`text-center ${className}`}><div className="border-t border-slate-700 pt-0.5 text-[10px] uppercase tracking-wide text-slate-600">{label}</div></div>
);
const Paper = ({ children }: { children: ReactNode }) => (
  <div className="max-w-xl rounded-sm border border-slate-400 bg-white p-4 text-[13px] text-slate-800 shadow-sm font-serif">{children}</div>
);
const Letterhead = ({ name, vat = true }: { name: string; vat?: boolean }) => (
  <div className="text-center leading-tight">
    <div className="text-base font-bold uppercase tracking-wide text-slate-900">{name}</div>
    <div className="text-[11px] text-slate-600">{address(name)}</div>
    <div className="text-[11px] text-slate-600">{vat ? "VAT Reg." : "NON-VAT Reg."} TIN: {tin(name)}</div>
  </div>
);

function Lines({ d, columns = true }: { d: SourceDocument; columns?: boolean }) {
  return (
    <table className="w-full mt-2 text-[12px]">
      <thead>
        <tr className="border-y border-slate-700 text-left text-[10px] uppercase tracking-wide text-slate-600">
          {columns && <th className="py-1 w-10">Qty</th>}{columns && <th className="py-1 w-12">Unit</th>}
          <th className="py-1">Particulars</th>{columns && <th className="py-1 text-right w-24">Unit price</th>}<th className="py-1 text-right w-28">Amount</th>
        </tr>
      </thead>
      <tbody>
        {d.items.map((i, n) => (
          <tr key={n} className="border-b border-dotted border-slate-300 align-top">
            {columns && <td className="py-1">{i.amount < 0 ? "" : 1}</td>}{columns && <td className="py-1">{i.amount < 0 ? "" : "lot"}</td>}
            <td className="py-1 pr-2">{i.desc}</td>{columns && <td className="py-1 text-right tabular-nums">{formatAmount(i.amount)}</td>}<td className="py-1 text-right tabular-nums">{formatAmount(i.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Remarks = ({ d }: { d: SourceDocument }) => (
  <>
    {d.terms && <p className="mt-2 text-[11px]"><b>Terms:</b> {d.terms}</p>}
    {d.note && <p className="mt-1 text-[11px] italic text-slate-600">{d.note}</p>}
  </>
);

function Receipt({ d, entity }: { d: SourceDocument; entity: string }) {
  const total = sum(d.items.map((i) => i.amount));
  const byFirm = /\(issued\)/i.test(d.type) || ["Issued to", "Billed to", "Sold to"].includes(d.partyLabel);
  const issuer = byFirm ? entity : nameOnly(d.party);
  const other = byFirm ? d.party : entity;
  const title = d.type.replace(/\s*\(issued\)/i, "").toUpperCase();
  const isReceipt = /receipt/i.test(d.type);
  const isMemo = /memo/i.test(d.type);
  return (
    <Paper>
      <Letterhead name={issuer} vat={hash(issuer) % 3 !== 0} />
      <div className="mt-3 flex items-end justify-between border-y-2 border-slate-800 py-1">
        <div className="text-lg font-bold tracking-widest">{title}</div>
        <div className="text-right text-xs">No. <span className={`font-bold text-base ${RED}`}>{d.no}</span><div>Date: {d.date}</div></div>
      </div>
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-[12px]">
        <span className="text-slate-500">{isReceipt ? "Received from:" : isMemo ? `${d.partyLabel}:` : "Sold to:"}</span><b>{nameOnly(other)}</b>
        <span className="text-slate-500">TIN / Address:</span><span>{tin(other)} · {address(other)}</span>
        {!byFirm && !isMemo && isReceipt && <><span className="text-slate-500">Paid by:</span><span>{entity}</span></>}
      </div>
      <Lines d={d} />
      <div className="mt-1 flex justify-between border-t-2 border-slate-800 pt-1 font-bold"><span>TOTAL {isReceipt ? "AMOUNT RECEIVED" : "AMOUNT DUE"}</span><span className="tabular-nums">{formatPeso(total)}</span></div>
      <p className="mt-1 text-[11px]"><b>Amount in words:</b> {pesosInWords(total)}</p>
      {isReceipt && <p className="mt-1 text-[11px]">Received the sum of {pesosInWords(total)} in payment of the above, in full settlement of the amount stated.</p>}
      <Remarks d={d} />
      <div className="mt-6 grid grid-cols-2 gap-8"><div /><Sig label="Authorized signature" /></div>
      <div className="mt-2 border-t border-slate-300 pt-1 text-[9px] leading-tight text-slate-500">
        50 Bklts. (50x2) {d.no.replace(/\D/g, "").padStart(4, "0")}-{String(hash(d.no) % 9000 + 1000)} · BIR Authority to Print No. {String(hash(issuer) % 90000000 + 10000000)} · Date of ATP: 2026-06-15<br />
        {isReceipt ? "THIS OFFICIAL RECEIPT SHALL BE VALID FOR FIVE (5) YEARS FROM THE DATE OF THE ATP." : "THIS INVOICE SHALL BE VALID FOR FIVE (5) YEARS FROM THE DATE OF THE ATP."}
      </div>
    </Paper>
  );
}

function CheckVoucher({ d, entity }: { d: SourceDocument; entity: string }) {
  const total = sum(d.items.map((i) => i.amount));
  return (
    <Paper>
      <Letterhead name={entity} />
      <div className="mt-3 flex items-end justify-between border-y-2 border-slate-800 py-1">
        <div className="text-lg font-bold tracking-widest">CHECK VOUCHER</div>
        <div className="text-right text-xs">CV No. <span className={`font-bold text-base ${RED}`}>{d.no}</span><div>Date: {d.date}</div></div>
      </div>
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-[12px]"><span className="text-slate-500">Pay to:</span><b>{nameOnly(d.party)}</b></div>
      <Lines d={d} columns={false} />
      <div className="mt-1 flex justify-between border-t-2 border-slate-800 pt-1 font-bold"><span>NET AMOUNT OF CHECK</span><span className="tabular-nums">{formatPeso(total)}</span></div>
      <p className="mt-1 text-[11px]"><b>Amount in words:</b> {pesosInWords(total)}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 border border-slate-400 p-1.5 text-[11px]">
        <div><span className="text-slate-500">Bank:</span> BDO Unibank</div><div><span className="text-slate-500">Check No.:</span> {String(hash(d.no) % 900000 + 100000)}</div><div><span className="text-slate-500">Check date:</span> {d.date}</div>
      </div>
      <Remarks d={d} />
      <div className="mt-6 grid grid-cols-3 gap-4"><Sig label="Prepared by" /><Sig label="Approved by" /><Sig label="Received by / date" /></div>
    </Paper>
  );
}

function Payroll({ d, entity }: { d: SourceDocument; entity: string }) {
  const total = sum(d.items.map((i) => i.amount));
  return (
    <Paper>
      <Letterhead name={entity} />
      <div className="mt-3 flex items-end justify-between border-y-2 border-slate-800 py-1">
        <div className="text-lg font-bold tracking-widest">PAYROLL REGISTER</div>
        <div className="text-right text-xs">Ref. <span className={`font-bold ${RED}`}>{d.no}</span><div>Date: {d.date}</div></div>
      </div>
      <div className="mt-2 text-[12px]"><span className="text-slate-500">{d.partyLabel}:</span> <b>{d.party}</b></div>
      <table className="w-full mt-2 text-[12px]">
        <thead><tr className="border-y border-slate-700 text-left text-[10px] uppercase tracking-wide text-slate-600"><th className="py-1">Pay period / remarks</th><th className="py-1 text-right w-28">Gross pay</th><th className="py-1 text-right w-24">Deductions</th><th className="py-1 text-right w-28">Net pay</th></tr></thead>
        <tbody>{d.items.map((i, n) => <tr key={n} className="border-b border-dotted border-slate-300"><td className="py-1 pr-2">{i.desc}</td><td className="py-1 text-right tabular-nums">{formatAmount(i.amount)}</td><td className="py-1 text-right tabular-nums">0.00</td><td className="py-1 text-right tabular-nums">{formatAmount(i.amount)}</td></tr>)}</tbody>
        <tfoot><tr className="border-t-2 border-slate-800 font-bold"><td className="py-1">TOTAL</td><td className="py-1 text-right tabular-nums">{formatPeso(total)}</td><td className="py-1 text-right tabular-nums">0.00</td><td className="py-1 text-right tabular-nums">{formatPeso(total)}</td></tr></tfoot>
      </table>
      <p className="mt-1 text-[11px]"><b>Net pay in words:</b> {pesosInWords(total)}</p>
      <Remarks d={d} />
      <div className="mt-6 grid grid-cols-3 gap-4"><Sig label="Prepared by" /><Sig label="Approved by" /><Sig label="Received by employees (see signature sheet)" /></div>
    </Paper>
  );
}

function DepositSlip({ d, entity }: { d: SourceDocument; entity: string }) {
  const total = sum(d.items.map((i) => i.amount));
  return (
    <Paper>
      <div className="flex items-start justify-between"><div className="text-base font-bold tracking-wide text-blue-900">BDO Unibank, Inc.</div><div className="text-right text-xs">Slip No. <span className={`font-bold ${RED}`}>{d.no}</span><div>Date: {d.date}</div></div></div>
      <div className="mt-1 border-y-2 border-blue-900 py-1 text-center text-lg font-bold tracking-widest text-blue-900">DEPOSIT SLIP</div>
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-[12px]"><span className="text-slate-500">Account name:</span><b>{entity}</b><span className="text-slate-500">Account no.:</span><span>{String(hash(entity) % 9000000000 + 1000000000).replace(/(\d{4})(\d{4})(\d+)/, "$1-$2-$3")}</span><span className="text-slate-500">{d.partyLabel}:</span><span>{d.party}</span></div>
      <Lines d={d} columns={false} />
      <div className="mt-1 flex justify-between border-t-2 border-slate-800 pt-1 font-bold"><span>TOTAL DEPOSIT</span><span className="tabular-nums">{formatPeso(total)}</span></div>
      <p className="mt-1 text-[11px]"><b>In words:</b> {pesosInWords(total)}</p>
      <Remarks d={d} />
      <div className="mt-4 grid grid-cols-2 gap-6"><Sig label="Depositor's signature" /><div className="border border-dashed border-slate-400 p-2 text-center text-[10px] text-slate-400">TELLER&apos;S VALIDATION</div></div>
    </Paper>
  );
}

function Utility({ d, entity }: { d: SourceDocument; entity: string }) {
  const total = sum(d.items.map((i) => i.amount));
  return (
    <Paper>
      <div className="text-center text-base font-bold uppercase tracking-wide">{d.party}</div>
      <div className="mt-1 border-y-2 border-slate-800 py-1 text-center font-bold tracking-widest">STATEMENT OF ACCOUNT / OFFICIAL RECEIPT</div>
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-[12px]"><span className="text-slate-500">Customer:</span><b>{entity}</b><span className="text-slate-500">Reference no.:</span><span className={`font-bold ${RED}`}>{d.no}</span><span className="text-slate-500">Date paid:</span><span>{d.date}</span></div>
      <Lines d={d} columns={false} />
      <div className="mt-1 flex justify-between border-t-2 border-slate-800 pt-1 font-bold"><span>TOTAL AMOUNT PAID</span><span className="tabular-nums">{formatPeso(total)}</span></div>
      <p className="mt-1 text-[11px]"><b>Amount in words:</b> {pesosInWords(total)}</p>
      <Remarks d={d} />
      <div className="mt-3 text-center text-[11px] font-semibold tracking-widest text-emerald-700">PAID · CASH · {d.date}</div>
    </Paper>
  );
}

function InternalForm({ d, entity }: { d: SourceDocument; entity: string }) {
  const total = sum(d.items.map((i) => i.amount));
  return (
    <Paper>
      <Letterhead name={entity} vat={false} />
      <div className="mt-3 flex items-end justify-between border-y-2 border-slate-800 py-1">
        <div className="text-base font-bold uppercase tracking-wider">{d.type}</div>
        <div className="text-right text-xs">Ref. <span className={`font-bold ${RED}`}>{d.no}</span><div>As of: {d.date}</div></div>
      </div>
      <div className="mt-2 text-[12px]"><span className="text-slate-500">{d.partyLabel}:</span> <b>{d.party}</b></div>
      <Lines d={d} columns={false} />
      {d.items.length > 1 && <div className="mt-1 flex justify-between border-t border-slate-700 pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{formatAmount(total)}</span></div>}
      <Remarks d={d} />
      <div className="mt-6 grid grid-cols-2 gap-8"><Sig label="Prepared by" /><Sig label="Checked by" /></div>
    </Paper>
  );
}

export function SourceDocumentCard({ document: d, entity }: { document: SourceDocument; entity: string }) {
  const t = d.type.toLowerCase();
  if (t.includes("check voucher") || t.includes("replenishment")) return <CheckVoucher d={d} entity={entity} />;
  if (t.includes("payroll")) return <Payroll d={d} entity={entity} />;
  if (t.includes("deposit slip")) return <DepositSlip d={d} entity={entity} />;
  if (t.includes("utility")) return <Utility d={d} entity={entity} />;
  if (t.includes("receipt") || t.includes("invoice") || t.includes("memo") || t.includes("billing")) return <Receipt d={d} entity={entity} />;
  return <InternalForm d={d} entity={entity} />;
}
