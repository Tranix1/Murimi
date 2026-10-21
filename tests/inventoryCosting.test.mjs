import assert from "node:assert/strict";
import test from "node:test";
import { calculateBatchAllocatedStock, calculateInventoryBalances } from "../src/Utilities/inventoryCalculations.ts";
import { calculateBatchSummary } from "../src/Utilities/farmCalculations.ts";

const item = { id: "feed", ownerId: "u", accountId: "a", name: "Broiler starter", category: "feed", baseUnit: "kg", active: true, defaultFinancialClassification: "consumable", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
const purchase = (id, quantity, totalCost, date = "2026-01-01") => ({ id, ownerId: "u", accountId: "a", inventoryItemId: "feed", itemName: "Broiler starter", category: "feed", financialClassification: "consumable", inventoryTracked: true, receiptStatus: "received", quantity, unit: "kg", totalCost, date, allocations: [], createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z` });
const movement = (id, type, quantity, totalCost, extra = {}) => ({ id, ownerId: "u", accountId: "a", itemId: "feed", date: "2026-01-01", type, quantity, unit: "kg", totalCost, financialClassification: "consumable", createdAt: "2026-01-01T01:00:00.000Z", updatedAt: "2026-01-01T01:00:00.000Z", ...extra });

test("legacy received purchase recovers quantity and value when its receipt movement is missing", () => {
  const result = calculateInventoryBalances([item], [purchase("p1", 10, 7)], []);
  assert.equal(result.totalValue, 7);
  assert.equal(result.valuationReliable, true);
  assert.equal(result.balances[0].purchasedQuantity, 10);
  assert.equal(result.balances[0].averageUnitCost, 0.7);
  assert.equal(result.balances[0].available, 10);
});

test("weighted average cost and partial batch allocation reconcile remaining inventory", () => {
  const purchases = [purchase("p1", 10, 7), purchase("p2", 6, 6, "2026-01-02")];
  const movements = [movement("r1", "received", 10, 7, { purchaseId: "p1", source: "purchase" }), movement("r2", "received", 6, 6, { purchaseId: "p2", date: "2026-01-02", createdAt: "2026-01-02T00:00:00.000Z" })];
  const before = calculateInventoryBalances([item], purchases, movements).balances[0];
  assert.equal(before.averageUnitCost, 13 / 16);
  const allocatedCost = Math.round(before.averageUnitCost * 4 * 100) / 100;
  const allocated = movement("a1", "allocated", 4, allocatedCost, { batchId: "b1", unitCost: before.averageUnitCost });
  const after = calculateInventoryBalances([item], purchases, [...movements, allocated]).balances[0];
  assert.equal(allocatedCost, 3.25);
  assert.equal(after.available, 12);
  assert.equal(after.value, 9.75);
  assert.equal(after.allocated, 4);
  assert.equal(after.allocatedValue, 3.25);
  assert.equal(after.onHandValue, 13);
});

test("sample allocation transfers $2.80 to batch and leaves six kilograms worth $4.20", () => {
  const purchases = [purchase("p1", 10, 7)];
  const received = movement("r1", "received", 10, 7, { purchaseId: "p1", source: "purchase" });
  const issued = movement("a1", "allocated", 4, 2.8, { batchId: "b1", unitCost: 0.7 });
  const result = calculateInventoryBalances([item], purchases, [received, issued]).balances[0];
  const batch = calculateBatchAllocatedStock("feed", "b1", purchases, [received, issued]);
  assert.ok(Math.abs(result.averageUnitCost - 0.7) < 1e-10);
  assert.equal(result.available, 6);
  assert.equal(result.value, 4.2);
  assert.equal(result.allocatedValue, 2.8);
  assert.equal(batch.quantity, 4);
  assert.equal(batch.value, 2.8);
});

test("batch costs count stock once at issue, while later usage reduces batch stock without duplicating cost", () => {
  const purchases = [{ ...purchase("p1", 10, 7), allocations: [{ batchId: "b1", quantity: 4, cost: 2.8, allocatedAt: "2026-01-01T01:00:00.000Z" }] }];
  const issued = movement("a1", "allocated", 4, 2.8, { batchId: "b1", purchaseId: "p1", unitCost: 0.7 });
  const consumed = movement("c1", "consumed", 2, 1.4, { batchId: "b1", unitCost: 0.7 });
  const summary = calculateBatchSummary({ id: "b1", name: "Batch 1", initialQuantity: 0, transportCost: 0, setupCost: 0 }, [], [], [], [], [], purchases, [issued, consumed]);
  const stock = calculateBatchAllocatedStock("feed", "b1", purchases, [issued, consumed]);
  assert.equal(summary.costsIncurred, 2.8);
  assert.equal(stock.quantity, 2);
  assert.equal(stock.value, 1.4);
  assert.equal(stock.consumedValue, 1.4);
});

test("cost stays unavailable when a received stock quantity has no saved cost", () => {
  const unpriced = { ...purchase("p1", 10, 0), totalCost: undefined };
  const result = calculateInventoryBalances([item], [unpriced], []).balances[0];
  assert.equal(result.available, 10);
  assert.equal(result.value, null);
  assert.equal(result.averageUnitCost, null);
});

test("returned batch stock restores its weighted value to available inventory", () => {
  const purchases = [purchase("p1", 10, 7)];
  const received = movement("r1", "received", 10, 7, { purchaseId: "p1", source: "purchase" });
  const issued = movement("a1", "allocated", 4, 2.8, { batchId: "b1", unitCost: 0.7 });
  const returned = movement("ret1", "returned", 1, 0.7, { batchId: "b1", unitCost: 0.7 });
  const balance = calculateInventoryBalances([item], purchases, [received, issued, returned]).balances[0];
  assert.equal(balance.available, 7);
  assert.equal(balance.value, 4.9);
  assert.equal(balance.allocated, 3);
  assert.ok(Math.abs(balance.allocatedValue - 2.1) < 1e-10);
  assert.equal(balance.returnedValue, 0.7);
  assert.ok(Math.abs(balance.onHandValue - 7) < 1e-10);
});
