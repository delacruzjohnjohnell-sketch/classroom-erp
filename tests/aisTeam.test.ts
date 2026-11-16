import test from "node:test";
import assert from "node:assert/strict";
import { nextTeamName, teamSummary, toMembers, type Picks } from "../src/lib/aisTeam.ts";

const P = (a: boolean, u: boolean) => ({ ACCOUNTING: a, AUDIT: u });

test("only students with at least one role ticked become members, with the roles ticked", () => {
  const picks: Picks = { a: P(true, false), b: P(false, true), c: P(true, true), d: P(false, false) };
  assert.deepEqual(toMembers(picks), [
    { user: "a", seats: ["ACCOUNTING"] },
    { user: "b", seats: ["AUDIT"] },
    { user: "c", seats: ["ACCOUNTING", "AUDIT"] },
  ]);
  assert.deepEqual(toMembers({}), []);
});

test("the summary counts members and roles and warns about a missing seat or a student holding both", () => {
  const pair = teamSummary({ a: P(true, false), b: P(false, true) });
  assert.deepEqual([pair.members, pair.accounting, pair.audit, pair.both, pair.notes.length], [2, 1, 1, 0, 0]);
  assert.ok(teamSummary({ a: P(true, false) }).notes.some((n) => n.includes("Audit seat")));
  assert.ok(teamSummary({ a: P(false, true) }).notes.some((n) => n.includes("Accounting seat")));
  assert.ok(teamSummary({ a: P(true, true) }).notes.some((n) => n.includes("solo")));
  assert.equal(teamSummary({}).notes.length, 0);
});

test("the next team name continues the numbering", () => {
  assert.equal(nextTeamName([]), "Team 1");
  assert.equal(nextTeamName(["Team 1", "Team 2", "Team 3"]), "Team 4");
  assert.equal(nextTeamName(["Team 2", "Sinag Practice"]), "Team 3");
  assert.equal(nextTeamName(["Alpha", "Beta"]), "Team 3");
});
