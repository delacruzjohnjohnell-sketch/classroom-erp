import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFilters, clampWidth, compareCells, csvCell, distinctValues, matchesSearch, parseVariants,
  removeVariant, sortRows, toCsv, upsertVariant, MAX_COL_WIDTH, MIN_COL_WIDTH, type Variant,
} from "../src/lib/listReport.ts";

test("search needs every word, in any column, ignoring case", () => {
  assert.equal(matchesSearch(["Chair leg", "SEMI", 4], "leg semi"), true);
  assert.equal(matchesSearch(["Chair leg", "SEMI", 4], "leg raw"), false);
  assert.equal(matchesSearch(["Chair leg", null, undefined], "  "), true);
  assert.equal(matchesSearch([12.5], "12.5"), true);
});

test("filters keep rows that match every chosen value and ignore empty choices", () => {
  const rows = [{ t: "RAW", s: "ACTIVE" }, { t: "RAW", s: "DRAFT" }, { t: "SEMI", s: "ACTIVE" }];
  const get = (r: { t: string; s: string }, k: string) => (r as Record<string, string>)[k];
  assert.equal(applyFilters(rows, { t: "RAW", s: "" }, get).length, 2);
  assert.equal(applyFilters(rows, { t: "RAW", s: "ACTIVE" }, get).length, 1);
  assert.equal(applyFilters(rows, {}, get), rows);
});

test("sorting is numeric for numbers, natural for text, stable, and puts blanks last both ways", () => {
  assert.deepEqual(sortRows([10, 2, 33, 4], (n) => n, "asc"), [2, 4, 10, 33]);
  assert.deepEqual(sortRows([10, 2, 33, 4], (n) => n, "desc"), [33, 10, 4, 2]);
  assert.deepEqual(sortRows(["Item 10", "Item 2", "item 1"], (s) => s, "asc"), ["item 1", "Item 2", "Item 10"]);
  const withBlank = [{ v: null }, { v: 3 }, { v: 1 }];
  assert.deepEqual(sortRows(withBlank, (r) => r.v, "asc").map((r) => r.v), [1, 3, null]);
  assert.deepEqual(sortRows(withBlank, (r) => r.v, "desc").map((r) => r.v), [3, 1, null]);
  const ties = [{ k: 1, id: "a" }, { k: 1, id: "b" }, { k: 0, id: "c" }];
  assert.deepEqual(sortRows(ties, (r) => r.k, "asc").map((r) => r.id), ["c", "a", "b"]);
  assert.equal(compareCells(null, null, "asc"), 0);
});

test("a filter drop-down lists each value once, skipping blanks", () => {
  assert.deepEqual(distinctValues([{ s: "B" }, { s: "A" }, { s: "B" }, { s: "" }, { s: null }], (r) => r.s), ["A", "B"]);
});

test("CSV quotes what it must and defuses spreadsheet formulas", () => {
  assert.equal(csvCell('say "hi", ok'), '"say ""hi"", ok"');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(-5), "-5");
  assert.equal(csvCell("-5"), "-5");
  assert.equal(csvCell("=SUM(A1:A9)"), "'=SUM(A1:A9)");
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell("-cmd"), "'-cmd");
  assert.equal(toCsv(["a", "b"], [[1, "x,y"], [null, true]]), 'a,b\r\n1,"x,y"\r\n,true');
});

test("column widths stay within sensible limits", () => {
  assert.equal(clampWidth(5), MIN_COL_WIDTH);
  assert.equal(clampWidth(5000), MAX_COL_WIDTH);
  assert.equal(clampWidth(150.4), 150);
});

test("saved variants survive a round trip and a damaged save never crashes the page", () => {
  const v: Variant = { name: "Make items", hidden: ["lead"], widths: { name: 200 }, sortKey: "name", sortDir: "desc", filters: { type: "SEMI" }, q: "leg" };
  assert.deepEqual(parseVariants(JSON.stringify([v])), [v]);
  assert.deepEqual(parseVariants(null), []);
  assert.deepEqual(parseVariants("not json"), []);
  assert.deepEqual(parseVariants('{"a":1}'), []);
  const messy = parseVariants(JSON.stringify([{ name: "" }, { name: "ok", widths: { a: 99999, b: "x" }, sortDir: "sideways", hidden: ["x", 3] }, null]));
  assert.equal(messy.length, 1);
  assert.deepEqual(messy[0], { name: "ok", hidden: ["x"], widths: { a: MAX_COL_WIDTH }, sortKey: null, sortDir: "asc", filters: {}, q: "" });
});

test("saving a variant under an existing name replaces it; removing works", () => {
  const base: Variant = { name: "A", hidden: [], widths: {}, sortKey: null, sortDir: "asc", filters: {}, q: "" };
  let list = upsertVariant([], base);
  list = upsertVariant(list, { ...base, q: "new" });
  list = upsertVariant(list, { ...base, name: "a ", q: "newer" });
  assert.equal(list.length, 1);
  assert.equal(list[0].q, "newer");
  list = upsertVariant(list, { ...base, name: "B" });
  assert.deepEqual(removeVariant(list, "B").map((v) => v.name), ["a"]);
});
