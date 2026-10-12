import type { InventoryItem, Purchase, StockMovement } from "@/types/farm";

export type InventoryItemBalance = {
    item: InventoryItem;
    onHand: number;
    allocated: number;
    available: number;
    financialClassification: "consumable" | "fixed_asset" | "operating_expense" | "mixed";
    value: number | null;
};

export function calculateInventoryBalances(items: InventoryItem[], purchases: Purchase[], movements: StockMovement[]) {
    let totalValue = 0;
    let valuationReliable = true;
    const balances = items.filter((item) => item.inventoryTracked !== false).map((item): InventoryItemBalance => {
        const itemMovements = movements.filter((movement) => movement.itemId === item.id);
        const itemPurchases = purchases.filter((purchase) => purchase.inventoryItemId === item.id);
        const purchaseById = new Map(itemPurchases.map((purchase) => [purchase.id, purchase]));
        let onHand = 0;
        let itemValue = 0;
        let itemValueReliable = true;
        const classifications = new Set<string>();

        for (const movement of itemMovements) {
            if (movement.type === "received") {
                onHand += movement.quantity;
                const purchase = movement.purchaseId ? purchaseById.get(movement.purchaseId) : undefined;
                const classification = movement.financialClassification ?? purchase?.financialClassification ?? "consumable";
                classifications.add(classification);
                if (classification === "consumable") {
                    const cost = movement.totalCost ?? purchase?.totalCost;
                    if (cost == null || !Number.isFinite(cost)) itemValueReliable = false;
                    else itemValue += cost;
                }
            } else if (movement.type === "adjustment") {
                onHand += movement.quantity;
                if (movement.quantity !== 0 && movement.totalCost == null) itemValueReliable = false;
                else if (movement.quantity > 0) itemValue += movement.totalCost ?? 0;
                else if (movement.quantity < 0) itemValue -= movement.totalCost ?? 0;
            } else if (["consumed", "sold", "wasted"].includes(movement.type)) {
                onHand -= movement.quantity;
                if ((movement.financialClassification ?? "consumable") === "consumable") {
                    if (movement.totalCost == null) itemValueReliable = false;
                    else itemValue -= movement.totalCost;
                }
            }
        }

        if (!itemMovements.some((movement) => movement.type === "received") && itemPurchases.some((purchase) => purchase.receiptStatus === "received" && purchase.inventoryTracked !== false)) {
            itemValueReliable = false;
        }
        const allocated = Math.max(0, itemPurchases.reduce((sum, purchase) => sum + purchase.allocations.reduce((amount, allocation) => amount + Math.max(0, allocation.quantity ?? 0), 0), 0)
            - itemMovements.filter((movement) => movement.type === "consumed").reduce((sum, movement) => sum + Math.max(0, movement.quantity), 0));
        if (!classifications.size) classifications.add(item.defaultFinancialClassification ?? "consumable");
        const financialClassification = classifications.size > 1 ? "mixed" : [...classifications][0] as InventoryItemBalance["financialClassification"];
        const hasValuedStock = classifications.has("consumable");
        const value = hasValuedStock && itemValueReliable ? Math.max(0, itemValue) : null;
        if (value == null && onHand > 0 && hasValuedStock) valuationReliable = false;
        if (value != null) totalValue += value;
        return { item, onHand: Math.max(0, onHand), allocated: Math.min(Math.max(0, onHand), allocated), available: Math.max(0, onHand - allocated), financialClassification, value };
    });

    return { balances, totalValue, valuationReliable };
}