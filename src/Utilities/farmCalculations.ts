import type { Batch, BatchSummary, DailyRecord, Expense, MortalityRecord, Purchase, Sale, SlaughterRecord, StockMovement, WeightMeasurement } from "@/types/farm";

export function calculateMortalityAnalytics(records: MortalityRecord[], initialQuantity?: number) {
  const byCause = new Map<string, number>(); const byWeek = new Map<number, number>(); const byDate = new Map<string, number>();
  for (const record of records) {
    byCause.set(record.causeCode, (byCause.get(record.causeCode) ?? 0) + record.quantity);
    if (record.birdAgeDays != null) { const week = Math.ceil(record.birdAgeDays / 7); byWeek.set(week, (byWeek.get(week) ?? 0) + record.quantity); }
    byDate.set(record.date, (byDate.get(record.date) ?? 0) + record.quantity);
  }
  const total = records.reduce((sum, record) => sum + record.quantity, 0);
  return { total, mortalityPercent: initialQuantity && initialQuantity > 0 ? (total / initialQuantity) * 100 : null, byCause: [...byCause.entries()], byWeek: [...byWeek.entries()].sort(([a], [b]) => a - b), byDate: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)) };
}

export function calculateClosingBirdCount(opening: number, deaths: number, removals: number, additions = 0): number {
  return opening - Math.max(0, deaths) - Math.max(0, removals) + Math.max(0, additions);
}

export function calculateCurrentBirdCount(
  batch: Batch,
  dailyRecords: DailyRecord[],
  sales: Sale[],
  slaughterRecords: SlaughterRecord[],
  beforeDate?: string,
): number {
  if (batch.historical) return batch.historicalData?.birdsRemaining ?? 0;
  const isBefore = (date: string) => !beforeDate || date < beforeDate;
  const dailyNet = dailyRecords.filter((record) => record.batchId === batch.id && isBefore(record.date))
    .reduce((sum, record) => sum + record.additions - record.deaths - record.removals, 0);
  const liveSales = sales.filter((sale) => sale.batchId === batch.id && sale.productType === "live_birds" && sale.unit === "birds" && isBefore(sale.date))
    .reduce((sum, sale) => sum + sale.quantity, 0);
  const slaughtered = slaughterRecords.filter((record) => record.batchId === batch.id && isBefore(record.date))
    .reduce((sum, record) => sum + record.quantitySlaughtered, 0);
  return Math.max(0, batch.initialQuantity + dailyNet - liveSales - slaughtered);
}

export function average(values: number[]): number | null {
  const valid = values.filter((value) => Number.isFinite(value) && value >= 0);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

/** Flock age is counted inclusively, so the placement date is Day 1. */
export function calculateBatchAgeDays(startDate: string, today = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  const [year, month, day] = startDate.split("-").map(Number);
  const start = Date.UTC(year, month - 1, day);
  const current = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (!Number.isFinite(start) || !Number.isFinite(current)) return null;
  return Math.max(0, Math.floor((current - start) / 86400000) + 1);
}

/** Feed recommendation: days 1-14 starter, 15-27 grower, and day 28 onward finisher. */
export function broilerFeedStageForAge(ageDays: number): "starter" | "grower" | "finisher" | null {
  if (!Number.isFinite(ageDays) || ageDays < 1) return null;
  if (ageDays <= 14) return "starter";
  if (ageDays <= 27) return "grower";
  return "finisher";
}

export type BatchProductionStage = "starter" | "growing" | "finishing" | "ready_to_sell";

export function batchProductionStageForAge(ageDays: number): BatchProductionStage | null {
  if (!Number.isFinite(ageDays) || ageDays < 1) return null;
  if (ageDays <= 14) return "starter";
  if (ageDays <= 27) return "growing";
  if (ageDays <= 35) return "finishing";
  return "ready_to_sell";
}

export function batchProductionStageLabel(stage: BatchProductionStage): string {
  return ({ starter: "Starter", growing: "Growing", finishing: "Finishing", ready_to_sell: "Ready to sell" })[stage];
}

export function calculateBatchSummary(
  batch: Batch,
  dailyRecords: DailyRecord[],
  expenses: Expense[],
  sales: Sale[],
  measurements: WeightMeasurement[],
  slaughterRecords: SlaughterRecord[],
  purchases: Purchase[] = [],
  stockMovements: StockMovement[] = [],
): BatchSummary {
  const historical = batch.historicalData;
  const deaths = dailyRecords.reduce((sum, record) => sum + Math.max(0, record.deaths), 0) + (batch.historical ? historical?.totalDeaths ?? 0 : 0);
  const removals = dailyRecords.reduce((sum, record) => sum + Math.max(0, record.removals), 0);
  const additions = dailyRecords.reduce((sum, record) => sum + Math.max(0, record.additions), 0);
  const liveBirdSales = sales.filter((sale) => sale.productType === "live_birds" && sale.unit === "birds");
  const birdsSold = liveBirdSales.reduce((sum, sale) => sum + sale.quantity, 0) + (batch.historical ? historical?.birdsSold ?? 0 : 0);
  const slaughtered = slaughterRecords.reduce((sum, record) => sum + record.quantitySlaughtered, 0);
  const birdsAlive = batch.historical ? historical?.birdsRemaining ?? 0 : Math.max(0, batch.initialQuantity + additions - deaths - removals - birdsSold - slaughtered);
  const feedKg = dailyRecords.reduce((sum, record) => sum + Math.max(0, record.feedKg ?? 0), 0) + (batch.historical ? Math.max(0, historical?.feedConsumedKg ?? 0) : 0);
  const badDebtLosses = sales.reduce((sum, sale) => sum + Math.max(0, sale.badDebtAmount ?? 0), 0);
  const operatingExpenses = expenses.reduce((sum, expense) => sum + Math.max(0, expense.amount), 0) + badDebtLosses + (batch.historical ? Math.max(0, historical?.otherOperatingCosts ?? 0) : 0) + (batch.historical ? Math.max(0, historical?.feedCost ?? 0) : 0);
  const processingCosts = slaughterRecords.reduce((sum, record) => sum + Math.max(0, record.processingCost) + Math.max(0, record.packagingCost), 0);
  const deliveryCosts = sales.reduce((sum, sale) => sum + Math.max(0, sale.deliveryCost), 0);
  const baseCosts = (batch.historical ? Math.max(0, historical?.chicksCost ?? 0) : (batch.paidQuantity ?? batch.initialQuantity) * Math.max(0, batch.costPerUnit ?? 0)) + Math.max(0, batch.transportCost) + Math.max(0, batch.setupCost);
  const batchIssues = stockMovements.filter((movement) => movement.batchId === batch.id && movement.type === "allocated");
  const issueKeys = new Set(batchIssues.filter((movement) => movement.purchaseId).map((movement) => `${movement.purchaseId}:${movement.batchId}`));
  let issuedStockCosts = 0; let costsReliable = true;
  const purchaseQuantity = (purchase: Purchase) => purchase.quantity ?? (purchase.itemCount != null && purchase.amountPerItem != null ? purchase.itemCount * purchase.amountPerItem : purchase.itemCount);
  const purchaseCost = (purchase: Purchase) => Number.isFinite(purchase.totalCost) && purchase.totalCost >= 0 ? purchase.totalCost : purchase.itemCount != null && purchase.pricePerItem != null ? purchase.itemCount * purchase.pricePerItem : undefined;
  for (const movement of batchIssues) {
    const purchase = purchases.find((entry) => entry.id === movement.purchaseId);
    const allocation = purchase?.allocations.find((entry) => entry.batchId === batch.id);
    const quantity = purchase ? purchaseQuantity(purchase) : null;
    const cost = movement.totalCost ?? (movement.unitCost != null ? movement.unitCost * movement.quantity : undefined)
      ?? allocation?.cost ?? (quantity && purchase && purchaseCost(purchase) != null ? purchaseCost(purchase)! * movement.quantity / quantity : undefined);
    if (cost == null) costsReliable = false; else issuedStockCosts += Math.max(0, cost);
  }
  for (const purchase of purchases) for (const allocation of purchase.allocations.filter((entry) => entry.batchId === batch.id && !issueKeys.has(`${purchase.id}:${entry.batchId}`))) {
    const quantity = purchaseQuantity(purchase);
    const cost = allocation.cost ?? (quantity && purchaseCost(purchase) != null ? purchaseCost(purchase)! * (allocation.quantity ?? quantity) / quantity : undefined);
    if (cost == null) costsReliable = false; else issuedStockCosts += Math.max(0, cost);
  }
  const returnedStockCosts = stockMovements.filter((movement) => movement.batchId === batch.id && movement.type === "returned")
    .reduce((sum, movement) => { const cost = movement.totalCost ?? (movement.unitCost != null ? movement.unitCost * movement.quantity : undefined); if (cost == null) { costsReliable = false; return sum; } return sum + Math.max(0, cost); }, 0);
  const coveredItems = new Set(batchIssues.map((movement) => movement.itemId));
  for (const purchase of purchases.filter((entry) => entry.allocations.some((allocation) => allocation.batchId === batch.id) && entry.inventoryItemId)) coveredItems.add(purchase.inventoryItemId!);
  const legacyUnallocatedConsumption = stockMovements.filter((movement) => movement.batchId === batch.id && movement.type === "consumed" && !coveredItems.has(movement.itemId));
  const consumptionFallbackCosts = legacyUnallocatedConsumption.reduce((sum, movement) => { const cost = movement.totalCost ?? (movement.unitCost != null ? movement.unitCost * movement.quantity : undefined); if (cost == null) { costsReliable = false; return sum; } return sum + Math.max(0, cost); }, 0);
  const consumedStockCosts = Math.max(0, issuedStockCosts - returnedStockCosts) + consumptionFallbackCosts;
  const costsIncurred = baseCosts + operatingExpenses + consumedStockCosts + processingCosts + deliveryCosts;
  const revenue = sales.reduce((sum, sale) => sum + Math.max(0, sale.totalValue), 0) + (batch.historical ? Math.max(0, historical?.revenue ?? 0) : 0);
  const cashCollected = sales.reduce((sum, sale) => sum + Math.max(0, sale.paymentReceived), 0) + (batch.historical ? Math.max(0, historical?.amountPaid ?? 0) : 0);
  const receivables = sales.reduce((sum, sale) => sum + Math.max(0, sale.outstanding), 0) + (batch.historical ? Math.max(0, historical?.outstanding ?? 0) : 0);
  const orderedWeights = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
  const latestMeasurement = orderedWeights.at(-1);
  const averageLiveWeightKg = latestMeasurement?.averageKg ?? null;
  const initialBirdCountKnown = !batch.historical || !historical?.unknownFields?.includes("initialQuantity");
  const mortalityPercent = initialBirdCountKnown && batch.initialQuantity > 0 ? (deaths / batch.initialQuantity) * 100 : null;
  const costPerLiveBird = birdsAlive > 0 ? costsIncurred / birdsAlive : null;
  const costPerBirdPlaced = batch.initialQuantity > 0 ? costsIncurred / batch.initialQuantity : null;
  const profit = revenue - costsIncurred;
  const profitMarginPercent = revenue > 0 ? (profit / revenue) * 100 : null;
  const birdsSoldForCost = birdsSold + (batch.historical ? historical?.birdsSlaughtered ?? 0 : 0) + slaughtered;
  const kilogramsSold = (batch.historical ? (historical?.meatKgSold ?? 0) + (historical?.liveWeightKgSold ?? 0) : 0) + sales.reduce((sum, sale) => sum + (sale.unit === "kg" ? sale.quantity : 0), 0);
  const costPerBirdSold = birdsSoldForCost > 0 ? costsIncurred / birdsSoldForCost : null;
  const costPerKgSold = kilogramsSold > 0 ? costsIncurred / kilogramsSold : null;
  const missingHistoricalInputs = batch.historical ? (historical?.unknownFields ?? []) : [];

  // FCR is only reliable when weights exist and no birds left the flock between samples.
  const noUnweighedMovements = !batch.historical && deaths === 0 && removals === 0 && additions === 0 && birdsSold === 0 && slaughtered === 0;
  let fcr: number | null = null;
  if (noUnweighedMovements && orderedWeights.length >= 1 && batch.initialAverageWeightKg != null && averageLiveWeightKg != null) {
    const liveWeightGain = averageLiveWeightKg * birdsAlive - batch.initialAverageWeightKg * batch.initialQuantity;
    if (liveWeightGain > 0 && feedKg > 0) fcr = feedKg / liveWeightGain;
  }

  return {
    birdsAlive,
    deaths,
    mortalityPercent,
    birdsSold,
    costsIncurred,
    costsReliable,
    feedKg,
    feedBags50Kg: feedKg / 50,
    averageLiveWeightKg,
    costPerLiveBird,
    costPerBirdPlaced,
    revenue,
    cashCollected,
    receivables,
    profit,
    profitMarginPercent,
    fcr,
    costPerBirdSold,
    costPerKgSold,
    missingHistoricalInputs,
  };
}

export type FinanceSummary = {
  availableCash: number;
  receivables: number;
  payables: number;
  inventoryValue: number;
  activeBatchCosts: number;
  fixedAssets: number;
  currentAssets: number;
  workingCapital: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  revenue: number;
  expenses: number;
  realizedProfit: number;
};

export function calculateFinanceSummary(input: {
  transactions: { direction: "inflow" | "outflow"; amount: number }[];
  sales: Sale[];
  expenses: Expense[];
  purchases?: Purchase[];
  stockMovements?: StockMovement[];
  assets: { estimatedValue: number }[];
  inventoryValue?: number;
  activeBatchCosts?: number;
}): FinanceSummary {
  const availableCash = input.transactions.reduce((sum, item) => sum + (item.direction === "inflow" ? item.amount : -item.amount), 0);
  const receivables = input.sales.reduce((sum, sale) => sum + Math.max(0, sale.outstanding), 0);
  const payables = input.expenses.reduce((sum, expense) => sum + Math.max(0, expense.amount - expense.amountPaid), 0)
    + (input.purchases ?? []).reduce((sum, purchase) => sum + Math.max(0, purchase.outstanding ?? 0), 0);
  const inventoryValue = Math.max(0, input.inventoryValue ?? 0);
  const activeBatchCosts = Math.max(0, input.activeBatchCosts ?? 0);
  const fixedAssets = input.assets.reduce((sum, asset) => sum + Math.max(0, asset.estimatedValue), 0);
  const currentAssets = availableCash + receivables + inventoryValue;
  const totalAssets = currentAssets + fixedAssets;
  const totalLiabilities = payables;
  const revenue = input.sales.reduce((sum, sale) => sum + Math.max(0, sale.totalValue), 0);
  const expenses = input.expenses.reduce((sum, expense) => sum + Math.max(0, expense.amount), 0)
    + input.sales.reduce((sum, sale) => sum + Math.max(0, sale.badDebtAmount ?? 0), 0)
    + (input.purchases ?? []).filter((purchase) => purchase.financialClassification == null || purchase.financialClassification === "operating_expense" || (purchase.financialClassification === "consumable" && purchase.inventoryTracked === false))
      .reduce((sum, purchase) => sum + Math.max(0, purchase.totalCost), 0)
    + (input.stockMovements ?? []).filter((movement) => movement.type === "consumed" && movement.financialClassification !== "fixed_asset")
      .reduce((sum, movement) => sum + Math.max(0, movement.totalCost ?? 0), 0);
  return {
    availableCash,
    receivables,
    payables,
    inventoryValue,
    activeBatchCosts,
    fixedAssets,
    currentAssets,
    workingCapital: currentAssets - payables,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    revenue,
    expenses,
    realizedProfit: revenue - expenses,
  };
}

/** Fixed asset values entered through Record Purchase are the canonical asset register. */
export function purchaseBackedAssets(purchases: Purchase[], assets: { purchaseId?: string; estimatedValue: number; status?: string }[]) {
  const linkedValues = new Map(assets.filter((asset) => asset.purchaseId && asset.status !== "sold" && asset.status !== "removed" && asset.status !== "disposed").map((asset) => [asset.purchaseId!, asset.estimatedValue]));
  return purchases.filter((purchase) => purchase.financialClassification === "fixed_asset" || linkedValues.has(purchase.id))
    .filter((purchase) => !assets.some((asset) => asset.purchaseId === purchase.id && ["sold", "removed", "disposed"].includes(asset.status ?? "")))
    .map((purchase) => ({ estimatedValue: linkedValues.get(purchase.id) ?? purchase.totalCost }));
}
