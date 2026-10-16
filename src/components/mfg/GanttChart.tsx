"use client";

import { barGeometry, ganttRange, GANTT_COLOR, sortItems, weekMarks, dayDiff, type GanttItem } from "@/lib/mfgGantt";

const LABEL_W = 210;
const ROW_H = 28;
const HEAD_H = 26;
const MONO = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';

/** Orders and planned orders on a timeline, drawn as plain SVG. Click a bar to open it. */
export default function GanttChart({ items, today, onPick }: { items: GanttItem[]; today: string; onPick: (item: GanttItem) => void }) {
  if (items.length === 0) return <div className="text-[12.5px] text-[#7F8EA0] py-4">Nothing is scheduled. Production orders and planned orders appear here as bars from their start to their finish.</div>;
  const rows = sortItems(items);
  const range = ganttRange(rows, today);
  const px = range.days <= 84 ? 14 : range.days <= 182 ? 8 : 4;
  const width = LABEL_W + range.days * px;
  const height = HEAD_H + rows.length * ROW_H + 4;
  const marks = weekMarks(range, px);
  const todayX = dayDiff(range.start, today);
  const inRange = todayX >= 0 && todayX <= range.days;

  return (
    <div className="overflow-x-auto" role="region" aria-label="Gantt chart" tabIndex={0}>
      <svg width={width} height={height} style={{ fontFamily: MONO, fontSize: 11.5, display: "block" }}>
        <defs>
          <pattern id="gantt-stripes" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#F2B13C" fillOpacity="0.35" />
            <rect width="3" height="6" fill="#F2B13C" fillOpacity="0.9" />
          </pattern>
        </defs>
        {marks.map((m) => (
          <g key={m.x} transform={`translate(${LABEL_W + m.x}, 0)`}>
            <line x1={0} x2={0} y1={HEAD_H - 4} y2={height} stroke="#C5D0E2" strokeOpacity={0.6} />
            <text x={4} y={16} fill="#7F8EA0">{m.label}</text>
          </g>
        ))}
        {inRange && <line x1={LABEL_W + todayX * px + px / 2} x2={LABEL_W + todayX * px + px / 2} y1={HEAD_H - 4} y2={height} stroke="#FF6B7A" strokeWidth={1.5} strokeDasharray="4 3" />}
        {rows.map((r, i) => {
          const y = HEAD_H + i * ROW_H;
          const g = barGeometry(r, range.start, px);
          const planned = r.kind === "planned";
          return (
            <g key={r.id} transform={`translate(0, ${y})`} style={{ cursor: "pointer" }} onClick={() => onPick(r)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(r); } }} aria-label={`${r.label}: ${r.detail}`}>
              <rect x={0} y={0} width={width} height={ROW_H} fill="transparent" />
              <line x1={0} x2={width} y1={ROW_H} y2={ROW_H} stroke="#C5D0E2" strokeOpacity={0.35} />
              <text x={6} y={18} fill="#A3B1C2">{r.label.length > 30 ? r.label.slice(0, 29) + "…" : r.label}</text>
              <rect x={LABEL_W + g.x} y={6} width={g.w} height={16} rx={3}
                fill={planned ? "url(#gantt-stripes)" : GANTT_COLOR.order} stroke={r.late ? GANTT_COLOR.late : planned ? GANTT_COLOR.planned : GANTT_COLOR.order} strokeWidth={r.late ? 2 : 1}>
                <title>{`${r.label} · ${r.detail} · ${r.start} to ${r.end}${r.late ? " · late" : ""}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-[#7F8EA0] mt-2">
        <span><span style={{ display: "inline-block", width: 12, height: 8, background: GANTT_COLOR.order, marginRight: 5 }} />Production order</span>
        <span><span style={{ display: "inline-block", width: 12, height: 8, background: GANTT_COLOR.planned, marginRight: 5 }} />Planned order (not yet made)</span>
        <span><span style={{ display: "inline-block", width: 12, height: 8, border: `2px solid ${GANTT_COLOR.late}`, marginRight: 5 }} />Will finish late</span>
        <span><span style={{ display: "inline-block", width: 12, height: 0, borderTop: "2px dashed #FF6B7A", marginRight: 5, verticalAlign: "middle" }} />Today</span>
      </div>
    </div>
  );
}
