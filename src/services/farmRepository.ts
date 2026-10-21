import {
  commitLocalFarmChanges,
  deleteLocalFarmRecord,
  getDueFarmChanges,
  getFarmSyncSummary,
  getLocalFarmRecord,
  getLocalFarmRecords,
  purgeLocalFarmAccount,
  recordFarmSyncFailure,
  saveRemoteFarmRecords,
  setFarmLastSyncedAt,
  setLocalFarmRecordSynced,
  subscribeLocalFarmChanges,
  type QueuedFarmChange
} from "@/services/farmLocalDatabase";
import type { Batch, BatchProblem, DailyRecord, Expense, FarmRecord, MortalityRecord, Sale, SalePayment, SlaughterRecord } from "@/types/farm";
import { calculateClosingBirdCount, calculateCurrentBirdCount } from "@/Utilities/farmCalculations";
import { calculateBatchAllocatedStock, calculateInventoryBalances } from "@/Utilities/inventoryCalculations";
import type { DocumentData, QueryDocumentSnapshot } from "@react-native-firebase/firestore";
import { getApp } from "@react-native-firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocsFromServer,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "@react-native-firebase/firestore";

export type FarmCollection = "batches" | "dailyRecords" | "mortalityRecords" | "batchProblems" | "weights" | "expenses" | "purchases" | "sales" | "slaughter" | "assets" | "plans" | "transactions" | "stock" | "stockMovements" | "payments" | "treatments" | "customerCategories" | "customers" | "paymentMethods" | "purchaseCategories" | "purchaseMeasures" | "suppliers";
export const FARM_COLLECTIONS: FarmCollection[] = ["batches", "dailyRecords", "mortalityRecords", "batchProblems", "weights", "expenses", "purchases", "sales", "slaughter", "assets", "plans", "transactions", "stock", "stockMovements", "payments", "treatments", "customerCategories", "customers", "paymentMethods", "purchaseCategories", "purchaseMeasures", "suppliers"];

const firestore = getFirestore();
const farmCollection = (uid: string, accountId: string, name: FarmCollection) => collection(firestore, "users", uid, "farmAccounts", accountId, name);
const farmDocument = (uid: string, accountId: string, name: FarmCollection, id: string) => doc(firestore, "users", uid, "farmAccounts", accountId, name, id);
const now = () => new Date().toISOString();
const moneyAmount = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeFirestoreValue(item)]));
  return value;
}

function recordFromSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): Record<string, unknown> {
  return { ...(normalizeFirestoreValue(snapshot.data()) as Record<string, unknown>), id: snapshot.id };
}

export function subscribeFarmRecords<T extends FarmRecord>(uid: string, accountId: string, collectionName: FarmCollection, callback: (records: T[]) => void, onError: (error: Error) => void): Unsubscribe {
  let active = true;
  let refreshSequence = 0;
  const refreshLocal = () => { const sequence = ++refreshSequence; void getLocalFarmRecords<Record<string, unknown>>(uid, accountId, collectionName).then((records) => { if (active && sequence === refreshSequence) callback(records as T[]); }).catch((error: unknown) => { if (active && sequence === refreshSequence) onError(error instanceof Error ? error : new Error("Could not read local farm records.")); }); };
  const unsubscribeLocal = subscribeLocalFarmChanges(uid, accountId, collectionName, refreshLocal);
  refreshLocal();
  const unsubscribeCloud = onSnapshot(query(farmCollection(uid, accountId, collectionName)), (snapshot) => {
    const records = snapshot.docs.map(recordFromSnapshot);
    void saveRemoteFarmRecords(uid, accountId, collectionName, records, !snapshot.metadata.fromCache).then(() => { if (active) refreshLocal(); }).catch((error: unknown) => { if (active) onError(error instanceof Error ? error : new Error("Could not update local farm records.")); });
  }, (error) => {
    // The persistent local records remain usable when Firestore is offline.
    if (active && (error as Error & { code?: string }).code !== "unavailable") onError(error);
  });
  return () => { active = false; unsubscribeLocal(); unsubscribeCloud(); };
}

export async function createFarmRecord<T extends object>(uid: string, accountId: string, collectionName: FarmCollection, data: T, id?: string): Promise<string> {
  const reference = id ? farmDocument(uid, accountId, collectionName, id) : doc(farmCollection(uid, accountId, collectionName));
  const created = now();
  const record = { ...data, id: reference.id, ownerId: uid, accountId, createdAt: created, updatedAt: created } as Record<string, unknown>;
  await commitLocalFarmChanges(uid, accountId, [{ collectionName, id: reference.id, record }]);
  return reference.id;
}

function normalizedBatchNumber(value: string) {
  const cleaned = value.trim().toLocaleLowerCase().replace(/^batch\s*/i, "").replace(/\s+/g, "");
  return /^\d+$/.test(cleaned) ? String(Number(cleaned)) : cleaned;
}

export async function suggestNextBatchNumber(uid: string, accountId: string): Promise<string> {
  const batches = await getLocalFarmRecords<Batch>(uid, accountId, "batches");
  const numbers = batches.map((batch) => batch.batchNumber ?? batch.name).map((value) => value.match(/(?:batch\s*)?(\d+)\s*$/i)?.[1]).filter((value): value is string => !!value).map(Number).filter(Number.isSafeInteger);
  return String(Math.max(0, ...numbers) + 1);
}

export async function saveBatchRecord(uid: string, accountId: string, data: Omit<Batch, keyof FarmRecord>, explicitId?: string): Promise<string> {
  const batchNumber = data.batchNumber?.trim();
  if (!batchNumber) throw new Error("Enter a batch number.");
  const key = normalizedBatchNumber(batchNumber);
  if (!key || key.length > 48) throw new Error("Enter a valid batch number.");
  const batches = await getLocalFarmRecords<Batch>(uid, accountId, "batches");
  const duplicate = batches.find((batch) => normalizedBatchNumber(batch.batchNumber ?? batch.name) === key);
  if (duplicate) throw new Error(`Batch number ${batchNumber} is already used by ${duplicate.name}.`);
  const id = explicitId ?? `batch_${key.replace(/[^a-z0-9_-]/g, "_")}`;
  if (await getLocalFarmRecord(uid, accountId, "batches", id)) throw new Error(`Batch number ${batchNumber} is already in use.`);
  const created = now();
  const record = { ...data, id, ownerId: uid, accountId, createdAt: created, updatedAt: created };
  await commitLocalFarmChanges(uid, accountId, [{ collectionName: "batches", id, record, operation: "batch" }]);
  return id;
}

export async function saveMortalityRecord(uid: string, accountId: string, batch: Batch, input: Omit<MortalityRecord, keyof FarmRecord | "batchId" | "batchNumber" | "dailyRecordId">): Promise<string> {
  if (batch.status === "completed" || batch.status === "archived") throw new Error("This batch is closed. Record historical corrections with an audit note instead.");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error("Enter a whole number of birds greater than zero.");
  const dailyRecordId = `${batch.id}_${input.date}`;
  const previous = await getLocalFarmRecord<DailyRecord>(uid, accountId, "dailyRecords", dailyRecordId);
  const openingCount = previous?.openingCount ?? await currentBirdsFromLocal(uid, accountId, batch, input.date);
  const existingDeaths = previous?.deaths ?? 0;
  if (input.quantity + existingDeaths > openingCount + (previous?.additions ?? 0) - (previous?.removals ?? 0)) throw new Error("The mortality count exceeds the birds available on that date.");
  const created = now();
  const mortalityId = doc(farmCollection(uid, accountId, "mortalityRecords")).id;
  const mortality: MortalityRecord = { ...input, id: mortalityId, batchId: batch.id, batchNumber: batch.batchNumber, dailyRecordId, ownerId: uid, accountId, createdAt: created, updatedAt: created };
  const deathCause = { quantity: input.quantity, cause: input.customCause || input.causeLabel, causeCode: input.causeCode, symptoms: [...input.symptoms, input.otherSymptoms].filter(Boolean).join(", ") || undefined, actionTaken: input.actionTaken, notes: input.notes, mortalityRecordId: mortalityId };
  const daily: DailyRecord = { ...(previous ?? { id: dailyRecordId, ownerId: uid, accountId, batchId: batch.id, date: input.date, openingCount, deaths: 0, deathCauses: [], removals: 0, additions: 0, closingCount: openingCount, createdAt: created }), deaths: existingDeaths + input.quantity, deathCauses: [...(previous?.deathCauses ?? []), deathCause], closingCount: openingCount - existingDeaths - input.quantity - (previous?.removals ?? 0) + (previous?.additions ?? 0), updatedAt: created };
  await commitLocalFarmChanges(uid, accountId, [
    { collectionName: "mortalityRecords", id: mortalityId, record: mortality },
    { collectionName: "dailyRecords", id: dailyRecordId, record: daily, operation: "daily" },
  ]);
  return mortalityId;
}

export async function saveBatchProblem(uid: string, accountId: string, input: Omit<BatchProblem, keyof FarmRecord>): Promise<string> {
  const batch = await getLocalFarmRecord<Batch>(uid, accountId, "batches", input.batchId);
  if (!batch || batch.status === "archived") throw new Error("This batch is unavailable for new problem records.");
  if (batch.status === "completed") throw new Error("This batch is closed. Add a historical correction with an audit note instead.");
  return createFarmRecord(uid, accountId, "batchProblems", input);
}

export async function closeFarmBatch(uid: string, accountId: string, batch: Batch, date: string, disposition: NonNullable<Batch["closureDisposition"]>, notes?: string): Promise<void> {
  if (batch.status === "archived") throw new Error("Archived batches cannot be closed again.");
  const remaining = await currentBirdsFromLocal(uid, accountId, batch);
  if (remaining > 0 && disposition === "none") throw new Error("Choose how the remaining birds are accounted for before closing.");
  if (remaining > 0 && !notes?.trim()) throw new Error("Add a note describing the remaining birds or their transfer/sale record.");
  await updateFarmRecord(uid, accountId, "batches", batch.id, { status: "completed", productionComplete: true, sellingComplete: true, closedAt: date, closureDisposition: disposition, closureNotes: notes?.trim() || undefined });
}

export async function archiveFarmBatch(uid: string, accountId: string, batch: Batch, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error("Enter why this batch is being archived.");
  await updateFarmRecord(uid, accountId, "batches", batch.id, { status: "archived", archivedAt: now(), archiveReason: reason.trim() });
}

export async function ensureDefaultPaymentMethods(uid: string, accountId: string): Promise<void> {
  const defaults = [{ id: "default_cash", name: "Cash" }, { id: "default_ecocash", name: "EcoCash" }, { id: "default_bank_transfer", name: "Bank transfer" }];
  for (const item of defaults) {
    if (await getLocalFarmRecord(uid, accountId, "paymentMethods", item.id)) continue;
    await createFarmRecord(uid, accountId, "paymentMethods", { name: item.name, active: true, systemDefault: true }, item.id);
  }
}

export async function updateFarmRecord(uid: string, accountId: string, collectionName: FarmCollection, id: string, updates: Record<string, unknown>): Promise<void> {
  const old = await getLocalFarmRecord<Record<string, unknown>>(uid, accountId, collectionName, id);
  if (!old) throw new Error("This record is not available in the local farm database yet. Reconnect and try again.");
  const record = { ...old, ...updates, id, ownerId: uid, accountId, updatedAt: now() };
  await commitLocalFarmChanges(uid, accountId, [{ collectionName, id, record }]);
}

export async function deleteFarmRecord(uid: string, accountId: string, collectionName: FarmCollection, id: string): Promise<void> {
  await deleteLocalFarmRecord(uid, accountId, collectionName, id);
}

async function currentBirdsFromLocal(uid: string, accountId: string, batch: Batch, beforeDate?: string): Promise<number> {
  const [daily, sales, slaughter] = await Promise.all([
    getLocalFarmRecords<DailyRecord>(uid, accountId, "dailyRecords"),
    getLocalFarmRecords<Sale>(uid, accountId, "sales"),
    getLocalFarmRecords<SlaughterRecord>(uid, accountId, "slaughter"),
  ]);
  return calculateCurrentBirdCount(batch, daily, sales, slaughter, beforeDate);
}

export async function saveDailyRecord(uid: string, accountId: string, batch: Batch, input: Omit<DailyRecord, keyof FarmRecord | "batchId" | "openingCount" | "closingCount"> & { openingCount?: number }): Promise<void> {
  if (batch.status === "completed" || batch.status === "archived") throw new Error("This batch is closed. Ordinary daily records cannot be added.");
  const id = `${batch.id}_${input.date}`;
  const previous = await getLocalFarmRecord<DailyRecord>(uid, accountId, "dailyRecords", id);
  const currentBirds = await currentBirdsFromLocal(uid, accountId, batch);
  const openingCount = input.openingCount ?? previous?.openingCount ?? currentBirds;
  const closingCount = calculateClosingBirdCount(openingCount, input.deaths, input.removals, input.additions);
  const oldDelta = previous ? previous.closingCount - previous.openingCount : 0;
  if (currentBirds - oldDelta + closingCount - openingCount < 0) throw new Error("This entry would reduce the batch below zero birds.");
  const created = now();
  const record = { ...input, id, ownerId: uid, accountId, batchId: batch.id, openingCount, closingCount, createdAt: previous?.createdAt ?? created, updatedAt: created };
  await commitLocalFarmChanges(uid, accountId, [{ collectionName: "dailyRecords", id, record, operation: "daily" }]);
}

export async function saveSale(uid: string, accountId: string, batch: Batch, input: Omit<Sale, keyof FarmRecord | "batchId">): Promise<string> {
  if (batch.status === "completed" || batch.status === "archived") throw new Error("This batch is closed. Ordinary sales cannot be added.");
  const reference = doc(farmCollection(uid, accountId, "sales"));
  if (input.productType === "live_birds" && input.unit === "birds") {
    const available = await currentBirdsFromLocal(uid, accountId, batch);
    if (input.quantity > available) throw new Error(`Only ${available} birds are currently available.`);
  }
  const created = now();
  const totalValue = moneyAmount(input.totalValue); const paymentReceived = moneyAmount(input.paymentReceived); const normalizedOutstanding = moneyAmount(totalValue - paymentReceived);
  const sale = { ...input, totalValue, paymentReceived, outstanding: normalizedOutstanding, pricePerUnit: moneyAmount(input.pricePerUnit), paymentStatus: normalizedOutstanding === 0 ? "paid" : paymentReceived > 0 ? "partially_paid" : "unpaid", id: reference.id, batchId: batch.id, ownerId: uid, accountId, createdAt: created, updatedAt: created };
  const changes: import("@/services/farmLocalDatabase").FarmChange[] = [{ collectionName: "sales", id: reference.id, record: sale, operation: "sale" }];
  if (paymentReceived > 0) {
    const transactionId = `sale_${reference.id}`;
    changes.push({ collectionName: "transactions", id: transactionId, queue: false, record: { id: transactionId, ownerId: uid, accountId, date: input.paymentDate ?? input.date, direction: "inflow", category: "sale_payment", amount: paymentReceived, description: `Payment received for ${batch.name}`, sourceId: reference.id, createdAt: created, updatedAt: created } });
  }
  await commitLocalFarmChanges(uid, accountId, changes);
  return reference.id;
}

export async function saveExpense(uid: string, accountId: string, input: Omit<Expense, keyof FarmRecord>): Promise<string> {
  if (input.batchId) {
    const batch = await getLocalFarmRecord<Batch>(uid, accountId, "batches", input.batchId);
    if (batch?.status === "completed" || batch?.status === "archived") throw new Error("This batch is closed. Ordinary expenses cannot be added.");
  }
  const reference = doc(farmCollection(uid, accountId, "expenses")); const created = now();
  const expense = { ...input, amount: moneyAmount(input.amount), amountPaid: moneyAmount(input.amountPaid), id: reference.id, ownerId: uid, accountId, createdAt: created, updatedAt: created };
  const changes: import("@/services/farmLocalDatabase").FarmChange[] = [{ collectionName: "expenses", id: reference.id, record: expense, operation: "expense" }];
  if (input.amountPaid > 0) {
    const transactionId = `expense_${reference.id}`;
    changes.push({ collectionName: "transactions", id: transactionId, queue: false, record: { id: transactionId, ownerId: uid, accountId, date: input.date, direction: "outflow", category: input.category, amount: moneyAmount(input.amountPaid), description: input.description, sourceId: reference.id, createdAt: created, updatedAt: created } });
  }
  await commitLocalFarmChanges(uid, accountId, changes);
  return reference.id;
}

export async function savePurchaseCategory(uid: string, accountId: string, input: Omit<import("@/types/farm").PurchaseCategoryDefinition, keyof FarmRecord>): Promise<string> {
  const normalized = input.name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) throw new Error("Enter a category name.");
  const id = `custom_${normalized}`;
  const existing = await getLocalFarmRecord(uid, accountId, "purchaseCategories", id);
  if (existing) throw new Error("A category with this name already exists.");
  const created = now();
  await commitLocalFarmChanges(uid, accountId, [{ collectionName: "purchaseCategories", id, record: { ...input, name: input.name.trim(), id, ownerId: uid, accountId, createdAt: created, updatedAt: created } }]);
  return id;
}

export async function savePurchase(uid: string, accountId: string, input: Omit<import("@/types/farm").Purchase, keyof FarmRecord | "allocations" | "unallocatedCost" | "unallocatedQuantity"> & { batchId?: string; newInventoryItem?: boolean; idempotencyKey?: string }): Promise<string> {
  if (input.idempotencyKey && !/^[A-Za-z0-9_-]{1,100}$/.test(input.idempotencyKey)) throw new Error("Invalid purchase reference.");
  const reference = input.idempotencyKey ? farmDocument(uid, accountId, "purchases", `purchase_${input.idempotencyKey}`) : doc(farmCollection(uid, accountId, "purchases"));
  if (await getLocalFarmRecord(uid, accountId, "purchases", reference.id)) return reference.id;
  let selectedBatch: Batch | null = null;
  if (input.batchId) {
    selectedBatch = await getLocalFarmRecord<Batch>(uid, accountId, "batches", input.batchId);
    const batch = selectedBatch;
    if (batch?.status === "completed" || batch?.status === "archived") throw new Error("This batch is closed. Do not allocate new purchases to it.");
  }
  const created = now();
  const { newInventoryItem, idempotencyKey: _idempotencyKey, ...purchaseInput } = input;
  const totalCost = moneyAmount(input.totalCost);
  // A missing payment amount means no payment has been confirmed yet. Keep the
  // full purchase balance payable; selecting a payment method alone is not proof.
  const amountPaid = input.amountPaid == null ? 0 : moneyAmount(input.amountPaid);
  if (amountPaid != null && (amountPaid < 0 || amountPaid > totalCost)) throw new Error("Amount paid must be between zero and the purchase total.");
  const outstanding = moneyAmount(totalCost - amountPaid);
  const selectedItem = input.inventoryItemId ? await getLocalFarmRecord<import("@/types/farm").InventoryItem>(uid, accountId, "stock", input.inventoryItemId) : null;
  const inventoryTracked = input.inventoryTracked ?? selectedItem?.inventoryTracked ?? true;
  const financialClassification = input.financialClassification ?? selectedItem?.defaultFinancialClassification ?? "consumable";
  const itemType = input.itemType ?? selectedItem?.itemType ?? (financialClassification === "fixed_asset" ? "durable_equipment" : "consumable");
  let itemId = input.inventoryItemId;
  const changes: import("@/services/farmLocalDatabase").FarmChange[] = [];
  if (newInventoryItem) {
    const itemRef = doc(farmCollection(uid, accountId, "stock")); itemId = itemRef.id;
    changes.push({ collectionName: "stock", id: itemRef.id, record: { id: itemRef.id, ownerId: uid, accountId, name: input.itemName, category: input.category, categoryId: input.categoryId, itemType, inventoryTracked, defaultFinancialClassification: financialClassification, baseUnit: input.unit ?? "units", packageSize: input.packageWeight ?? input.packageVolume, location: input.location, active: true, createdAt: created, updatedAt: created } });
  }
  if (input.receiptStatus === "received" && inventoryTracked) {
    if (!Number.isFinite(input.quantity) || (input.quantity ?? 0) <= 0) throw new Error("Enter the quantity received before recording stock.");
    if (!itemId || !input.unit) throw new Error("Choose or create an inventory item and enter its quantity and unit before receiving stock.");
    const movementId = `purchase_received_${reference.id}`;
    changes.push({ collectionName: "stockMovements", id: movementId, record: { id: movementId, ownerId: uid, accountId, itemId, purchaseId: reference.id, date: input.date, type: "received", quantity: input.quantity, unit: input.unit, totalCost, unitCost: input.quantity ? totalCost / input.quantity : undefined, financialClassification, source: "purchase", reason: "Goods received", createdAt: created, updatedAt: created } });
  }
  const allocations = input.batchId && inventoryTracked && input.receiptStatus === "received" ? [{ id: `${reference.id}_${input.batchId}`, batchId: input.batchId, quantity: input.quantity, cost: totalCost, allocatedAt: created }] : [];
  if (allocations.length && itemId) {
    const movementId = `purchase_allocated_${reference.id}_${input.batchId}`;
    changes.push({ collectionName: "stockMovements", id: movementId, record: { id: movementId, ownerId: uid, accountId, itemId, purchaseId: reference.id, date: input.date, type: "allocated", quantity: input.quantity, unit: input.unit ?? "units", batchId: input.batchId, batchNameSnapshot: selectedBatch?.name, batchNumberSnapshot: selectedBatch?.batchNumber, totalCost, unitCost: input.quantity ? totalCost / input.quantity : undefined, financialClassification, source: "purchase", reason: "Stock allocated to batch; not consumed", createdAt: created, updatedAt: created } });
  }
  const namedAllocations = allocations.map((allocation) => ({ ...allocation, batchNameSnapshot: selectedBatch?.name, batchNumberSnapshot: selectedBatch?.batchNumber }));
  const record = { ...purchaseInput, itemType, inventoryTracked, financialClassification, inventoryItemId: itemId, totalCost, amountPaid, outstanding, allocations: namedAllocations, unallocatedQuantity: input.quantity == null ? undefined : Math.max(0, input.quantity - namedAllocations.reduce((sum, allocation) => sum + (allocation.quantity ?? 0), 0)), unallocatedCost: namedAllocations.length ? 0 : totalCost, id: reference.id, ownerId: uid, accountId, createdAt: created, updatedAt: created };
  changes.unshift({ collectionName: "purchases", id: reference.id, record });
  const cashId = `purchase_${reference.id}`;
  if (amountPaid > 0) changes.push({ collectionName: "transactions", id: cashId, record: { id: cashId, ownerId: uid, accountId, date: input.date, direction: "outflow", category: `purchase_${input.category}`, amount: amountPaid, description: input.itemName, sourceId: reference.id, createdAt: created, updatedAt: created } });
  if (financialClassification === "fixed_asset") {
    const assetId = `asset_purchase_${reference.id}`;
    const assetCategory = input.category === "heating" ? "heating" : input.category === "water" ? "water" : input.category === "buildings" ? "buildings" : input.category === "feeders_drinkers" ? "feeders_drinkers" : "other";
    changes.push({ collectionName: "assets", id: assetId, record: { id: assetId, ownerId: uid, accountId, purchaseId: reference.id, name: input.itemName, category: assetCategory, purchaseDate: input.date, inServiceDate: input.inServiceDate ?? input.date, supplier: input.supplier, originalCost: totalCost, estimatedValue: totalCost, quantity: input.quantity ?? 1, location: input.location, condition: input.assetCondition ?? "new", usefulLifeYears: input.usefulLifeYears, residualValue: input.residualValue, accumulatedDepreciation: 0, status: "active", notes: input.notes, createdAt: created, updatedAt: created } });
  }
  await commitLocalFarmChanges(uid, accountId, changes);
  return reference.id;
}

export async function recordStockAllocation(uid: string, accountId: string, input: { itemId: string; batchId: string; quantity: number; date: string; idempotencyKey: string }): Promise<string> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Enter a valid date and positive allocation quantity.");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.idempotencyKey)) throw new Error("Invalid stock allocation reference.");
  const movementId = `allocated_${input.idempotencyKey}`;
  if (await getLocalFarmRecord(uid, accountId, "stockMovements", movementId)) return movementId;
  const [item, batch, purchases, movements] = await Promise.all([
    getLocalFarmRecord<import("@/types/farm").InventoryItem>(uid, accountId, "stock", input.itemId),
    getLocalFarmRecord<Batch>(uid, accountId, "batches", input.batchId),
    getLocalFarmRecords<import("@/types/farm").Purchase>(uid, accountId, "purchases"),
    getLocalFarmRecords<import("@/types/farm").StockMovement>(uid, accountId, "stockMovements"),
  ]);
  if (!item?.active || item.inventoryTracked === false || (item.defaultFinancialClassification && item.defaultFinancialClassification !== "consumable")) throw new Error("Choose an active, quantity-tracked consumable item.");
  if (!batch || batch.status === "completed" || batch.status === "archived") throw new Error("Choose an active batch.");
  const balance = calculateInventoryBalances([item], purchases, movements).balances[0];
  if (!balance || balance.financialClassification !== "consumable") throw new Error("This item is not classified as consumable inventory.");
  if (balance.value == null || balance.averageUnitCost == null) throw new Error("Cost unavailable. Record or restore the purchase cost before allocating this stock.");
  if (input.quantity > balance.available + 1e-9) throw new Error(`Only ${balance.available} ${item.baseUnit} are available to allocate.`);
  const allocatedCost = moneyAmount(balance.averageUnitCost * input.quantity);
  const created = now();
  const record: import("@/types/farm").StockMovement = {
    id: movementId, ownerId: uid, accountId, itemId: item.id, batchId: batch.id, batchNameSnapshot: batch.name, batchNumberSnapshot: batch.batchNumber,
    date: input.date, type: "allocated", quantity: input.quantity, unit: item.baseUnit, totalCost: allocatedCost, unitCost: balance.averageUnitCost,
    financialClassification: "consumable", source: "batch_allocation", reason: "Stock issued from farm inventory to batch", createdAt: created, updatedAt: created,
  };
  await commitLocalFarmChanges(uid, accountId, [{ collectionName: "stockMovements", id: movementId, record }]);
  return movementId;
}

export async function recordStockReturn(uid: string, accountId: string, input: { itemId: string; batchId: string; quantity: number; date: string; idempotencyKey: string; reversesMovementId?: string; notes?: string }): Promise<string> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^[A-Za-z0-9_-]{1,100}$/.test(input.idempotencyKey)) throw new Error("Enter a valid return date, quantity, and reference.");
  const movementId = `returned_${input.idempotencyKey}`;
  if (await getLocalFarmRecord(uid, accountId, "stockMovements", movementId)) return movementId;
  const [item, batch, purchases, movements] = await Promise.all([
    getLocalFarmRecord<import("@/types/farm").InventoryItem>(uid, accountId, "stock", input.itemId),
    getLocalFarmRecord<Batch>(uid, accountId, "batches", input.batchId),
    getLocalFarmRecords<import("@/types/farm").Purchase>(uid, accountId, "purchases"),
    getLocalFarmRecords<import("@/types/farm").StockMovement>(uid, accountId, "stockMovements"),
  ]);
  if (!item || !batch) throw new Error("The item or batch is unavailable.");
  const allocated = calculateBatchAllocatedStock(item.id, batch.id, purchases, movements, item);
  if (input.quantity > allocated.quantity + 1e-9) throw new Error(`Only ${allocated.quantity} ${item.baseUnit} remain issued to this batch.`);
  if (allocated.averageUnitCost == null) throw new Error("Cost unavailable for this batch stock; review its purchase record before returning it.");
  const created = now(); const totalCost = moneyAmount(allocated.averageUnitCost * input.quantity);
  const record: import("@/types/farm").StockMovement = { id: movementId, ownerId: uid, accountId, itemId: item.id, batchId: batch.id, batchNameSnapshot: batch.name, batchNumberSnapshot: batch.batchNumber, reversesMovementId: input.reversesMovementId, date: input.date, type: "returned", quantity: input.quantity, unit: item.baseUnit, totalCost, unitCost: totalCost / input.quantity, financialClassification: "consumable", source: "batch_return", reason: "Unused stock returned from batch", notes: input.notes, createdAt: created, updatedAt: created };
  await commitLocalFarmChanges(uid, accountId, [{ collectionName: "stockMovements", id: movementId, record }]);
  return movementId;
}

export async function recordStockAdjustment(uid: string, accountId: string, input: { itemId: string; quantity: number; date: string; idempotencyKey: string; totalCost?: number; openingBalance?: boolean; notes?: string }): Promise<string> {
  if (!Number.isFinite(input.quantity) || input.quantity === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^[A-Za-z0-9_-]{1,100}$/.test(input.idempotencyKey)) throw new Error("Enter a valid adjustment date, non-zero quantity, and reference.");
  const movementId = `adjustment_${input.idempotencyKey}`;
  if (await getLocalFarmRecord(uid, accountId, "stockMovements", movementId)) return movementId;
  const [item, purchases, movements] = await Promise.all([
    getLocalFarmRecord<import("@/types/farm").InventoryItem>(uid, accountId, "stock", input.itemId),
    getLocalFarmRecords<import("@/types/farm").Purchase>(uid, accountId, "purchases"),
    getLocalFarmRecords<import("@/types/farm").StockMovement>(uid, accountId, "stockMovements"),
  ]);
  if (!item?.active || item.inventoryTracked === false || item.defaultFinancialClassification === "fixed_asset") throw new Error("Choose an active consumable inventory item.");
  const balance = calculateInventoryBalances([item], purchases, movements).balances[0];
  if (input.quantity < 0 && -input.quantity > (balance?.available ?? 0) + 1e-9) throw new Error(`Only ${balance?.available ?? 0} ${item.baseUnit} are available to remove.`);
  const derivedCost = input.quantity < 0 && balance?.averageUnitCost != null ? balance.averageUnitCost * -input.quantity : undefined;
  const totalCost = input.totalCost == null ? derivedCost : input.totalCost;
  if (totalCost == null || !Number.isFinite(totalCost) || totalCost < 0 || (input.quantity > 0 && totalCost === 0)) throw new Error("Cost unavailable. Enter the value of added or opening stock before saving this adjustment.");
  const created = now(); const amount = moneyAmount(totalCost);
  const record: import("@/types/farm").StockMovement = { id: movementId, ownerId: uid, accountId, itemId: item.id, date: input.date, type: "adjustment", quantity: input.quantity, unit: item.baseUnit, totalCost: amount, unitCost: amount / Math.abs(input.quantity), financialClassification: "consumable", source: input.openingBalance ? "opening_balance" : "stock_adjustment", reason: input.openingBalance ? "Opening stock balance" : "Inventory quantity correction", notes: input.notes, createdAt: created, updatedAt: created };
  await commitLocalFarmChanges(uid, accountId, [{ collectionName: "stockMovements", id: movementId, record }]);
  return movementId;
}

export async function recordStockConsumption(uid: string, accountId: string, input: { itemId: string; quantity: number; unit: string; date: string; batchId: string; idempotencyKey: string }): Promise<string> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || !input.unit.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Enter a valid date, quantity, and unit.");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.idempotencyKey)) throw new Error("Invalid stock movement reference.");
  const movementId = `consumed_${input.idempotencyKey}`;
  if (await getLocalFarmRecord(uid, accountId, "stockMovements", movementId)) return movementId;
  const item = await getLocalFarmRecord<import("@/types/farm").InventoryItem>(uid, accountId, "stock", input.itemId);
  if (!item?.active || item.inventoryTracked === false) throw new Error("This item is not active and quantity-tracked.");
  const batch = await getLocalFarmRecord<Batch>(uid, accountId, "batches", input.batchId);
  if (!batch || batch.status === "completed" || batch.status === "archived") throw new Error("Choose an active batch for this stock usage.");
  const [purchases, movements] = await Promise.all([
    getLocalFarmRecords<import("@/types/farm").Purchase>(uid, accountId, "purchases"),
    getLocalFarmRecords<import("@/types/farm").StockMovement>(uid, accountId, "stockMovements"),
  ]);
  const batchStock = calculateBatchAllocatedStock(item.id, input.batchId, purchases, movements, item);
  if (input.quantity > batchStock.quantity + 1e-9) throw new Error(`Only ${batchStock.quantity} ${item.baseUnit} are available in this batch allocation.`);
  if (batchStock.averageUnitCost == null) throw new Error("Cost unavailable for this batch allocation. Review the original purchase before recording usage.");
  const created = now();
  const record = { id: movementId, ownerId: uid, accountId, itemId: item.id, batchId: input.batchId, date: input.date, type: "consumed", quantity: input.quantity, unit: input.unit, totalCost: moneyAmount(batchStock.averageUnitCost * input.quantity), unitCost: batchStock.averageUnitCost, financialClassification: "consumable", source: "batch_usage", reason: "Recorded batch consumption", createdAt: created, updatedAt: created };
  await commitLocalFarmChanges(uid, accountId, [{ collectionName: "stockMovements", id: movementId, record }]);
  return movementId;
}

export async function saveSlaughter(uid: string, accountId: string, batch: Batch, input: Omit<SlaughterRecord, keyof FarmRecord | "batchId">): Promise<string> {
  if (batch.status === "completed" || batch.status === "archived") throw new Error("This batch is closed. Ordinary slaughter records cannot be added.");
  const available = await currentBirdsFromLocal(uid, accountId, batch);
  if (input.quantitySlaughtered > available) throw new Error(`Only ${available} birds are currently available.`);
  const reference = doc(farmCollection(uid, accountId, "slaughter")); const created = now();
  const record = { ...input, id: reference.id, batchId: batch.id, ownerId: uid, accountId, createdAt: created, updatedAt: created };
  await commitLocalFarmChanges(uid, accountId, [{ collectionName: "slaughter", id: reference.id, record, operation: "slaughter" }]);
  return reference.id;
}

export async function saveSalePayment(uid: string, accountId: string, sale: Sale, input: Omit<SalePayment, keyof FarmRecord | "saleId" | "batchId">): Promise<string> {
  const paymentRef = doc(farmCollection(uid, accountId, "payments"));
  const updatedAt = now();
  const amount = moneyAmount(input.amount);
  const payment = { ...input, amount, id: paymentRef.id, saleId: sale.id, batchId: sale.batchId, ownerId: uid, accountId, createdAt: updatedAt, updatedAt: updatedAt };
  if (amount <= 0 || amount > sale.outstanding) throw new Error(`Payment must be greater than zero and no more than ${sale.outstanding.toFixed(2)} outstanding.`);
  const received = moneyAmount(sale.paymentReceived + amount);
  const outstanding = moneyAmount(sale.totalValue - received);
  const saleUpdate = { ...sale, paymentReceived: received, outstanding: Math.max(0, outstanding), paymentStatus: outstanding <= 0 ? "paid" : "partially_paid", updatedAt };
  const cashId = `payment_${paymentRef.id}`;
  await commitLocalFarmChanges(uid, accountId, [
    { collectionName: "sales", id: sale.id, record: saleUpdate, queue: false, protectRemote: true },
    { collectionName: "payments", id: paymentRef.id, record: payment, operation: "payment" },
    { collectionName: "transactions", id: cashId, record: { id: cashId, ownerId: uid, accountId, date: input.date, direction: "inflow", category: "sale_payment", amount, description: `Payment for sale ${sale.id}`, sourceId: sale.id, paymentId: paymentRef.id, createdAt: updatedAt, updatedAt }, queue: false },
  ]);
  return paymentRef.id;
}

function classifySyncError(error: unknown): { message: string; kind: string; retryable: boolean } {
  const cause = error as { code?: string; message?: string };
  const code = (cause?.code ?? "").toLowerCase();
  const message = cause?.message ?? "Farm data could not be synchronized.";
  if (code.includes("permission-denied")) return { message: "Firebase denied this write. Check the deployed Firestore rules and account ownership.", kind: "permission", retryable: false };
  if (code.includes("unauthenticated") || code.includes("user-token-expired")) return { message: "Sign in again to synchronize this farm account.", kind: "authentication", retryable: false };
  if (code.includes("invalid-argument") || code.includes("failed-precondition")) return { message, kind: "validation", retryable: false };
  return { message, kind: code || "network", retryable: true };
}

const pathData = (record: Record<string, unknown>, uid: string, accountId: string) => ({ ...record, ownerId: uid, accountId, createdAtServer: serverTimestamp(), updatedAtServer: serverTimestamp() });

async function syncQueuedChange(change: QueuedFarmChange): Promise<Record<string, unknown> | null> {
  const reference = farmDocument(change.uid, change.accountId, change.collectionName, change.recordId);
  if (change.operation === "delete") { await deleteDoc(reference); return null; }
  if (!change.record) throw new Error("This queued farm record has no saved data.");

  if (change.operation === "batch") {
    const saved = await runTransaction(firestore, async (transaction) => {
      const existing = await transaction.get(reference);
      if (existing.exists()) {
        const existingData = existing.data() as Record<string, unknown>;
        if (existingData.createdAt === change.record!.createdAt && existingData.batchNumber === change.record!.batchNumber) return existingData;
        throw new Error(`Batch number ${String(change.record!.batchNumber ?? "")} is already reserved in the cloud. Resolve the conflict before syncing.`);
      }
      transaction.set(reference, pathData(change.record!, change.uid, change.accountId));
      return change.record!;
    });
    return saved;
  }

  if (change.operation === "daily") {
    const batchId = String(change.record.batchId);
    const batchRef = farmDocument(change.uid, change.accountId, "batches", batchId);
    const saved = await runTransaction(firestore, async (transaction) => {
      const [batchSnapshot, previousSnapshot] = await Promise.all([transaction.get(batchRef), transaction.get(reference)]);
      if (!batchSnapshot.exists()) throw new Error("The batch is missing in Firebase. Keep the local record and create/sync its batch first.");
      const batchData = batchSnapshot.data() as unknown as Batch;
      const previous = previousSnapshot.exists() ? previousSnapshot.data() as unknown as DailyRecord : null;
      const oldNet = previous ? previous.additions - previous.deaths - previous.removals : 0;
      const newNet = Number(change.record!.additions) - Number(change.record!.deaths) - Number(change.record!.removals);
      const available = Number(batchData.currentBirdsAlive ?? batchData.initialQuantity) + newNet - oldNet;
      if (available < 0) throw new Error("This daily record conflicts with the cloud flock count. Resolve the count before retrying.");
      const record = { ...change.record!, ...pathData(change.record!, change.uid, change.accountId) };
      transaction.set(reference, record);
      transaction.update(batchRef, { currentBirdsAlive: available, updatedAt: String(change.record!.updatedAt), updatedAtServer: serverTimestamp() });
      return record;
    });
    return saved;
  }

  if (change.operation === "sale") {
    const sale = change.record as unknown as Sale;
    const batchRef = farmDocument(change.uid, change.accountId, "batches", sale.batchId);
    const cashId = `sale_${sale.id}`;
    const cashRef = farmDocument(change.uid, change.accountId, "transactions", cashId);
    const saved = await runTransaction(firestore, async (transaction) => {
      const [existingSnapshot, batchSnapshot] = await Promise.all([transaction.get(reference), transaction.get(batchRef)]);
      if (existingSnapshot.exists()) return existingSnapshot.data() as unknown as Record<string, unknown>;
      if (!batchSnapshot.exists()) throw new Error("The sale's batch does not exist in Firebase yet.");
      const batchData = batchSnapshot.data() as unknown as Batch;
      const removesBirds = sale.productType === "live_birds" && sale.unit === "birds";
      const currentBirds = Number(batchData.currentBirdsAlive ?? batchData.initialQuantity);
      if (removesBirds && sale.quantity > currentBirds) throw new Error(`Cloud conflict: only ${currentBirds} live birds remain.`);
      transaction.set(reference, pathData(change.record!, change.uid, change.accountId));
      if (removesBirds) transaction.update(batchRef, { currentBirdsAlive: currentBirds - sale.quantity, updatedAt: sale.updatedAt, updatedAtServer: serverTimestamp() });
      if (sale.paymentReceived > 0) transaction.set(cashRef, pathData({ id: cashId, ownerId: change.uid, accountId: change.accountId, date: sale.paymentDate ?? sale.date, direction: "inflow", category: "sale_payment", amount: sale.paymentReceived, description: `Payment received for batch ${sale.batchId}`, sourceId: sale.id, createdAt: sale.createdAt, updatedAt: sale.updatedAt }, change.uid, change.accountId));
      return change.record!;
    });
    return saved;
  }

  if (change.operation === "slaughter") {
    const entry = change.record as unknown as SlaughterRecord;
    const batchRef = farmDocument(change.uid, change.accountId, "batches", entry.batchId);
    const saved = await runTransaction(firestore, async (transaction) => {
      const [existingSnapshot, batchSnapshot] = await Promise.all([transaction.get(reference), transaction.get(batchRef)]);
      if (existingSnapshot.exists()) return existingSnapshot.data() as unknown as Record<string, unknown>;
      if (!batchSnapshot.exists()) throw new Error("The slaughter record's batch does not exist in Firebase yet.");
      const batchData = batchSnapshot.data() as unknown as Batch;
      const currentBirds = Number(batchData.currentBirdsAlive ?? batchData.initialQuantity);
      if (entry.quantitySlaughtered > currentBirds) throw new Error(`Cloud conflict: only ${currentBirds} birds remain.`);
      transaction.set(reference, pathData(change.record!, change.uid, change.accountId));
      transaction.update(batchRef, { currentBirdsAlive: currentBirds - entry.quantitySlaughtered, updatedAt: entry.updatedAt, updatedAtServer: serverTimestamp() });
      return change.record!;
    });
    return saved;
  }

  if (change.operation === "payment") {
    const payment = change.record as unknown as SalePayment;
    const saleRef = farmDocument(change.uid, change.accountId, "sales", payment.saleId);
    const cashId = `payment_${payment.id}`;
    const cashRef = farmDocument(change.uid, change.accountId, "transactions", cashId);
    const saved = await runTransaction(firestore, async (transaction) => {
      const [existingPayment, saleSnapshot] = await Promise.all([transaction.get(reference), transaction.get(saleRef)]);
      if (existingPayment.exists()) return existingPayment.data() as unknown as Record<string, unknown>;
      if (!saleSnapshot.exists()) throw new Error("The sale for this payment has not synchronized yet.");
      const currentSale = saleSnapshot.data() as unknown as Sale;
      if (payment.amount > currentSale.outstanding) throw new Error(`Cloud conflict: only ${currentSale.outstanding.toFixed(2)} remains outstanding on this sale.`);
      const outstanding = currentSale.outstanding - payment.amount;
      transaction.set(reference, pathData(change.record!, change.uid, change.accountId));
      transaction.update(saleRef, { paymentReceived: currentSale.paymentReceived + payment.amount, outstanding: Math.max(0, outstanding), paymentStatus: outstanding <= 0 ? "paid" : "partially_paid", updatedAt: payment.updatedAt, updatedAtServer: serverTimestamp() });
      transaction.set(cashRef, pathData({ id: cashId, ownerId: change.uid, accountId: change.accountId, date: payment.date, direction: "inflow", category: "sale_payment", amount: payment.amount, description: `Payment for sale ${payment.saleId}`, sourceId: payment.saleId, paymentId: payment.id, createdAt: payment.createdAt, updatedAt: payment.updatedAt }, change.uid, change.accountId));
      return change.record!;
    });
    const syncedSale = await getDoc(saleRef);
    if (syncedSale.exists()) await setLocalFarmRecordSynced(change.uid, change.accountId, "sales", payment.saleId, { ...(normalizeFirestoreValue(syncedSale.data()) as Record<string, unknown>), id: payment.saleId });
    return saved;
  }

  if (change.operation === "expense") {
    const expense = change.record as unknown as Expense;
    const cashId = `expense_${expense.id}`;
    const cashRef = farmDocument(change.uid, change.accountId, "transactions", cashId);
    await runTransaction(firestore, async (transaction) => {
      const existing = await transaction.get(reference);
      transaction.set(reference, pathData(change.record!, change.uid, change.accountId), { merge: true });
      if (expense.amountPaid > 0) transaction.set(cashRef, pathData({ id: cashId, ownerId: change.uid, accountId: change.accountId, date: expense.date, direction: "outflow", category: expense.category, amount: expense.amountPaid, description: expense.description, sourceId: expense.id, createdAt: expense.createdAt, updatedAt: expense.updatedAt }, change.uid, change.accountId));
      return existing.exists();
    });
    return change.record;
  }

  await setDoc(reference, pathData(change.record, change.uid, change.accountId), { merge: true });
  return change.record;
}

export type FarmSyncResult = { success: true; pendingCount: 0 } | { success: false; pendingCount: number; error: string };
const FARM_FIREBASE_PROJECT_ID = "murimi-9a3e7";
const activeSyncs = new Map<string, Promise<FarmSyncResult>>();
const deletingMurimiUsers = new Set<string>();
const deletingMurimiFarmAccounts = new Set<string>();
function verifyFarmFirebaseProject(): string | null {
  const actualProjectId = getApp().options.projectId;
  return actualProjectId === FARM_FIREBASE_PROJECT_ID ? null : `Murimi farm sync is configured for ${actualProjectId ?? "an unknown Firebase project"}; expected ${FARM_FIREBASE_PROJECT_ID}.`;
}

export function syncFarmAccount(uid: string, accountId: string, force = false, onProgress?: (state: "syncing" | "failed" | "synced", error?: string) => void): Promise<FarmSyncResult> {
  const key = `${uid}:${accountId}`;
  const projectError = verifyFarmFirebaseProject();
  if (projectError) return getFarmSyncSummary(uid, accountId).then((summary) => ({ success: false, pendingCount: summary.pendingCount, error: projectError }));
  if (deletingMurimiUsers.has(uid)) return getFarmSyncSummary(uid, accountId).then((summary) => ({ success: false, pendingCount: summary.pendingCount, error: "This Murimi account is being deleted." }));
  if (deletingMurimiFarmAccounts.has(key)) return getFarmSyncSummary(uid, accountId).then((summary) => ({ success: false, pendingCount: summary.pendingCount, error: "This farm account is being deleted." }));
  const current = activeSyncs.get(key); if (current) return current;
  const work: Promise<FarmSyncResult> = (async (): Promise<FarmSyncResult> => {
    try {
    onProgress?.("syncing");
    while (true) {
      const queued = await getDueFarmChanges(uid, accountId, force);
      if (!queued.length) break;
      for (const item of queued) {
        try {
          const record = await withTimeout(syncQueuedChange(item), 25000);
          if (item.operation === "delete") {
            await setLocalFarmRecordSynced(uid, accountId, item.collectionName, item.recordId);
          } else {
            await setLocalFarmRecordSynced(uid, accountId, item.collectionName, item.recordId, record ?? item.record ?? undefined);
          }
        } catch (error) {
          const classification = classifySyncError(error);
          await recordFarmSyncFailure(item.operationId, classification.message, classification.kind);
          const summary = await getFarmSyncSummary(uid, accountId);
          onProgress?.("failed", classification.message);
          return { success: false, pendingCount: summary.pendingCount, error: classification.message };
        }
      }
    }
    const summary = await getFarmSyncSummary(uid, accountId);
    if (summary.pendingCount > 0) {
      const error = summary.lastError ?? `${summary.pendingCount} saved changes are waiting to retry.`;
      onProgress?.("failed", error);
      return { success: false, pendingCount: summary.pendingCount, error };
    }
    await setFarmLastSyncedAt(uid, accountId);
    onProgress?.("synced");
    return { success: true, pendingCount: 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not complete farm synchronization.";
      let pendingCount = 0;
      try { pendingCount = (await getFarmSyncSummary(uid, accountId)).pendingCount; } catch { /* retain a useful sync error if local status is unavailable */ }
      onProgress?.("failed", message);
      return { success: false, pendingCount, error: message };
    }
  })().finally(() => { activeSyncs.delete(key); });
  activeSyncs.set(key, work);
  return work;
}

/** Calls the authenticated deletion function in Murimi's authoritative Firebase project. */
export async function requestMurimiAccountDeletion(uid: string, idToken: string): Promise<void> {
  if (getApp().options.projectId !== FARM_FIREBASE_PROJECT_ID) throw new Error(`Account deletion is available only from Firebase project ${FARM_FIREBASE_PROJECT_ID}.`);
  if (deletingMurimiUsers.has(uid)) throw new Error("Murimi account deletion is already in progress.");
  deletingMurimiUsers.add(uid);
  try {
    const pendingSyncs = [...activeSyncs.entries()].filter(([key]) => key.startsWith(`${uid}:`)).map(([, sync]) => sync);
    await Promise.all(pendingSyncs);
    const response = await fetch(`https://us-central1-${FARM_FIREBASE_PROJECT_ID}.cloudfunctions.net/deleteMurimiAccount`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ data: {} }),
    });
    const payload = await response.json().catch(() => null) as { result?: { deleted?: boolean }; error?: { message?: string; status?: string } } | null;
    if (!response.ok || payload?.result?.deleted !== true) throw new Error(payload?.error?.message ?? `Account deletion failed (${response.status}).`);
  } catch (error) {
    deletingMurimiUsers.delete(uid);
    throw error;
  }
}

/** Deletes only one Murimi farm account in the cloud and purges its local rows after confirmation. */
export async function deleteMurimiFarmAccount(uid: string, accountId: string, idToken: string): Promise<void> {
  if (getApp().options.projectId !== FARM_FIREBASE_PROJECT_ID) throw new Error(`Farm account deletion is available only from Firebase project ${FARM_FIREBASE_PROJECT_ID}.`);
  const key = `${uid}:${accountId}`;
  if (deletingMurimiFarmAccounts.has(key)) throw new Error("This farm account is already being deleted.");
  deletingMurimiFarmAccounts.add(key);
  try {
    const activeSync = activeSyncs.get(key);
    if (activeSync) await activeSync;
    const response = await fetch(`https://us-central1-${FARM_FIREBASE_PROJECT_ID}.cloudfunctions.net/deleteMurimiFarmAccount`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ data: { accountId } }),
    });
    const payload = await response.json().catch(() => null) as { result?: { deleted?: boolean }; error?: { message?: string } } | null;
    if (!response.ok || payload?.result?.deleted !== true) throw new Error(payload?.error?.message ?? `Farm account deletion failed (${response.status}).`);
    await purgeLocalFarmAccount(uid, accountId);
  } catch (error) {
    deletingMurimiFarmAccounts.delete(key);
    throw error;
  }
}

export function finishMurimiFarmAccountDeletion(uid: string, accountId: string): void {
  deletingMurimiFarmAccounts.delete(`${uid}:${accountId}`);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error("Cloud write timed out. The saved record remains queued for a safe retry."), { code: "timeout" })), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

export async function refreshFarmAccountFromCloud(uid: string, accountId: string): Promise<void> {
  const projectError = verifyFarmFirebaseProject();
  if (projectError) throw new Error(projectError);
  await Promise.all(FARM_COLLECTIONS.map(async (collectionName) => {
    const snapshot = await getDocsFromServer(query(farmCollection(uid, accountId, collectionName)));
    await saveRemoteFarmRecords(uid, accountId, collectionName, snapshot.docs.map(recordFromSnapshot), true);
  }));
  await setFarmLastSyncedAt(uid, accountId);
}

export async function getFarmAccountMetadata(uid: string): Promise<Array<{ id: string; number: number; name: string; currentRole: Record<string, unknown> }>> {
  const projectError = verifyFarmFirebaseProject();
  if (projectError) throw new Error(projectError);
  const snapshot = await getDocsFromServer(collection(firestore, "users", uid, "farmAccounts"));
  return snapshot.docs.flatMap((accountDoc) => {
    const data = accountDoc.data();
    if (data.ownerId !== uid || typeof data.name !== "string" || typeof data.number !== "number" || !data.currentRole || typeof data.currentRole !== "object") return [];
    return [{ id: accountDoc.id, number: data.number, name: data.name, currentRole: data.currentRole as Record<string, unknown> }];
  });
}

export async function saveFarmAccountMetadata(uid: string, account: { id: string; number: number; name: string; currentRole: Record<string, unknown> }): Promise<void> {
  const projectError = verifyFarmFirebaseProject();
  if (projectError) throw new Error(projectError);
  await setDoc(doc(firestore, "users", uid, "farmAccounts", account.id), {
    ownerId: uid,
    accountId: account.id,
    number: account.number,
    name: account.name,
    currentRole: account.currentRole,
    updatedAt: now(),
  }, { merge: true });
}

export async function createFarmRecordId(uid: string, accountId: string, collectionName: FarmCollection): Promise<string> {
  return doc(farmCollection(uid, accountId, collectionName)).id;
}

