import test from "node:test";
import assert from "node:assert/strict";
import { SEATS, seatLabel, seatsText, toggleSeat, seatAccess } from "../src/lib/aisSeats.ts";

test("there are exactly two seats, Accounting and Audit", () => {
  assert.deepEqual(SEATS.map((s) => s.key), ["ACCOUNTING", "AUDIT"]);
  for (const s of SEATS) assert.ok(s.does.length > 20, `${s.key} explains what it does`);
});

test("seat labels and the readable list", () => {
  assert.equal(seatLabel("ACCOUNTING"), "Accounting");
  assert.equal(seatLabel("AUDIT"), "Audit");
  assert.equal(seatLabel("SOMETHING"), "SOMETHING");
  assert.equal(seatsText(["ACCOUNTING", "AUDIT"]), "Accounting + Audit");
  assert.equal(seatsText(["AUDIT"]), "Audit");
  assert.equal(seatsText([]), "No seat yet (can only look)");
  assert.equal(seatsText(null), "No seat yet (can only look)");
});

test("toggling a seat keeps the defined order and never duplicates", () => {
  assert.deepEqual(toggleSeat([], "AUDIT"), ["AUDIT"]);
  assert.deepEqual(toggleSeat(["AUDIT"], "ACCOUNTING"), ["ACCOUNTING", "AUDIT"]);
  assert.deepEqual(toggleSeat(["ACCOUNTING", "AUDIT"], "ACCOUNTING"), ["AUDIT"]);
  assert.deepEqual(toggleSeat(toggleSeat([], "AUDIT"), "AUDIT"), []);
});

test("what a member may do follows from the seats they hold", () => {
  assert.deepEqual(seatAccess(["ACCOUNTING"]), { canAccount: true, canAudit: false, lookOnly: false });
  assert.deepEqual(seatAccess(["AUDIT"]), { canAccount: false, canAudit: true, lookOnly: false });
  assert.deepEqual(seatAccess(["ACCOUNTING", "AUDIT"]), { canAccount: true, canAudit: true, lookOnly: false });
  assert.deepEqual(seatAccess([]), { canAccount: false, canAudit: false, lookOnly: true });
  assert.deepEqual(seatAccess(undefined), { canAccount: false, canAudit: false, lookOnly: true });
});
