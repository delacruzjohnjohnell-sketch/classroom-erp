import test from "node:test";
import assert from "node:assert/strict";
import { ROLES, roleLabel, rolesText, toggleRole } from "../src/lib/mfgTeams.ts";

test("every role has a label and a plain explanation, and the keys are unique", () => {
  assert.equal(new Set(ROLES.map((r) => r.key)).size, ROLES.length);
  for (const r of ROLES) { assert.ok(r.label.length > 3); assert.ok(r.does.endsWith(".")); }
  assert.equal(ROLES.length, 8);
});

test("a role key reads as its label, and an unknown key is left alone", () => {
  assert.equal(roleLabel("FINANCE_MANAGER"), "Finance manager");
  assert.equal(roleLabel("WAREHOUSE"), "Warehouse clerk");
  assert.equal(roleLabel("SOMETHING"), "SOMETHING");
});

test("a member's roles read as a sentence, and a member with none is told so", () => {
  assert.equal(rolesText(["ACCOUNTANT", "PURCHASING"]), "Accountant, Purchasing officer");
  assert.match(rolesText([]), /No role yet/);
  assert.match(rolesText(null), /No role yet/);
});

test("ticking a role adds it, ticking it again removes it, and the order stays the same", () => {
  let sel = toggleRole([], "ACCOUNTANT");
  sel = toggleRole(sel, "PURCHASING");
  assert.deepEqual(sel, ["PURCHASING", "ACCOUNTANT"]);
  sel = toggleRole(sel, "PURCHASING");
  assert.deepEqual(sel, ["ACCOUNTANT"]);
});
