import test from "node:test";
import assert from "node:assert/strict";
import { sharedCustomerId, sharedLedgerId } from "../src/contracts/armament.ts";

test("ledger identity is stable for retries and scoped to source app, business, account, and record", () => {
  const event = { sourceApp: "murimi", ownerId: "owner-1", businessId: "farm-1", accountId: "farm-1", sourceCollection: "transactions", sourceDocumentId: "sale_1" };
  assert.equal(sharedLedgerId(event), sharedLedgerId({ ...event }));
  assert.notEqual(sharedLedgerId(event), sharedLedgerId({ ...event, sourceDocumentId: "sale_2" }));
  assert.notEqual(sharedLedgerId(event), sharedLedgerId({ ...event, sourceApp: "tengesa" }));
});

test("customer identity is stable and isolated per originating business", () => {
  const customer = { sourceApp: "murimi", ownerId: "owner-1", businessId: "farm-1", sourceCollection: "customers", sourceDocumentId: "customer-1" };
  assert.equal(sharedCustomerId(customer), sharedCustomerId({ ...customer }));
  assert.notEqual(sharedCustomerId(customer), sharedCustomerId({ ...customer, businessId: "farm-2" }));
});
