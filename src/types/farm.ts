export type EnterpriseType = "broiler" | "pigs" | "fish" | "crops" | "other";
export type BatchStatus = "growing" | "selling" | "partially_sold" | "completed" | "archived";
export type ExpenseCategory =
  | "initial_stock" | "feed" | "transport" | "medicine" | "bedding" | "heating"
  | "utilities" | "labour" | "processing" | "packaging" | "delivery" | "maintenance" | "other";

export type FarmRecord = {
  id: string;
  ownerId: string;
  accountId: string;
  /** UTC ISO-8601 audit timestamps. Transaction date fields remain farm-entered YYYY-MM-DD values. */
  createdAt: string;
  updatedAt: string;
};

export type Batch = FarmRecord & {
  name: string;
  batchNumber?: string;
  enterprise: EnterpriseType;
  stockType: string;
  supplier?: string;
  supplierId?: string;
  dateStarted: string;
  dateStartedEstimated?: boolean;
  initialQuantity: number;
  currentBirdsAlive?: number;
  costPerUnit?: number;
  initialAverageWeightKg?: number;
  transportCost: number;
  setupCost: number;
  location?: string;
  expectedDurationDays?: number;
  expectedSaleDate?: string;
  expectedSlaughterDate?: string;
  closedAt?: string;
  historical?: boolean;
  historicalData?: HistoricalBatchData;
  archiveReason?: string;
  archivedAt?: string;
  closureDisposition?: "none" | "retained" | "transferred" | "sold" | "explained";
  closureNotes?: string;
  targetLiveWeightKg?: number;
  expectedSellingPrice?: number;
  plannedFeedKg?: number;
  notes?: string;
  status: BatchStatus;
  productionComplete: boolean;
  sellingComplete: boolean;
};

export type HistoricalBatchData = {
  actualCompletionDate?: string;
  completionDateEstimated?: boolean;
  totalDeaths?: number;
  otherLosses?: number;
  birdsSold?: number;
  birdsSlaughtered?: number;
  birdsRemaining?: number;
  meatKgSold?: number;
  liveWeightKgSold?: number;
  averageSaleWeightKg?: number;
  feedConsumedKg?: number;
  feedCost?: number;
  chicksCost?: number;
  otherOperatingCosts?: number;
  revenue?: number;
  amountPaid?: number;
  outstanding?: number;
  discrepancyExplanation?: string;
  otherLossesReason?: string;
  feedRecords?: HistoricalFeedRecord[];
  expenseRecords?: HistoricalExpenseRecord[];
  salesRecords?: HistoricalSaleRecord[];
  unknownFields?: string[];
  source: "historical_summary";
};

export type HistoricalFeedRecord = { date?: string; dateEstimated?: boolean; description: string; quantityPurchased?: number; quantityConsumed?: number; quantityRemaining?: number; cost?: number; notes?: string };
export type HistoricalExpenseRecord = { date?: string; dateEstimated?: boolean; category: string; description: string; amount: number; quantity?: number; unit?: string; notes?: string };
export type HistoricalSaleRecord = { date?: string; dateEstimated?: boolean; customerCategoryId?: string; customerCategoryName?: string; customerId?: string; customerNameSnapshot?: string; quantity?: number; unit?: "birds" | "kg"; unitPrice?: number; totalAmount: number; paymentMethodId?: string; paymentMethodName?: string; amountPaid?: number; notes?: string };

export type DeathCause = {
  quantity: number;
  cause: string;
  causeCode?: string;
  symptoms?: string;
  actionTaken?: string;
  notes?: string;
  mortalityRecordId?: string;
};

export type MortalityRecord = FarmRecord & {
  batchId: string;
  batchNumber?: string;
  date: string;
  quantity: number;
  birdAgeDays?: number;
  causeCode: string;
  causeLabel: string;
  customCause?: string;
  symptoms: string[];
  otherSymptoms?: string;
  suspectedDisease?: string;
  diseaseStatus: "suspected" | "confirmed" | "unknown";
  diagnosisNotes?: string;
  confirmationSource?: string;
  actionTaken?: string;
  treatment?: string;
  treatmentStartDate?: string;
  treatmentEndDate?: string;
  treatmentCost?: number;
  outcome?: string;
  temperatureC?: number;
  humidityPercent?: number;
  ammoniaReading?: number;
  ventilationObservation?: string;
  waterAvailability?: string;
  feedAvailability?: string;
  beddingCondition?: string;
  notes?: string;
  dailyRecordId: string;
};

export type BatchProblem = FarmRecord & {
  batchId: string;
  date: string;
  time?: string;
  category: string;
  customCategory?: string;
  description: string;
  severity?: "low" | "moderate" | "high" | "critical";
  birdsAffected?: number;
  actionTaken?: string;
  outcome?: string;
  linkedMortalityId?: string;
  linkedExpenseId?: string;
  linkedStockRecordId?: string;
};

export type DailyRecord = FarmRecord & {
  batchId: string;
  date: string;
  openingCount: number;
  deaths: number;
  deathCauses: DeathCause[];
  removals: number;
  additions: number;
  feedType?: string;
  feedKg?: number;
  waterLitres?: number;
  heatingFuel?: string;
  heatingQuantity?: number;
  temperatureC?: number;
  humidityPercent?: number;
  notes?: string;
  closingCount: number;
};

export type WeightMeasurement = FarmRecord & {
  batchId: string;
  date: string;
  sampleSize: number;
  weightsKg: number[];
  averageKg: number;
  minimumKg: number;
  maximumKg: number;
};

export type Expense = FarmRecord & {
  batchId?: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  quantity?: number;
  unit?: string;
  supplier?: string;
  paymentStatus: "paid" | "partially_paid" | "unpaid";
  amountPaid: number;
  paymentMethod?: string;
  receiptReference?: string;
  notes?: string;
};

export type BuiltinPurchaseCategory = "feed" | "medicine" | "bedding" | "chicks" | "vaccines" | "disinfectants" | "equipment" | "other";
export type PurchaseCategory = BuiltinPurchaseCategory | (string & {});
export type PurchaseFinancialClassification = "consumable" | "fixed_asset" | "operating_expense";
export type PurchaseItemType = "consumable" | "durable_equipment" | "service" | "other";
export type PurchaseCategoryDefinition = FarmRecord & {
  name: string;
  financialClassification: PurchaseFinancialClassification;
  inventoryTracked: boolean;
  active: boolean;
};
export type FarmSupplier = FarmRecord & {
  name: string;
  active: boolean;
};
export type PurchaseAllocation = { id?: string; batchId: string; quantity?: number; cost?: number; allocatedAt: string };
export type Purchase = FarmRecord & {
  itemName: string;
  inventoryItemId?: string;
  category: PurchaseCategory;
  categoryId?: string;
  categoryNameSnapshot?: string;
  itemType?: PurchaseItemType;
  inventoryTracked?: boolean;
  financialClassification?: PurchaseFinancialClassification;
  assetCondition?: "new" | "good" | "fair" | "poor";
  inServiceDate?: string;
  usefulLifeYears?: number;
  residualValue?: number;
  date: string;
  quantity?: number;
  unit?: string;
  packageCount?: number;
  unitPrice?: number;
  packageWeight?: number;
  packageVolume?: number;
  totalCost: number;
  discount?: number;
  additionalCharges?: number;
  amountPaid?: number;
  outstanding?: number;
  paymentMethodId?: string;
  paymentMethodName?: string;
  receiptStatus?: "ordered" | "received";
  supplier?: string;
  invoiceReference?: string;
  notes?: string;
  location?: string;
  allocations: PurchaseAllocation[];
  unallocatedQuantity?: number;
  unallocatedCost: number;
};

export type InventoryItem = FarmRecord & {
  name: string;
  category: PurchaseCategory;
  categoryId?: string;
  itemType?: PurchaseItemType;
  inventoryTracked?: boolean;
  defaultFinancialClassification?: PurchaseFinancialClassification;
  baseUnit: string;
  packageSize?: number;
  location?: string;
  active: boolean;
  notes?: string;
};

export type StockMovement = FarmRecord & {
  itemId: string;
  date: string;
  type: "received" | "allocated" | "consumed" | "sold" | "wasted" | "adjustment" | "transfer";
  quantity: number;
  unit: string;
  batchId?: string;
  purchaseId?: string;
  financialClassification?: PurchaseFinancialClassification;
  unitCost?: number;
  totalCost?: number;
  source?: string;
  reason?: string;
  notes?: string;
};

export type Sale = FarmRecord & {
  batchId: string;
  date: string;
  productType: "live_birds" | "dressed_birds";
  productDescription?: string;
  quantity: number;
  unit: "birds" | "kg";
  pricePerUnit: number;
  totalValue: number;
  paymentReceived: number;
  outstanding: number;
  paymentStatus?: "paid" | "partially_paid" | "unpaid";
  customer?: string;
  customerId?: string;
  customerCategoryId?: string;
  customerCategoryName?: string;
  customerNameSnapshot?: string;
  paymentDate?: string;
  paymentMethod?: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  deliveryCost: number;
  notes?: string;
};

export type CustomerCategory = FarmRecord & { name: string; active: boolean };
export type FarmCustomer = FarmRecord & { name: string; categoryId: string; phone?: string; location?: string; notes?: string; active: boolean; categoryIds?: string[] };
export type FarmPaymentMethod = FarmRecord & { name: string; active: boolean; systemDefault?: boolean };

export type SalePayment = FarmRecord & {
  saleId: string;
  batchId: string;
  date: string;
  amount: number;
  method?: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  reference?: string;
  notes?: string;
};

export type SlaughterRecord = FarmRecord & {
  batchId: string;
  date: string;
  quantitySlaughtered: number;
  liveWeightKg: number;
  dressedWeightKg: number;
  saleableBirds: number;
  rejectedBirds: number;
  processingCost: number;
  packagingCost: number;
};

export type AssetCategory =
  | "land" | "buildings" | "fencing" | "water" | "feeders_drinkers" | "heating"
  | "scales" | "power" | "vehicles" | "machinery" | "other";

export type FarmAsset = FarmRecord & {
  name: string;
  category: AssetCategory;
  purchaseId?: string;
  description?: string;
  purchaseDate?: string;
  supplier?: string;
  originalCost: number;
  estimatedValue: number;
  quantity: number;
  location?: string;
  condition?: "new" | "good" | "fair" | "poor";
  usefulLifeYears?: number;
  depreciationMethod?: "none" | "straight_line";
  residualValue?: number;
  accumulatedDepreciation?: number;
  inServiceDate?: string;
  status?: "active" | "disposed" | "retired";
  notes?: string;
};

export type FarmPlan = FarmRecord & {
  name: string;
  category: "feed" | "medicine" | "batch" | "equipment" | "construction" | "payment" | "sale" | "other";
  amount: number;
  plannedDate: string;
  relatedBatchId?: string;
  priority: "low" | "normal" | "high";
  status: "planned" | "committed" | "partially_completed" | "completed" | "cancelled";
  actualAmount: number;
  notes?: string;
};

export type FinancialTransaction = FarmRecord & {
  date: string;
  direction: "inflow" | "outflow";
  category: string;
  amount: number;
  description: string;
  paymentMethod?: string;
  reference?: string;
};

export type BatchSummary = {
  birdsAlive: number;
  deaths: number;
  mortalityPercent: number | null;
  birdsSold: number;
  costsIncurred: number;
  feedKg: number;
  feedBags50Kg: number;
  averageLiveWeightKg: number | null;
  costPerLiveBird: number | null;
  costPerBirdPlaced: number | null;
  revenue: number;
  cashCollected: number;
  receivables: number;
  profit: number;
  profitMarginPercent: number | null;
  fcr: number | null;
  costPerBirdSold: number | null;
  costPerKgSold: number | null;
  missingHistoricalInputs: string[];
};
