import test from "node:test";
import assert from "node:assert/strict";
import { firstQueryError } from "../src/lib/firstError.ts";

test("no error when every query succeeded", () => {
  assert.equal(firstQueryError({ error: null }, { error: undefined }, null, undefined), null);
  assert.equal(firstQueryError(), null);
});

test("the first failed query decides the message", () => {
  assert.equal(firstQueryError({ error: null }, { error: { message: "column x does not exist" } }, { error: { message: "later" } }), "column x does not exist");
});

test("an empty message is not treated as an error", () => {
  assert.equal(firstQueryError({ error: { message: "" } }), null);
});
