import test from "node:test";
import assert from "node:assert/strict";
import { ELEMENT_LABEL, ELEMENT_ORDER, elementTotals, money, percentOf, revaluationEntry, sentenceFor, unitMoney } from "../src/lib/costing.ts";

test("the cost structure adds up per element, in the usual order, leaving out empty ones", () => {
  const lines = [
    { element: "LABOR", amount: "120" }, { element: "MATERIAL", amount: 180 }, { element: "MATERIAL", amount: "8" },
    { element: "MATERIAL", amount: 50 }, { element: "MACHINE", amount: 50 }, { element: "FIX_OH", amount: 60 }, { element: "VAR_OH", amount: 0 },
  ];
  const t = elementTotals(lines);
  assert.deepEqual(t.map((x) => [x.element, x.amount]), [["MATERIAL", 238], ["LABOR", 120], ["MACHINE", 50], ["FIX_OH", 60]]);
  assert.equal(t.reduce((s, x) => s + x.amount, 0), 468);   // the Dining Chair
  assert.deepEqual(elementTotals([]), []);
  assert.equal(ELEMENT_ORDER.every((e) => ELEMENT_LABEL[e]), true);
});

test("percentages of a whole are rounded to one decimal and safe on zero", () => {
  assert.equal(percentOf(238, 468), 50.9);
  assert.equal(percentOf(60, 468), 12.8);
  assert.equal(percentOf(5, 0), 0);
});

test("pesos show centavos, and unit costs keep their precision", () => {
  assert.equal(money(46800), "₱46,800.00");
  assert.equal(money(null), "₱0.00");
  assert.equal(unitMoney(468), "₱468.00");
  assert.equal(unitMoney(505.306122), "₱505.306122");
  assert.equal(unitMoney("63.333333"), "₱63.333333");
});

test("the previewed revaluation entry matches what the database posts (lumber 400 × ₱2, chairs 10 × ₱6)", () => {
  const e = revaluationEntry([
    { item_name: "Lumber", value_change: "800.00", account_key: "RM_INVENTORY" },
    { item_name: "Dining chair", value_change: 60, account_key: "FG_INVENTORY" },
    { item_name: "Screw", value_change: 0, account_key: "RM_INVENTORY" },
    { item_name: "Service", value_change: 99, account_key: null },
  ]);
  assert.deepEqual(e.map((l) => [l.account_key, l.debit, l.credit]), [["FG_INVENTORY", 60, 0], ["RM_INVENTORY", 800, 0], ["REVALUATION", 0, 860]]);
  assert.equal(e.reduce((s, l) => s + l.debit, 0), e.reduce((s, l) => s + l.credit, 0));   // balanced
});

test("a fall in value credits the stock account and debits the revaluation account; offsetting changes balance", () => {
  const down = revaluationEntry([{ item_name: "Lumber", value_change: -300, account_key: "RM_INVENTORY" }]);
  assert.deepEqual(down.map((l) => [l.account_key, l.debit, l.credit]), [["RM_INVENTORY", 0, 300], ["REVALUATION", 300, 0]]);
  const mixed = revaluationEntry([
    { item_name: "Lumber", value_change: 100, account_key: "RM_INVENTORY" },
    { item_name: "Chair", value_change: -40, account_key: "FG_INVENTORY" },
  ]);
  assert.deepEqual(mixed.map((l) => [l.account_key, l.debit, l.credit]), [["FG_INVENTORY", 0, 40], ["RM_INVENTORY", 100, 0], ["REVALUATION", 0, 60]]);
  assert.equal(mixed.reduce((s, l) => s + l.debit, 0), mixed.reduce((s, l) => s + l.credit, 0));
});

test("no stock on hand means no entry at all", () => {
  assert.deepEqual(revaluationEntry([]), []);
  assert.deepEqual(revaluationEntry([{ item_name: "Lumber", value_change: 0, account_key: "RM_INVENTORY" }]), []);
});

test("every entry line gets a plain sentence", () => {
  const [fg, rm, reval] = revaluationEntry([
    { item_name: "Lumber", value_change: 800, account_key: "RM_INVENTORY" },
    { item_name: "Dining chair", value_change: 60, account_key: "FG_INVENTORY" },
  ]);
  assert.equal(sentenceFor(rm, "Raw Materials Inventory"), "Raw Materials Inventory goes up by ₱800.00 because Lumber on hand is now valued higher.");
  assert.equal(sentenceFor(fg, "Finished Goods Inventory"), "Finished Goods Inventory goes up by ₱60.00 because Dining chair on hand is now valued higher.");
  assert.equal(sentenceFor(reval, "Inventory Revaluation"), "₱860.00 is credited to Inventory Revaluation — a gain, because the stock you hold is now worth more.");
  const [stock, loss] = revaluationEntry([{ item_name: "Lumber", value_change: -50, account_key: "RM_INVENTORY" }]);
  assert.equal(sentenceFor(stock, "Raw Materials Inventory"), "Raw Materials Inventory goes down by ₱50.00 because Lumber on hand is now valued lower.");
  assert.equal(sentenceFor(loss, "Inventory Revaluation"), "₱50.00 is debited to Inventory Revaluation — a loss, because the stock you hold is now worth less.");
});
