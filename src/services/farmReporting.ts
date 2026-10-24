import { calculateBatchSummary, calculateFinanceSummary } from "@/Utilities/farmCalculations";
import { calculateInventoryBalances } from "@/Utilities/inventoryCalculations";
import { getLocalFarmRecords } from "@/services/farmLocalDatabase";
import { FARM_COLLECTIONS, type FarmCollection } from "@/services/farmRepository";
import { buildCategoryCsvFiles, filterReportRecords, flattenReportRecord, getReportRecordDate, recordsToCsv, type ReportFilters } from "@/services/reportingUtils";
import { createXlsxWorkbook, type SpreadsheetBranding, type SpreadsheetSheetData } from "@/services/spreadsheetExport";
import type { Batch, DailyRecord, Expense, FarmAsset, FinancialTransaction, InventoryItem, MortalityRecord, Purchase, Sale, SlaughterRecord, StockMovement, WeightMeasurement } from "@/types/farm";
import JSZip from "jszip";

export type FarmReportDataset = Partial<Record<FarmCollection, Record<string, unknown>[]>>;
export type ReportLoadResult = { data: FarmReportDataset; failures: Partial<Record<FarmCollection, string>> };

export const REPORT_CATEGORY_LABELS: Record<FarmCollection, string> = {
    batches: "Batch register and history", dailyRecords: "Daily farm records", mortalityRecords: "Mortality records and causes",
    batchProblems: "Farm incidents", weights: "Batch weights", expenses: "Operating expenses", purchases: "Purchases",
    sales: "Sales and revenue", slaughter: "Slaughter records", assets: "Fixed assets", plans: "Farm plans", planCategories: "Plan categories",
    transactions: "Cash movements", stock: "Inventory items", stockMovements: "Stock movements and consumption",
    payments: "Customer payments", treatments: "Treatments", customerCategories: "Customer categories",
    customers: "Customers", paymentMethods: "Payment methods", purchaseCategories: "Purchase categories", purchaseMeasures: "Purchase measures", suppliers: "Suppliers", saleProductTypes: "Sale product types",
};

export const FINANCIAL_COLLECTIONS = new Set<FarmCollection>([
    "purchases", "expenses", "sales", "payments", "transactions", "stock", "stockMovements", "assets", "batches",
]);

const rows = <T extends Record<string, unknown>>(data: FarmReportDataset, collection: FarmCollection) => (data[collection] ?? []) as T[];
const sum = (values: number[]) => values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const isClosed = (batch: Batch) => batch.status === "completed" || batch.status === "archived";

export async function loadFarmReportDataset(uid: string, accountId: string): Promise<ReportLoadResult> {
    const data: FarmReportDataset = {};
    const failures: Partial<Record<FarmCollection, string>> = {};
    await Promise.all(FARM_COLLECTIONS.map(async (collection) => {
        try {
            data[collection] = await getLocalFarmRecords<Record<string, unknown>>(uid, accountId, collection);
        } catch (error) {
            failures[collection] = error instanceof Error ? error.message : "Could not read this category from local storage.";
        }
    }));
    return { data, failures };
}

function relatedRecordIds(data: FarmReportDataset, batchId?: string): Set<string> | undefined {
    if (!batchId) return undefined;
    const ids = new Set<string>();
    for (const collection of FARM_COLLECTIONS) {
        for (const record of filterReportRecords(collection, data[collection] ?? [], { batchId })) {
            if (typeof record.id === "string") ids.add(record.id);
            if (typeof record.saleId === "string") ids.add(record.saleId);
            if (typeof record.purchaseId === "string") ids.add(record.purchaseId);
        }
    }
    return ids;
}

export function filterFarmReportDataset(data: FarmReportDataset, filters: ReportFilters): FarmReportDataset {
    const relatedBatchRecordIds = relatedRecordIds(data, filters.batchId);
    const contextualFilters = { ...filters, relatedBatchRecordIds };
    return Object.fromEntries(FARM_COLLECTIONS.map((collection) => [
        collection,
        filterReportRecords(collection, data[collection] ?? [], contextualFilters),
    ])) as FarmReportDataset;
}

function groupValues<T>(records: T[], key: (record: T) => string, amount: (record: T) => number) {
    const grouped = new Map<string, number>();
    for (const record of records) grouped.set(key(record), round((grouped.get(key(record)) ?? 0) + amount(record)));
    return [...grouped].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function financeSnapshot(data: FarmReportDataset) {
    const inventoryItems = rows<InventoryItem>(data, "stock");
    const purchases = rows<Purchase>(data, "purchases");
    const movements = rows<StockMovement>(data, "stockMovements");
    const inventory = calculateInventoryBalances(inventoryItems, purchases, movements);
    const finance = calculateFinanceSummary({
        transactions: rows<FinancialTransaction>(data, "transactions"), sales: rows<Sale>(data, "sales"),
        expenses: rows<Expense>(data, "expenses"), purchases, assets: rows<FarmAsset>(data, "assets"),
        stockMovements: movements, inventoryValue: inventory.totalValue,
    });
    return { inventory, finance };
}

export function calculateFarmReportAnalytics(data: FarmReportDataset, filters: ReportFilters = {}) {
    const periodData = filterFarmReportDataset(data, filters);
    const batches = rows<Batch>(data, "batches").filter((batch) => !filters.batchId || batch.id === filters.batchId);
    const allDaily = rows<DailyRecord>(data, "dailyRecords");
    const allExpenses = rows<Expense>(data, "expenses");
    const allSales = rows<Sale>(data, "sales");
    const allWeights = rows<WeightMeasurement>(data, "weights");
    const allSlaughter = rows<SlaughterRecord>(data, "slaughter");
    const allPurchases = rows<Purchase>(data, "purchases");
    const allMovements = rows<StockMovement>(data, "stockMovements");
    const allMortality = rows<MortalityRecord>(data, "mortalityRecords");
    const periodBatches = rows<Batch>(periodData, "batches");
    const periodDaily = rows<DailyRecord>(periodData, "dailyRecords");
    const periodSales = rows<Sale>(periodData, "sales");
    const periodExpenses = rows<Expense>(periodData, "expenses");
    const periodPurchases = rows<Purchase>(periodData, "purchases");
    const periodTransactions = rows<FinancialTransaction>(periodData, "transactions");
    const periodMovements = rows<StockMovement>(periodData, "stockMovements");
    const snapshot = financeSnapshot(data);
    const batchPerformance = batches.map((batch) => ({
        batch,
        summary: calculateBatchSummary(
            batch,
            allDaily.filter((record) => record.batchId === batch.id),
            allExpenses.filter((record) => record.batchId === batch.id),
            allSales.filter((record) => record.batchId === batch.id),
            allWeights.filter((record) => record.batchId === batch.id),
            allSlaughter.filter((record) => record.batchId === batch.id),
            allPurchases,
            allMovements,
        ),
    }));
    const activeBatchPerformance = batchPerformance.filter(({ batch }) => !isClosed(batch));
    const historicalDeaths = !filters.fromDate && !filters.toDate
        ? sum(batches.filter((batch) => batch.historical).map((batch) => batch.historicalData?.totalDeaths ?? 0))
        : 0;
    const dailyDeaths = sum(periodDaily.map((record) => record.deaths));
    const placedBatches = periodBatches.filter((batch) => !batch.historical || !batch.historicalData?.unknownFields?.includes("initialQuantity"));
    const birdsPlaced = sum(placedBatches.map((batch) => batch.initialQuantity));
    const mortalityTotal = dailyDeaths + historicalDeaths;
    const mortalityBatchIds = new Set(periodDaily.filter((record) => record.deaths > 0).map((record) => record.batchId));
    const initialQuantityForRate = sum(batches.filter((batch) => mortalityBatchIds.has(batch.id) && (!batch.historical || !batch.historicalData?.unknownFields?.includes("initialQuantity"))).map((batch) => batch.initialQuantity));
    const mortalityPercent = initialQuantityForRate > 0 ? (mortalityTotal / initialQuantityForRate) * 100 : null;
    const revenueByBatch = groupValues(periodSales, (sale) => {
        const batch = batches.find((item) => item.id === sale.batchId);
        return batch ? `${batch.batchNumber ?? batch.name}` : sale.batchId;
    }, (sale) => sale.totalValue);
    const expensesByCategory = groupValues(periodExpenses, (expense) => expense.category, (expense) => expense.amount);
    const purchasesByCategory = groupValues(periodPurchases, (purchase) => purchase.categoryNameSnapshot ?? purchase.category, (purchase) => purchase.totalCost);
    const purchaseMonthMap = new Map<string, number>();
    for (const purchase of periodPurchases) { const month = purchase.date?.slice(0, 7); if (month) purchaseMonthMap.set(month, (purchaseMonthMap.get(month) ?? 0) + purchase.totalCost); }
    const purchasesByMonth = [...purchaseMonthMap].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([label, value]) => ({ label, value: round(value) }));
    const customerMap = new Map<string, { id: string; label: string; purchased: number; paid: number; outstanding: number; badDebt: number; salesCount: number; lastDate: string }>();
    for (const sale of periodSales) {
        const key = sale.customerId || sale.customerNameSnapshot || sale.customer || "walk_in";
        const row = customerMap.get(key) ?? { id: key, label: sale.customerNameSnapshot || sale.customer || "Walk-in customer", purchased: 0, paid: 0, outstanding: 0, badDebt: 0, salesCount: 0, lastDate: "" };
        row.purchased += sale.totalValue; row.paid += sale.paymentReceived; row.outstanding += sale.outstanding; row.badDebt += sale.badDebtAmount ?? 0; row.salesCount += 1; row.lastDate = sale.date > row.lastDate ? sale.date : row.lastDate; customerMap.set(key, row);
    }
    const customerPerformance = [...customerMap.values()].map((row) => ({ ...row, collectionRate: row.purchased > 0 ? row.paid / row.purchased * 100 : null })).sort((a, b) => b.paid - a.paid);
    const supplierMap = new Map<string, { id: string; label: string; purchased: number; paid: number; outstanding: number; count: number; lastDate: string }>();
    for (const purchase of periodPurchases) {
        const key = purchase.supplierId || purchase.supplier || "unspecified";
        const row = supplierMap.get(key) ?? { id: key, label: purchase.supplier || "Supplier not recorded", purchased: 0, paid: 0, outstanding: 0, count: 0, lastDate: "" };
        row.purchased += purchase.totalCost; row.paid += purchase.amountPaid ?? (purchase.fullyPaid ? purchase.totalCost : 0); row.outstanding += purchase.outstanding ?? Math.max(0, purchase.totalCost - (purchase.amountPaid ?? 0)); row.count += 1; row.lastDate = purchase.date > row.lastDate ? purchase.date : row.lastDate; supplierMap.set(key, row);
    }
    const supplierPerformance = [...supplierMap.values()].sort((a, b) => b.paid - a.paid);
    const cycleDurations = batches.flatMap((batch) => {
        if (batch.status !== "completed") return [];
        const finishDate = batch.closedAt ?? batch.historicalData?.actualCompletionDate;
        if (!finishDate || !/^\d{4}-\d{2}-\d{2}$/.test(finishDate) || !/^\d{4}-\d{2}-\d{2}$/.test(batch.dateStarted) || (filters.fromDate && finishDate < filters.fromDate) || (filters.toDate && finishDate > filters.toDate)) return [];
        const days = Math.max(0, Math.floor((new Date(`${finishDate}T00:00:00`).getTime() - new Date(`${batch.dateStarted}T00:00:00`).getTime()) / 86400000));
        if (!Number.isFinite(days)) return [];
        return [{ label: batch.batchNumber ?? batch.name, value: days }];
    });
    const mortalityEvents = filterReportRecords("mortalityRecords", allMortality, {
        fromDate: filters.fromDate, toDate: filters.toDate, batchId: filters.batchId, relatedBatchRecordIds: relatedRecordIds(data, filters.batchId),
    });
    const linkedMortalityIds = new Set(mortalityEvents.map((record) => record.id));
    const legacyCauses = periodDaily.flatMap((record) => record.deathCauses.filter((cause) => !cause.mortalityRecordId || !linkedMortalityIds.has(cause.mortalityRecordId)).map((cause) => ({ label: cause.cause, quantity: cause.quantity })));
    const mortalityByCause = new Map<string, number>();
    for (const event of mortalityEvents) {
        const label = event.customCause ?? event.causeLabel ?? event.causeCode;
        mortalityByCause.set(label, (mortalityByCause.get(label) ?? 0) + event.quantity);
    }
    for (const cause of legacyCauses) mortalityByCause.set(cause.label, (mortalityByCause.get(cause.label) ?? 0) + cause.quantity);
    const cashByMonth = new Map<string, { inflow: number; outflow: number }>();
    for (const transaction of periodTransactions) {
        const month = transaction.date?.slice(0, 7);
        if (!month) continue;
        const value = cashByMonth.get(month) ?? { inflow: 0, outflow: 0 };
        value[transaction.direction] = round(value[transaction.direction] + transaction.amount);
        cashByMonth.set(month, value);
    }
    const feedConsumedKg = sum(periodDaily.map((record) => record.feedKg ?? 0)) + (!filters.fromDate && !filters.toDate
        ? sum(batches.filter((batch) => batch.historical).map((batch) => batch.historicalData?.feedConsumedKg ?? 0))
        : 0);
    const totalBirdsSold = filters.fromDate || filters.toDate
        ? sum(periodSales.filter((sale) => sale.productType === "live_birds" && sale.unit === "birds").map((sale) => sale.quantity))
        : sum(batchPerformance.map(({ summary }) => summary.birdsSold));
    const recordedOperatingExpenses = sum(periodExpenses.map((expense) => expense.amount)) + sum(periodSales.map((sale) => sale.badDebtAmount ?? 0));
    const consumedStockCost = sum(periodMovements.filter((movement) => movement.type === "consumed" && movement.financialClassification !== "fixed_asset").map((movement) => movement.totalCost ?? 0));
    const cashIn = sum(periodTransactions.filter((item) => item.direction === "inflow").map((item) => item.amount));
    const cashOut = sum(periodTransactions.filter((item) => item.direction === "outflow").map((item) => item.amount));
    const warnings = [
        "Currency is not stored per record; money amounts use the app's current dollar display convention.",
        "Inventory and asset values are current snapshots; historical valuation snapshots and depreciation schedules are not stored consistently.",
        "Profitability is not shown: this data model has no completeness marker for all flock costs and inventory consumption.",
    ];
    if (!snapshot.inventory.valuationReliable) warnings.push("Some on-hand consumable stock has no reliable cost, so the inventory value is incomplete.");
    if (rows<Purchase>(data, "purchases").some((purchase) => purchase.financialClassification == null)) warnings.push("Some purchases have no financial classification; the existing finance summary applies its legacy default treatment.");

    return {
        activeBatchCount: activeBatchPerformance.length,
        currentBirdsHeld: sum(activeBatchPerformance.map(({ summary }) => summary.birdsAlive)),
        birdsPlaced,
        birdsPlacedUnknownCount: periodBatches.length - placedBatches.length,
        birdsSold: totalBirdsSold,
        mortalityTotal,
        mortalityPercent,
        feedConsumedKg,
        salesRevenue: sum(periodSales.map((sale) => sale.totalValue)),
        purchasesTotal: sum(periodPurchases.map((purchase) => purchase.totalCost)),
        operatingExpenses: recordedOperatingExpenses,
        consumablesUsedCost: consumedStockCost,
        cashIn,
        cashOut,
        inventory: snapshot.inventory,
        finance: snapshot.finance,
        revenueByBatch,
        expensesByCategory,
        purchasesByCategory,
        purchasesByMonth,
        customerPerformance,
        supplierPerformance,
        cycleDurations,
        averageCycleDays: cycleDurations.length ? round(cycleDurations.reduce((sum, item) => sum + item.value, 0) / cycleDurations.length) : null,
        mortalityByCause: [...mortalityByCause].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
        cashByMonth: [...cashByMonth].sort(([a], [b]) => a.localeCompare(b)).slice(-8).map(([month, values]) => ({ month, ...values })),
        batchPerformance,
        warnings,
        dateRange: { fromDate: filters.fromDate, toDate: filters.toDate },
    };
}

export type FarmExportResult = {
    files: { fileName: string; content: string }[];
    sheets: SpreadsheetSheetData[];
    counts: Partial<Record<FarmCollection, number>>;
    failures: Partial<Record<FarmCollection, string>>;
    totalRecords: number;
    branding: SpreadsheetBranding;
};

export type FarmExportSyncStatus = { status: string; pendingCount: number; error?: string };

export function createFarmExportTraceCode(): string {
    const time = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "0");
    return `MRM-${time}-${random}`;
}

export function buildFarmExportFiles(
    data: FarmReportDataset,
    loadFailures: Partial<Record<FarmCollection, string>>,
    selectedCollections: ReadonlySet<FarmCollection>,
    filters: ReportFilters,
    accountName: string,
    syncStatus: FarmExportSyncStatus = { status: "Saved device records", pendingCount: 0 },
): FarmExportResult {
    const relatedBatchRecordIds = relatedRecordIds(data, filters.batchId);
    const contextualFilters = { ...filters, relatedBatchRecordIds };
    const categoryFiles = buildCategoryCsvFiles(data, loadFailures, selectedCollections, FARM_COLLECTIONS, REPORT_CATEGORY_LABELS, contextualFilters);
    const { categories: collections, counts, failures, files } = categoryFiles;
    const analytics = calculateFarmReportAnalytics(data, filters);
    const branding: SpreadsheetBranding = { traceCode: createFarmExportTraceCode(), accountName, exportedAt: new Date().toISOString() };
    const metadata = [
        { field: "Exported at (UTC)", value: branding.exportedAt },
        { field: "Trace code", value: branding.traceCode },
        { field: "Data source", value: "Murimi farm records for the authenticated account" },
        { field: "Sync status", value: syncStatus.status },
        { field: "Pending sync changes", value: syncStatus.pendingCount },
        ...(syncStatus.error ? [{ field: "Sync detail", value: syncStatus.error }] : []),
        { field: "Farm account", value: accountName },
        { field: "Start date", value: filters.fromDate ?? "All dates" },
        { field: "End date", value: filters.toDate ?? "All dates" },
        { field: "Batch ID", value: filters.batchId ?? "All batches" },
        { field: "Selected categories", value: collections.map((collection) => REPORT_CATEGORY_LABELS[collection]).join("; ") },
        { field: "Currency", value: "Not stored per record; amounts follow the app's dollar display convention" },
        ...collections.map((collection) => ({ field: `Records exported: ${REPORT_CATEGORY_LABELS[collection]}`, value: counts[collection] ?? 0 })),
        ...Object.entries(failures).map(([collection, message]) => ({ field: `Failed: ${REPORT_CATEGORY_LABELS[collection as FarmCollection]}`, value: message })),
    ];
    const financialSummary = [
        { measure: "Sales revenue in selected period", value: analytics.salesRevenue, meaning: "Sales record totals; not cash received" },
        { measure: "Purchases in selected period", value: analytics.purchasesTotal, meaning: "Purchase totals; not automatically operating expense" },
        { measure: "Operating expense records in selected period", value: analytics.operatingExpenses, meaning: "Expense records, separate from purchases" },
        { measure: "Consumable stock used in selected period", value: analytics.consumablesUsedCost, meaning: "Cost recorded on consumed stock movements" },
        { measure: "Cash inflows in selected period", value: analytics.cashIn, meaning: "Cash movement records only" },
        { measure: "Cash outflows in selected period", value: analytics.cashOut, meaning: "Cash movement records only" },
        { measure: "Current working capital snapshot", value: analytics.finance.workingCapital, meaning: "Cash + receivables + consumable inventory - payables" },
        { measure: "Current fixed asset value snapshot", value: analytics.finance.fixedAssets, meaning: "Recorded estimated asset values; no depreciation estimate" },
        { measure: "Current consumable inventory value snapshot", value: analytics.inventory.totalValue, meaning: analytics.inventory.valuationReliable ? "Recorded-cost inventory valuation" : "Known values only; incomplete" },
    ];
    files.push({ fileName: "export_metadata.csv", content: recordsToCsv(metadata) });
    files.push({ fileName: "financial_summary.csv", content: recordsToCsv(financialSummary) });
    const sheets: SpreadsheetSheetData[] = collections.filter((collection) => !failures[collection]).map((collection) => ({
        name: REPORT_CATEGORY_LABELS[collection],
        rows: filterReportRecords(collection, data[collection] ?? [], contextualFilters).map((record) => flattenReportRecord(record)),
    }));
    sheets.push({ name: "Export metadata", rows: metadata.map((record) => flattenReportRecord(record)) }, { name: "Financial summary", rows: financialSummary.map((record) => flattenReportRecord(record)) });
    return { files, sheets, counts, failures, totalRecords: categoryFiles.totalRecords, branding };
}

export async function createFarmExportZip(result: FarmExportResult): Promise<Uint8Array> {
    const archive = new JSZip();
    for (const file of result.files) archive.file(file.fileName, file.content);
    return archive.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export function reportDateForRecord(collection: FarmCollection, record: Record<string, unknown>) {
    return getReportRecordDate(collection, record);
}

export function createFarmExportWorkbook(result: FarmExportResult): Uint8Array {
    return createXlsxWorkbook(result.sheets, result.branding);
}
