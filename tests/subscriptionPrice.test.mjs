import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeVerifiedPaynowStatus, parseMonthlyAmountMinor } from "../functions/src/subscriptionPrice.ts";

test("the approved subscription price is configured as exactly 100 USD cents", () => {
  const environment = readFileSync(new URL("../functions/.env.armament-f5a0b", import.meta.url), "utf8");
  const configuredValue = environment.split(/\r?\n/).find((line) => line.startsWith("ARMAMENT_MONTHLY_AMOUNT_MINOR="))?.split("=", 2)[1];
  assert.equal(parseMonthlyAmountMinor(configuredValue), 100);
});

test("subscription payment amount requires a positive integer number of cents", () => {
  assert.equal(parseMonthlyAmountMinor("1250"), 1250);
  assert.equal(parseMonthlyAmountMinor(undefined), null);
  assert.equal(parseMonthlyAmountMinor(""), null);
  assert.equal(parseMonthlyAmountMinor("0"), null);
  assert.equal(parseMonthlyAmountMinor("-10"), null);
  assert.equal(parseMonthlyAmountMinor("12.5"), null);
  assert.equal(parseMonthlyAmountMinor("9007199254740992"), null);
});

test("verified Paynow payment statuses preserve paid, terminal and pending states", () => {
  assert.equal(normalizeVerifiedPaynowStatus("Paid"), "paid");
  assert.equal(normalizeVerifiedPaynowStatus("Cancelled"), "cancelled");
  assert.equal(normalizeVerifiedPaynowStatus("Created"), "pending");
});
