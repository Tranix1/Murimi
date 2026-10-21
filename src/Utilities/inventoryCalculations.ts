import type { InventoryItem, Purchase, StockMovement } from "@/types/farm";

export type InventoryItemBalance = {
  item: InventoryItem;
  onHand: number;
  allocated: number;
  available: number;
  financialClassification: "consumable" | "fixed_asset" | "operating_expense" | "mixed";
  /** Value still held in farm inventory (excludes stock issued to batches). */
  value: number | null;
  allocatedValue: number | null;
  onHandValue: number | null;
  averageUnitCost: number | null;
  openingQuantity: number;
  openingValue: number | null;
  purchasedQuantity: number;
  purchasedValue: number | null;
  issuedQuantity: number;
  issuedValue: number | null;
  usedQuantity: number;
  usedValue: number | null;
  wastedQuantity: number;
  wastedValue: number | null;
  returnedQuantity: number;
  returnedValue: number | null;
  adjustmentQuantity: number;
  adjustmentValue: number | null;
  latestPurchase: Purchase | null;
};

export type EffectiveStockMovement = StockMovement & { legacy?: boolean };

export function purchaseStockQuantity(purchase: Purchase): number | null {
  const value = purchase.quantity ?? (purchase.itemCount != null && purchase.amountPerItem != null ? purchase.itemCount * purchase.amountPerItem : purchase.itemCount);
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export function purchaseStockCost(purchase: Purchase): number | null {
  if (Number.isFinite(purchase.totalCost) && purchase.totalCost >= 0) return purchase.totalCost;
  const quantity = purchaseStockQuantity(purchase);
  const count = purchase.itemCount ?? purchase.packageCount ?? quantity;
  const price = purchase.pricePerItem ?? purchase.unitPrice;
  if (count != null && price != null && Number.isFinite(count * price) && count * price >= 0) return count * price;
  return null;
}

/** Backfills a read-only movement view for older saved purchases/allocations that lack ledger rows. */
function purchaseMatchesItem(purchase: Purchase, itemId: string, item?: InventoryItem): boolean {
  if (purchase.inventoryItemId === itemId) return true;
  return !!item && !purchase.inventoryItemId && purchase.itemName.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase() && purchase.category === item.category;
}

export function getEffectiveStockMovements(itemId: string, purchases: Purchase[], movements: StockMovement[], item?: InventoryItem): EffectiveStockMovement[] {
  const relevant = movements.filter((movement) => movement.itemId === itemId);
  const effective: EffectiveStockMovement[] = relevant.map((movement) => {
    const purchase = movement.purchaseId ? purchases.find((entry) => entry.id === movement.purchaseId) : undefined;
    const allocation = purchase?.allocations?.find((entry) => entry.batchId === movement.batchId);
    const quantity = purchase ? purchaseStockQuantity(purchase) : null;
    const cost = movement.totalCost ?? (movement.type === "received" && purchase ? purchaseStockCost(purchase) : undefined)
      ?? (movement.type === "allocated" && purchase && allocation ? allocation.cost ?? (quantity && purchaseStockCost(purchase) != null ? purchaseStockCost(purchase)! * movement.quantity / quantity : undefined) : undefined);
    return { ...movement, totalCost: cost, unitCost: movement.unitCost ?? (cost != null && movement.quantity ? cost / movement.quantity : undefined) };
  });
  const receivedPurchaseIds = new Set(relevant.filter((movement) => movement.type === "received" && movement.purchaseId).map((movement) => movement.purchaseId));
  const allocatedPurchaseBatchIds = new Set(relevant.filter((movement) => movement.type === "allocated" && movement.purchaseId && movement.batchId).map((movement) => `${movement.purchaseId}:${movement.batchId}`));

  for (const purchase of purchases.filter((entry) => purchaseMatchesItem(entry, itemId, item) && entry.receiptStatus !== "ordered" && entry.inventoryTracked !== false)) {
    if (!receivedPurchaseIds.has(purchase.id)) {
      const quantity = purchaseStockQuantity(purchase);
      const cost = purchaseStockCost(purchase);
      if (quantity != null) effective.push({
        id: `legacy_received_${purchase.id}`, itemId, purchaseId: purchase.id, date: purchase.date, type: "received", quantity,
        unit: purchase.unit ?? "units", totalCost: cost ?? undefined, unitCost: cost != null ? cost / quantity : undefined,
        financialClassification: purchase.financialClassification ?? "consumable", source: "legacy_purchase", reason: "Recovered from saved purchase record",
        createdAt: purchase.createdAt, updatedAt: purchase.updatedAt, ownerId: purchase.ownerId, accountId: purchase.accountId, legacy: true,
      });
    }
    for (const allocation of purchase.allocations ?? []) {
      if (allocatedPurchaseBatchIds.has(`${purchase.id}:${allocation.batchId}`)) continue;
      const quantity = allocation.quantity ?? 0;
      if (quantity <= 0) continue;
      const totalCost = allocation.cost ?? (purchaseStockQuantity(purchase) && purchaseStockCost(purchase) != null
        ? purchaseStockCost(purchase)! * quantity / purchaseStockQuantity(purchase)!
        : undefined);
      effective.push({
        id: `legacy_allocated_${purchase.id}_${allocation.batchId}`, itemId, purchaseId: purchase.id, batchId: allocation.batchId,
        batchNameSnapshot: allocation.batchNameSnapshot, batchNumberSnapshot: allocation.batchNumberSnapshot, date: purchase.date, type: "allocated",
        quantity, unit: purchase.unit ?? "units", totalCost, unitCost: totalCost != null ? totalCost / quantity : undefined,
        financialClassification: purchase.financialClassification ?? "consumable", source: "legacy_purchase_allocation", reason: "Recovered from saved purchase allocation",
        createdAt: allocation.allocatedAt || purchase.createdAt, updatedAt: allocation.allocatedAt || purchase.updatedAt,
        ownerId: purchase.ownerId, accountId: purchase.accountId, legacy: true,
      });
    }
  }
  const rank = (movement: StockMovement) => movement.type === "received" ? 0 : movement.type === "adjustment" && movement.quantity > 0 ? 1 : movement.type === "allocated" ? 2 : movement.type === "returned" ? 3 : 4;
  return effective.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || rank(a) - rank(b) || a.id.localeCompare(b.id));
}

export function calculateInventoryBalances(items: InventoryItem[], purchases: Purchase[], movements: StockMovement[]) {
  let totalValue = 0;
  let valuationReliable = true;
  const balances = items.filter((item) => item.inventoryTracked !== false).map((item): InventoryItemBalance => {
    const itemPurchases = purchases.filter((purchase) => purchaseMatchesItem(purchase, item.id, item));
    const ledger = getEffectiveStockMovements(item.id, itemPurchases, movements, item);
    const classifications = new Set<string>();
    let availableQuantity = 0; let availableValue = 0; let availableValueKnown = true;
    let allocatedQuantity = 0; let allocatedValue = 0; let allocatedValueKnown = true;
    let openingQuantity = 0; let openingValue = 0; let openingValueKnown = true;
    let purchasedQuantity = 0; let purchasedValue = 0; let purchasedValueKnown = true;
    let issuedQuantity = 0; let issuedValue = 0; let issuedValueKnown = true;
    let usedQuantity = 0; let usedValue = 0; let usedValueKnown = true;
    let wastedQuantity = 0; let wastedValue = 0; let wastedValueKnown = true;
    let returnedQuantity = 0; let returnedValue = 0; let returnedValueKnown = true;
    let adjustmentQuantity = 0; let adjustmentValue = 0; let adjustmentValueKnown = true;

    const removeFrom = (source: "farm" | "batch", quantity: number, explicitCost?: number) => {
      let qty = Math.max(0, quantity);
      let valueKnown = source === "farm" ? availableValueKnown : allocatedValueKnown;
      const stockQuantity = source === "farm" ? availableQuantity : allocatedQuantity;
      const stockValue = source === "farm" ? availableValue : allocatedValue;
      const cost = explicitCost != null && Number.isFinite(explicitCost) ? explicitCost : stockQuantity > 0 && valueKnown ? stockValue / stockQuantity * qty : undefined;
      if (cost == null) valueKnown = false;
      const bounded = Math.min(qty, stockQuantity);
      if (source === "farm") {
        availableQuantity -= bounded;
        if (cost != null && stockQuantity > 0) availableValue = Math.max(0, availableValue - cost * bounded / qty);
        availableValueKnown = valueKnown;
      } else {
        allocatedQuantity -= bounded;
        if (cost != null && stockQuantity > 0) allocatedValue = Math.max(0, allocatedValue - cost * bounded / qty);
        allocatedValueKnown = valueKnown;
      }
      return cost == null ? undefined : cost * bounded / qty;
    };

    for (const movement of ledger) {
      const purchase = movement.purchaseId ? itemPurchases.find((entry) => entry.id === movement.purchaseId) : undefined;
      const classification = movement.financialClassification ?? purchase?.financialClassification ?? item.defaultFinancialClassification ?? "consumable";
      classifications.add(classification);
      const movementCost = movement.totalCost ?? (movement.unitCost != null ? movement.unitCost * movement.quantity : undefined);
      if (movement.type === "received") {
        availableQuantity += movement.quantity;
        const isPurchaseReceipt = !!movement.purchaseId || movement.source === "legacy_purchase" || movement.source === "purchase";
        purchasedQuantity += isPurchaseReceipt ? movement.quantity : 0;
        if (classification === "consumable") {
          if (movementCost == null) { availableValueKnown = false; if (isPurchaseReceipt) purchasedValueKnown = false; }
          else { availableValue += movementCost; if (isPurchaseReceipt) purchasedValue += movementCost; }
          if (movement.source === "opening_balance") {
            openingQuantity += movement.quantity;
            if (movementCost == null) openingValueKnown = false; else openingValue += movementCost;
          }
        }
      } else if (movement.type === "adjustment") {
        adjustmentQuantity += movement.quantity;
        if (movement.quantity > 0) {
          availableQuantity += movement.quantity;
          if (movementCost == null) { availableValueKnown = false; adjustmentValueKnown = false; }
          else { availableValue += movementCost; adjustmentValue += movementCost; }
          if (movement.source === "opening_balance") {
            openingQuantity += movement.quantity;
            if (movementCost == null) openingValueKnown = false; else openingValue += movementCost;
          }
        } else if (movement.quantity < 0) {
          const removedCost = removeFrom("farm", -movement.quantity, movementCost);
          if (removedCost == null) adjustmentValueKnown = false; else adjustmentValue -= removedCost;
        }
      } else if (movement.type === "allocated") {
        const beforeQty = availableQuantity; const beforeValue = availableValue;
        const cost = movementCost ?? (beforeQty > 0 && availableValueKnown ? beforeValue / beforeQty * movement.quantity : undefined);
        issuedQuantity += movement.quantity;
        if (cost == null) { issuedValueKnown = false; allocatedValueKnown = false; availableValueKnown = false; }
        else issuedValue += cost;
        const bounded = Math.min(availableQuantity, movement.quantity);
        availableQuantity -= bounded;
        if (cost != null && movement.quantity > 0 && beforeQty > 0) availableValue = Math.max(0, beforeValue - cost * bounded / movement.quantity);
        if (movement.quantity > bounded) availableValueKnown = false;
        allocatedQuantity += movement.quantity;
        if (cost == null) allocatedValueKnown = false; else allocatedValue += cost;
      } else if (movement.type === "returned") {
        const removedCost = removeFrom("batch", movement.quantity, movementCost);
        const cost = movementCost ?? removedCost;
        returnedQuantity += movement.quantity;
        if (cost == null) { returnedValueKnown = false; availableValueKnown = false; }
        else { returnedValue += cost; availableValue += cost; }
        availableQuantity += movement.quantity;
      } else if (["consumed", "wasted", "sold"].includes(movement.type)) {
        const fromBatch = !!movement.batchId && allocatedQuantity > 0;
        const cost = removeFrom(fromBatch ? "batch" : "farm", movement.quantity, movementCost);
        if (movement.type === "consumed") { usedQuantity += movement.quantity; if (cost == null) usedValueKnown = false; else usedValue += cost; }
        if (movement.type === "wasted") { wastedQuantity += movement.quantity; if (cost == null) wastedValueKnown = false; else wastedValue += cost; }
      }
    }
    if (!classifications.size) classifications.add(item.defaultFinancialClassification ?? "consumable");
    const financialClassification = classifications.size > 1 ? "mixed" : [...classifications][0] as InventoryItemBalance["financialClassification"];
    const valued = classifications.has("consumable");
    const value = valued && availableValueKnown ? Math.max(0, availableValue) : null;
    const allocatedValueResult = valued && allocatedValueKnown ? Math.max(0, allocatedValue) : null;
    const onHandValue = value == null || allocatedValueResult == null ? null : value + allocatedValueResult;
    if (valued && ((value == null && availableQuantity > 0) || (allocatedValueResult == null && allocatedQuantity > 0))) valuationReliable = false;
    if (value != null) totalValue += value;
    const latestPurchase = itemPurchases.filter((purchase) => purchase.receiptStatus !== "ordered").sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
    return {
      item, onHand: Math.max(0, availableQuantity + allocatedQuantity), allocated: Math.max(0, allocatedQuantity), available: Math.max(0, availableQuantity), financialClassification,
      value, allocatedValue: allocatedValueResult, onHandValue, averageUnitCost: availableQuantity > 0 && value != null ? value / availableQuantity : null,
      openingQuantity, openingValue: openingValueKnown ? openingValue : null, purchasedQuantity, purchasedValue: purchasedValueKnown ? purchasedValue : null,
      issuedQuantity, issuedValue: issuedValueKnown ? issuedValue : null, usedQuantity, usedValue: usedValueKnown ? usedValue : null,
      wastedQuantity, wastedValue: wastedValueKnown ? wastedValue : null, returnedQuantity, returnedValue: returnedValueKnown ? returnedValue : null,
      adjustmentQuantity, adjustmentValue: adjustmentValueKnown ? adjustmentValue : null, latestPurchase,
    };
  });

  return { balances, totalValue, valuationReliable };
}

export function calculateBatchAllocatedStock(itemId: string, batchId: string, purchases: Purchase[], movements: StockMovement[], item?: InventoryItem) {
  const ledger = getEffectiveStockMovements(itemId, purchases, movements, item).filter((movement) => movement.batchId === batchId);
  let quantity = 0; let value = 0; let valueKnown = true; let issuedQuantity = 0; let issuedValue = 0;
  let consumedQuantity = 0; let consumedValue = 0; let wastedQuantity = 0; let wastedValue = 0; let returnedQuantity = 0; let returnedValue = 0;
  for (const movement of ledger) {
    const cost = movement.totalCost ?? (movement.unitCost != null ? movement.unitCost * movement.quantity : undefined);
    if (movement.type === "allocated") {
      issuedQuantity += movement.quantity; quantity += movement.quantity;
      if (cost == null) valueKnown = false; else { issuedValue += cost; value += cost; }
    } else if (["consumed", "wasted", "returned", "sold"].includes(movement.type)) {
      const removedQuantity = Math.min(quantity, movement.quantity);
      const removedCost = cost ?? (quantity > 0 && valueKnown ? value / quantity * removedQuantity : undefined);
      quantity -= removedQuantity;
      if (removedCost == null) valueKnown = false; else value = Math.max(0, value - removedCost);
      if (movement.type === "consumed") { consumedQuantity += removedQuantity; if (removedCost != null) consumedValue += removedCost; }
      if (movement.type === "wasted") { wastedQuantity += removedQuantity; if (removedCost != null) wastedValue += removedCost; }
      if (movement.type === "returned") { returnedQuantity += removedQuantity; if (removedCost != null) returnedValue += removedCost; }
    }
  }
  return { quantity: Math.max(0, quantity), value: valueKnown ? Math.max(0, value) : null, averageUnitCost: quantity > 0 && valueKnown ? value / quantity : null, issuedQuantity, issuedValue: issuedValue || (issuedQuantity === 0 ? 0 : null), consumedQuantity, consumedValue, wastedQuantity, wastedValue, returnedQuantity, returnedValue };
}
