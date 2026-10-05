// Builds the downloadable practice-set report a student sees after the teacher
// publishes a check result. Pure functions with no imports, so they can be tested alone.

export type ReportRow = {
  group: string;
  label: string;
  pass: boolean;
  expected?: string;   // only present when the teacher chose to share details
  actual?: string;
  hint?: string;
};

export type ReportRecord = {
  id: string;
  set_name: string;
  passed: number;
  total: number;
  net_income: number;
  include_details: boolean;
  results: ReportRow[];
  created_at: string;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const peso = (n: number) => "₱" + (n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function reportDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

export function reportFileName(companyName: string, iso: string): string {
  const safe = companyName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "company";
  const day = (isNaN(new Date(iso).getTime()) ? "" : new Date(iso).toISOString().slice(0, 10));
  return `Practice-Set-Report-${safe}${day ? "-" + day : ""}.html`;
}

function groupRows(rows: ReportRow[]) {
  const order: string[] = [];
  rows.forEach((r) => { if (!order.includes(r.group)) order.push(r.group); });
  return order.map((g) => ({ group: g, rows: rows.filter((r) => r.group === g) }));
}

export function buildReportHtml(companyName: string, r: ReportRecord): string {
  const failed = r.results.filter((x) => !x.pass);
  const passed = r.results.filter((x) => x.pass);
  const details = r.include_details;

  const failedRows = groupRows(failed).map(({ group, rows }) => `
    <h3>${esc(group)}</h3>
    <table>
      <tr><th>Check</th>${details ? "<th>Expected</th><th>Found</th>" : ""}</tr>
      ${rows.map((x) => `<tr><td>${esc(x.label)}${details && x.hint ? `<div class="hint">${esc(x.hint)}</div>` : ""}</td>${details ? `<td>${esc(x.expected)}</td><td>${esc(x.actual)}</td>` : ""}</tr>`).join("")}
    </table>`).join("");

  const passedList = groupRows(passed).map(({ group, rows }) => `
    <h3>${esc(group)}</h3>
    <ul>${rows.map((x) => `<li>${esc(x.label)}</li>`).join("")}</ul>`).join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Practice Set Report — ${esc(companyName)}</title>
<style>
  body{font-family:"Times New Roman",Times,serif;color:#000;background:#fff;max-width:760px;margin:32px auto;padding:0 20px;font-size:14px;line-height:1.45}
  h1{font-size:22px;margin:0 0 4px}
  h2{font-size:16px;border-bottom:1px solid #000;padding-bottom:3px;margin:26px 0 8px}
  h3{font-size:13px;margin:16px 0 6px;text-decoration:underline}
  .meta{margin:0 0 14px}
  .score{font-size:26px;font-weight:bold;margin:10px 0 2px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;border-top:1px solid #000;border-bottom:1px solid #000;padding:5px 6px}
  td{border-bottom:1px solid #bbb;padding:5px 6px;vertical-align:top}
  .hint{font-size:12px;margin-top:3px;font-style:italic}
  ul{margin:0;padding-left:20px}
  .foot{margin-top:28px;font-size:12px;border-top:1px solid #000;padding-top:8px}
  @media print{body{margin:0;max-width:none}}
</style></head><body>
<h1>Practice Set Report</h1>
<p class="meta"><strong>${esc(companyName)}</strong><br>${esc(r.set_name)}<br>Checked on ${esc(reportDate(r.created_at))}</p>
<div class="score">${r.passed} of ${r.total} checks passed</div>
<div>Net result so far: ${r.net_income >= 0 ? "net profit" : "net loss"} of ${esc(peso(Math.abs(r.net_income)))}</div>
${failed.length === 0 ? "<h2>Result</h2><p>Everything matches the practice set.</p>" : `<h2>Needs attention (${failed.length})</h2>${failedRows}`}
${passed.length > 0 ? `<h2>Passed (${passed.length})</h2>${passedList}` : ""}
<div class="foot">Fix anything listed under Needs attention, then ask your teacher to check again.</div>
</body></html>`;
}
