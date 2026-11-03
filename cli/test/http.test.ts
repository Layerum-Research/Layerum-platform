import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeErrorMessage } from "../src/api/http";

test("string message", () => {
  assert.equal(normalizeErrorMessage({ message: "Nope" }, 400), "Nope");
});

test("array message is joined", () => {
  assert.equal(normalizeErrorMessage({ message: ["a must be set", { b: 1 }] }, 400), 'a must be set, {"b":1}');
});

test("nested message", () => {
  assert.equal(normalizeErrorMessage({ message: { message: "Deep" } }, 403), "Deep");
});

test("fallback when the payload has no usable message", () => {
  assert.equal(normalizeErrorMessage(null, 502), "Request failed (502)");
  assert.equal(normalizeErrorMessage({ message: 5 }, 500), "Request failed (500)");
});
