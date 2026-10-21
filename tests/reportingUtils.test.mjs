import assert from "node:assert/strict";
import test from "node:test";
import "./inventoryCosting.test.mjs";
import * as XLSX from "xlsx";
import { buildCategoryCsvFiles, filterReportRecords, recordsToCsv, selectReportCategories } from "../src/services/reportingUtils.ts";
import { createXlsxWorkbook } from "../src/services/spreadsheetExport.ts";
import { calculateFinanceSummary, calculateMortalityAnalytics } from "../src/Utilities/farmCalculations.ts";
import { calculateInventoryBalances } from "../src/Utilities/inventoryCalculations.ts";

test("category selection supports all, one, and multiple collections", () => {
    const all = ["batches", "sales", "expenses"];
    assert.deepEqual(selectReportCategories(all, new Set(all)), all);
    assert.deepEqual(selectReportCategories(all, new Set(["sales"])), ["sales"]);
    assert.deepEqual(selectReportCategories(all, new Set(["sales", "expenses"])), ["sales", "expenses"]);
});

test("date and batch filters include matching rows and retain historical batches", () => {
    const records = [
        { id: "open", batchId: "b1", date: "2026-02-01", deaths: 2 },
        { id: "outside", batchId: "b1", date: "2025-12-31", deaths: 4 },
        { id: "other", batchId: "b2", date: "2026-02-03", deaths: 1 },
    ];
    assert.deepEqual(filterReportRecords("dailyRecords", records, { fromDate: "2026-01-01", toDate: "2026-02-28", batchId: "b1" }).map((row) => row.id), ["open"]);
    assert.deepEqual(filterReportRecords("batches", [{ id: "closed", dateStarted: "2020-01-01", status: "completed" }], { batchId: "closed" }).map((row) => row.id), ["closed"]);
});

test("batch filters trace stock allocations and linked financial transactions", () => {
    const purchase = { id: "p1", allocations: [{ batchId: "b1", cost: 20 }] };
    const txn = { id: "t1", sourceId: "p1", date: "2026-03-01" };
    const ids = new Set([purchase.id]);
    assert.equal(filterReportRecords("purchases", [purchase], { batchId: "b1" }).length, 1);
    assert.equal(filterReportRecords("transactions", [txn], { batchId: "b1", relatedBatchRecordIds: ids }).length, 1);
});

test("transaction category, payment method, and date filters are applied", () => {
    const records = [
        { id: "cash", category: "feed", paymentMethodId: "pm1", date: "2026-02-01" },
        { id: "medicine", category: "medicine", paymentMethodId: "pm2", date: "2026-02-02" },
    ];
    assert.deepEqual(filterReportRecords("transactions", records, { category: "feed", paymentMethodId: "pm1", fromDate: "2026-02-01", toDate: "2026-02-01" }).map((row) => row.id), ["cash"]);
});

test("CSV preserves numeric cells, quotes nested data, and neutralizes formulas", () => {
    const csv = recordsToCsv([{ id: "x1", amount: 12.5, name: "=HYPERLINK(1)", notes: "a, \"b\"", details: { batchId: "b1" } }]);
    assert.match(csv, /^\uFEFFRecord ID,/);
    assert.match(csv, /12\.5/);
    assert.match(csv, /'=HYPERLINK\(1\)/);
    assert.match(csv, /"a, ""b"""/);
    assert.match(csv, /Details › Batch ID/);
    assert.match(recordsToCsv([]), /Record ID,Created At,Updated At/);
});

test("financial summary separates cash, revenue, expenses, and inventory purchases", () => {
    const summary = calculateFinanceSummary({
        transactions: [{ direction: "outflow", amount: 40 }],
        sales: [{ totalValue: 100, outstanding: 25 }],
        expenses: [{ amount: 10, amountPaid: 10 }],
        purchases: [{ totalCost: 40, outstanding: 0, financialClassification: "consumable", inventoryTracked: true }],
        stockMovements: [],
        assets: [{ estimatedValue: 200 }],
        inventoryValue: 35,
    });
    assert.equal(summary.availableCash, -40);
    assert.equal(summary.revenue, 100);
    assert.equal(summary.expenses, 10);
    assert.equal(summary.receivables, 25);
    assert.equal(summary.inventoryValue, 35);
    assert.equal(summary.fixedAssets, 200);
});

test("mortality totals and rates derive from recorded event counts", () => {
    const summary = calculateMortalityAnalytics([{ quantity: 3, causeCode: "unknown", birdAgeDays: 8, date: "2026-01-02" }], 60);
    assert.equal(summary.total, 3);
    assert.equal(summary.mortalityPercent, 5);
    assert.equal(calculateMortalityAnalytics([], undefined).mortalityPercent, null);
});

test("single-category and empty data exports have explicit counts and headers", () => {
    const labels = { sales: "Sales and revenue", mortalityRecords: "Mortality records and causes" };
    const output = buildCategoryCsvFiles({ sales: [{ id: "sale1", date: "2026-03-01", totalValue: 25 }] }, {}, new Set(["sales"]), ["sales", "mortalityRecords"], labels, {});
    assert.equal(output.counts.sales, 1);
    assert.equal(output.totalRecords, 1);
    assert.ok(output.files.some((file) => file.fileName === "sales_and_revenue.csv" && file.content.includes("sale1")));
    const empty = buildCategoryCsvFiles({}, {}, new Set(["mortalityRecords"]), ["sales", "mortalityRecords"], labels, {});
    assert.equal(empty.counts.mortalityRecords, 0);
    assert.ok(empty.files.find((file) => file.fileName === "mortality_records_and_causes.csv")?.content.includes("Record ID,Created At,Updated At"));
});

test("export includes closed and historical records without requiring active status", () => {
    const record = { id: "past", name: "Old flock", batchNumber: "4", dateStarted: "2021-01-01", status: "completed", historical: true };
    const output = buildCategoryCsvFiles({ batches: [record] }, {}, new Set(["batches"]), ["batches"], { batches: "Batch register and batch history" }, {});
    assert.equal(output.counts.batches, 1);
    assert.ok(output.files.find((file) => file.fileName === "batch_register_and_batch_history.csv")?.content.includes("Old flock"));
});

test("inventory keeps physical balance separate from valued consumable stock", () => {
    const result = calculateInventoryBalances(
        [{ id: "feed", name: "Feed", inventoryTracked: true, defaultFinancialClassification: "consumable", active: true }],
        [{ id: "purchase1", inventoryItemId: "feed", totalCost: 60, receiptStatus: "received", inventoryTracked: true, financialClassification: "consumable", allocations: [] }],
        [
            { id: "received", itemId: "feed", type: "received", quantity: 10, unit: "bags", totalCost: 60, financialClassification: "consumable" },
            { id: "used", itemId: "feed", type: "consumed", quantity: 4, unit: "bags", totalCost: 24, financialClassification: "consumable" },
        ],
    );
    assert.equal(result.balances[0].onHand, 6);
    assert.equal(result.balances[0].value, 36);
    assert.equal(result.totalValue, 36);
    assert.equal(result.valuationReliable, true);
});

test("XLSX export creates separate sheets with numeric amounts and usable date cells", () => {
    const bytes = createXlsxWorkbook([
        { name: "Sales and revenue", rows: [{ id: "sale1", date: "2026-03-01", totalValue: 25.5 }] },
        { name: "Export metadata", rows: [{ field: "Exported at", value: "2026-03-02T10:30:00.000Z" }] },
    ]);
    const workbook = XLSX.read(bytes, { type: "buffer", cellNF: true });
    assert.deepEqual(workbook.SheetNames, ["Sales and revenue", "Export metadata"]);
    const sales = workbook.Sheets["Sales and revenue"];
    assert.match(sales.A1.v, /MURIMI FARM RECORDS/);
    assert.match(sales.A2.v, /Trace code: MRM-UNASSIGNED/);
    assert.equal(sales.B5.v, 46082);
    assert.equal(sales.B5.t, "n");
    assert.equal(sales.C5.v, 25.5);
    assert.equal(sales.C5.t, "n");
    assert.equal(sales.B5.z, "yyyy-mm-dd");
    assert.equal(workbook.Sheets["Export metadata"].B5.t, "n");
    assert.equal(workbook.Sheets["Export metadata"].B5.z, "yyyy-mm-dd hh:mm");
});
