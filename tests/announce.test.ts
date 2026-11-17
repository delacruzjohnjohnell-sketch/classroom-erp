import test from "node:test";
import assert from "node:assert/strict";
import { fromBfar, fromBir, fromScoreRows, makeDrafts, namesOf, rankLines, shortName, type ScoreLine } from "../src/lib/announce.ts";

const L = (activity: string, label: string, who: string[], points: number, max = 56, system: ScoreLine["system"] = "MANUFACTURING"): ScoreLine => ({ system, activity, label, who, points, max });

test("students are named by first name and the initial of their last name", () => {
  assert.equal(shortName("Honey Angela Cruz"), "Honey C.");
  assert.equal(shortName("Salvador, Angeline Fay"), "Angeline S.");
  assert.equal(shortName("  JANA   ISABEL ESPINOZA "), "Jana E.");
  assert.equal(shortName("Juan Dela Cruz Jr."), "Juan C.");
  assert.equal(shortName("Cher"), "Cher");
  assert.equal(shortName(""), "A student");
  assert.equal(shortName(null), "A student");
});

test("a team or company shows its members in brackets, a solo student only the name", () => {
  assert.equal(namesOf(L("A", "Team 3", ["Honey Cruz", "Juan Santos"], 1)), "Team 3 (Honey C. and Juan S.)");
  assert.equal(namesOf(L("A", "HONEY COMPANY", ["Honey Cruz"], 1)), "Honey C.");
  assert.equal(namesOf(L("A", "Honey Co", [], 1)), "Honey Co");
});

test("ranking goes by percentage then points and leaves out zero scores", () => {
  const r = rankLines([L("A", "a", ["Ana Reyes"], 40), L("A", "b", ["Ben Cruz"], 56), L("A", "c", ["Cy Lim"], 0), L("A", "d", ["Di Sy"], 10, 0), L("A", "e", ["Ed Go"], 20, 28)]);
  assert.deepEqual(r.map((x) => x.label), ["b", "a", "e"]);   // 100%, then 40/56 and 20/28 are both 71.4%: the one with more points first
});

test("a draft congratulates the top scorer of each practice set and keeps the sets apart", () => {
  const ds = makeDrafts([L("Activity 1", "x", ["Ana Reyes"], 50), L("Activity 1", "y", ["Ben Cruz"], 56), L("Activity 2", "z", ["Cy Lim"], 30)]);
  assert.equal(ds.length, 2);
  assert.equal(ds[0].activity, "Activity 1");
  assert.match(ds[0].body, /Congratulations to Ben C\. for the highest score in Activity 1: 56\/56 \(100%\)/);
  assert.equal(ds[0].title, "Congratulations: top score in Activity 1");
  assert.match(ds[0].board, /^Top 2: 1\. Ben C\. 56\/56; 2\. Ana R\. 50\/56\.$/);
  assert.equal(ds[1].board, "");                                      // one scorer: no leaderboard line
});

test("a tie congratulates everyone who shares the top score", () => {
  const [d] = makeDrafts([L("Set", "a", ["Ana Reyes"], 56), L("Set", "b", ["Ben Cruz"], 56), L("Set", "c", ["Cy Lim"], 40)]);
  assert.equal(d.top.length, 2);
  assert.match(d.body, /Congratulations to Ana R\. and Ben C\., who share the highest score in Set: 56\/56 \(100%\)/);
});

test("the leaderboard lists at most five", () => {
  const lines = Array.from({ length: 8 }, (_, i) => L("Set", `s${i}`, [`Name${i} Last${i}`], 50 - i));
  const [d] = makeDrafts(lines);
  assert.equal((d.board.match(/\d\. /g) ?? []).length, 5);
  assert.ok(d.board.startsWith("Top 5: 1."));
});

test("nothing is drafted when nobody has scored", () => {
  assert.deepEqual(makeDrafts([L("Set", "a", ["Ana Reyes"], 0), L("Set", "b", ["Ben Cruz"], 0)]), []);
  assert.deepEqual(makeDrafts([]), []);
});

test("class score rows from Standard, Manufacturing and AIS become lines; rows without a score are dropped", () => {
  const lines = fromScoreRows([
    { edition: "Manufacturing", activity: "Activity 1", company: "Honey Co", students: ["Honey Cruz"], points: 56, max: 56 },
    { edition: "AIS", activity: "AIS: Document inbox", company: "Team 1", students: ["A B", "C D"], points: null, max: null },
    { edition: "Standard", activity: "Set", company: "S Co", students: ["E F"], points: 10, max: 20 },
  ]);
  assert.deepEqual(lines.map((l) => [l.system, l.points]), [["MANUFACTURING", 56], ["STANDARD", 10]]);
});

test("BIR: each student's best attempt per case is added up; free and wrong-form attempts do not count", () => {
  const lines = fromBir([
    { student: "Ana Reyes", form_id: "1701", case_id: "c1", score: 5, max_score: 10, wrong_form: false },
    { student: "Ana Reyes", form_id: "1701", case_id: "c1", score: 9, max_score: 10, wrong_form: false },
    { student: "Ana Reyes", form_id: "2550Q", case_id: "c2", score: 8, max_score: 10, wrong_form: false },
    { student: "Ana Reyes", form_id: "2550Q", case_id: "", score: 10, max_score: 10, wrong_form: false },
    { student: "Ben Cruz", form_id: "1701", case_id: "c1", score: 10, max_score: 10, wrong_form: true },
  ]);
  assert.equal(lines.length, 1);
  assert.deepEqual([lines[0].label, lines[0].points, lines[0].max], ["Ana Reyes", 17, 20]);
});

test("BFAR: only marked work counts, best mark per student in each set", () => {
  const lines = fromBfar([
    { student: "Ana Reyes", setId: "s1", score: 30, max: 40 },
    { student: "Ana Reyes", setId: "s1", score: 36, max: 40 },
    { student: "Ben Cruz", setId: "s1", score: null, max: null },
  ], { s1: "Clean Pro" });
  assert.equal(lines.length, 1);
  assert.deepEqual([lines[0].activity, lines[0].points, lines[0].max], ["Clean Pro", 36, 40]);
});
