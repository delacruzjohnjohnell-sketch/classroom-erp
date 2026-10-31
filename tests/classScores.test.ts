import test from "node:test";
import assert from "node:assert/strict";
import { classWorkbookBytes, mostMissed, pctOf, resultOf, studentMatrix, type DetailRow, type ScoreRow } from "../src/lib/classScores.ts";

const d = (edition: ScoreRow["edition"], activity: string, company: string, students: string, item: string, points: number, max: number, note = ""): DetailRow =>
  ({ edition, activity, company, students, group: "g", item, points, max, note });
const rows: ScoreRow[] = [
  { edition: "Standard", activity: "Nov-Dec 2026", company: "Co A", students: ["Ana Cruz"], points: 8, max: 10, status: "Checked", detail: [d("Standard", "Nov-Dec 2026", "Co A", "Ana Cruz", "Trial balance", 1, 1), d("Standard", "Nov-Dec 2026", "Co A", "Ana Cruz", "VAT payable", 0, 1, "Expected 100; found 90")] },
  { edition: "Standard", activity: "Nov-Dec 2026", company: "Co B", students: ["Ben Reyes"], points: 5, max: 10, status: "Checked", detail: [d("Standard", "Nov-Dec 2026", "Co B", "Ben Reyes", "Trial balance", 1, 1), d("Standard", "Nov-Dec 2026", "Co B", "Ben Reyes", "VAT payable", 0, 1, "Expected 100; found 70")] },
  { edition: "AIS", activity: "AIS: Sales desk", company: "Sinag 1", students: ["Ana Cruz", "Ben Reyes"], points: 30, max: 54, status: "Accounting", detail: [d("AIS", "AIS: Sales desk", "Sinag 1", "Ana Cruz, Ben Reyes", "PO-4410", 6, 6)] },
];

test("percentages and results", () => {
  assert.equal(pctOf(8, 10), 80); assert.equal(pctOf(1, 3), 33); assert.equal(pctOf(null, 10), null); assert.equal(pctOf(5, 0), null);
  assert.equal(resultOf(6, 6), "Correct"); assert.equal(resultOf(3, 6), "Partly"); assert.equal(resultOf(0, 6), "Missed");
});

test("the student matrix has one row per student and keeps the best attempt per activity", () => {
  const dup: ScoreRow[] = [...rows, { ...rows[0], company: "Co A second try", points: 10, max: 10 }];
  const m = studentMatrix(dup);
  assert.deepEqual(m.activities, ["Nov-Dec 2026", "AIS: Sales desk"]);
  const ana = m.students.find((s) => s.name === "Ana Cruz")!;
  assert.equal(ana.cells["Nov-Dec 2026"], 100);
  assert.equal(ana.cells["AIS: Sales desk"], 56);
  assert.equal(ana.average, 78);
  assert.deepEqual(m.students.map((s) => s.name), ["Ana Cruz", "Ben Reyes"]);
});

test("most missed items come first, by how many students missed them", () => {
  const top = mostMissed(rows.flatMap((r) => r.detail));
  assert.equal(top.length, 1);
  assert.equal(top[0].item, "VAT payable");
  assert.equal(top[0].attempts, 2); assert.equal(top[0].missed, 2); assert.equal(top[0].missRate, 1);
});

test("the workbook has the six sheets and the right numbers", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const bytes = await classWorkbookBytes(rows, { includeAnswers: true, generated: "test" });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Summary", "Standard", "Manufacturing", "AIS", "Detail", "Class insights"]);
  const sum = wb.getWorksheet("Summary")!;
  assert.deepEqual((sum.getRow(1).values as unknown[]).slice(1), ["Student", "Nov-Dec 2026", "AIS: Sales desk", "Average"]);
  assert.equal(sum.getRow(2).getCell(1).value, "Ana Cruz");
  assert.equal(sum.getRow(2).getCell(2).value, 0.8);
  assert.equal(sum.getRow(2).getCell(2).numFmt, "0%");
  const std = wb.getWorksheet("Standard")!;
  assert.equal(std.rowCount, 3);
  assert.equal(std.getRow(2).getCell(6).value, 0.8);
  const det = wb.getWorksheet("Detail")!;
  assert.equal(det.getRow(3).getCell(9).value, "Missed");
  assert.equal(det.getRow(3).getCell(10).value, "Expected 100; found 90");
  const ins = wb.getWorksheet("Class insights")!;
  assert.equal(ins.getRow(2).getCell(3).value, "VAT payable");
});

test("answers can be left out of the Detail sheet", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await classWorkbookBytes(rows, { includeAnswers: false }));
  const note = wb.getWorksheet("Detail")!.getRow(3).getCell(10).value;
  assert.ok(note === null || note === "" || note === undefined);
});

test("each company's best-matching set is marked, and only those count towards the summary", async () => {
  const { markBestMatch, counted, studentMatrix: matrix } = await import("../src/lib/classScores.ts");
  const mk = (company: string, activity: string, points: number): ScoreRow => ({ edition: "Standard", activity, company, students: [company + " student"], points, max: 10, status: "x", detail: [] });
  const rows = markBestMatch([mk("A", "Set one", 9), mk("A", "Set two", 2), mk("B", "Set one", 1), mk("B", "Set two", 8)]);
  assert.deepEqual(rows.map((r) => r.bestMatch), [true, false, false, true]);
  assert.deepEqual(rows.map((r) => r.status), ["Best match", "Another set", "Another set", "Best match"]);
  assert.equal(counted(rows).length, 2);
  const m = matrix(counted(rows));
  assert.equal(m.students.find((s) => s.name === "A student")!.cells["Set one"], 90);
  assert.equal(m.students.find((s) => s.name === "A student")!.cells["Set two"], undefined);
});
