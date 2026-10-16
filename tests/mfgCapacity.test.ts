import test from "node:test";
import assert from "node:assert/strict";
import { groupByWorkCenter, loadText, loadTone, summarise, type LoadRow } from "../src/lib/mfgCapacity.ts";
import { barGeometry, dayDiff, ganttRange, sortItems, weekMarks, type GanttItem } from "../src/lib/mfgGantt.ts";

const row = (wc: string, n: number, avail: number, req: number): LoadRow => ({
  work_center_id: wc, bucket_no: n, bucket_start: `2026-11-${String(2 + n * 7).padStart(2, "0")}`, available_h: avail, open_h: req, planned_h: 0, required_h: req,
  load_pct: avail > 0 ? Math.round((req / avail) * 1000) / 10 : null,
});

test("how busy a work centre is: idle, comfortable, nearly full, overloaded", () => {
  assert.equal(loadTone(0, 40), "idle");
  assert.equal(loadTone(20, 40), "ok");
  assert.equal(loadTone(34, 40), "busy");      // 85 %
  assert.equal(loadTone(40, 40), "busy");      // exactly full is not overloaded
  assert.equal(loadTone(40.5, 40), "over");
  assert.equal(loadTone(5, 0), "over");        // work but no working hours at all
});

test("the percentage text says so when there are no working hours", () => {
  assert.equal(loadText(row("a", 0, 40, 0)), "—");
  assert.equal(loadText(row("a", 0, 40, 18.5)), "46 %");
  assert.equal(loadText(row("a", 0, 0, 3)), "No hours");
});

test("rows are grouped by work centre in column order and summarised", () => {
  const rows = [row("b", 1, 40, 50), row("a", 1, 40, 10), row("a", 0, 40, 38), row("b", 0, 40, 0)];
  const g = groupByWorkCenter(rows);
  assert.deepEqual([...g.keys()].sort(), ["a", "b"]);
  assert.deepEqual(g.get("a")?.map((r) => r.bucket_no), [0, 1]);
  const s = summarise(g.get("a")!);
  assert.equal(s.required, 48);
  assert.equal(s.available, 80);
  assert.equal(s.peakPct, 95);
  assert.equal(s.busyColumns, 1);
  assert.equal(s.overColumns, 0);
  const t = summarise(g.get("b")!);
  assert.equal(t.overColumns, 1);
  assert.equal(t.firstOver, "2026-11-09");
});

const item = (id: string, start: string, end: string, kind: GanttItem["kind"] = "order"): GanttItem => ({ id, label: id, detail: "", kind, start, end, status: "RELEASED", late: false });

test("the Gantt range starts on a Monday, covers every order and is whole weeks", () => {
  const r = ganttRange([item("a", "2026-11-25", "2026-12-14")], "2026-11-02");
  assert.equal(r.start, "2026-11-02");          // a Monday
  assert.equal(r.days % 7, 0);
  assert.ok(dayDiff(r.start, "2026-12-14") < r.days);
  const early = ganttRange([item("a", "2026-10-28", "2026-11-03")], "2026-11-02");
  assert.equal(early.start, "2026-10-26");      // the Monday before a Wednesday start
  const empty = ganttRange([], "2026-11-04");      // four weeks from today plus a week of room on the right
  assert.equal(empty.start, "2026-11-02");
  assert.equal(empty.days, 42);
});

test("bars: position from the start date, width from the span, never thinner than 6 px", () => {
  assert.deepEqual(barGeometry({ start: "2026-11-09", end: "2026-11-11" }, "2026-11-02", 20), { x: 140, w: 60 });
  assert.deepEqual(barGeometry({ start: "2026-11-09", end: "2026-11-09" }, "2026-11-02", 4), { x: 28, w: 6 });
  assert.equal(barGeometry({ start: "2026-11-09", end: "2026-11-01" }, "2026-11-02", 20).w, 20);   // a finish before the start is drawn as one day
});

test("week marks fall on each Monday and rows sort by start date", () => {
  const marks = weekMarks({ start: "2026-11-02", days: 21 }, 10);
  assert.deepEqual(marks, [{ x: 0, label: "Nov 2" }, { x: 70, label: "Nov 9" }, { x: 140, label: "Nov 16" }]);
  assert.deepEqual(sortItems([item("b", "2026-11-09", "2026-11-10"), item("a", "2026-11-09", "2026-11-10"), item("c", "2026-11-02", "2026-11-03")]).map((i) => i.id), ["c", "a", "b"]);
});
