import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { createFarmRecord, saveBatchRecord, savePurchase, savePurchaseCategory } from "@/services/farmRepository";
import type { Batch, EnterpriseType, FarmSupplier, InventoryItem, PurchaseCategoryDefinition, PurchaseItemType } from "@/types/farm";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { BatchPage } from "./_components";

const enterprises: { key: EnterpriseType; label: string }[] = [
  { key: "broiler", label: "Broilers" },
  { key: "pigs", label: "Pigs" },
  { key: "fish", label: "Fish" },
  { key: "crops", label: "Crops" },
  { key: "other", label: "Other" },
];

const optionalNumber = (value: string) => value.trim() ? Number(value) : undefined;

export default function CreateBatchScreen() {
  const { user, activeAccountId } = useAuth();
  const { records: batches, isLoading: batchesLoading } = useFarmRecords<Batch>("batches");
  const { records: suppliers } = useFarmRecords<FarmSupplier>("suppliers");
  const { records: inventoryItems } = useFarmRecords<InventoryItem>("stock");
  const { records: purchaseCategories } = useFarmRecords<PurchaseCategoryDefinition>("purchaseCategories");
  const [batchNumber, setBatchNumber] = useState("");
  const [name, setName] = useState("");
  const [enterprise, setEnterprise] = useState<EnterpriseType>("broiler");
  const [stockType, setStockType] = useState("Cobb");
  const [customBreed, setCustomBreed] = useState("");
  const [supplier, setSupplier] = useState("");
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [saveSupplier, setSaveSupplier] = useState(false);
  const [dateStarted, setDateStarted] = useState(localDate(new Date()));
  const [quantity, setQuantity] = useState("");
  const [paidQuantity, setPaidQuantity] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [transportCost, setTransportCost] = useState("");
  const [setupCost, setSetupCost] = useState("");
  const [showOptionalCosts, setShowOptionalCosts] = useState(false);
  const [showQuickPurchases, setShowQuickPurchases] = useState(false);
  const [quickCategoryId, setQuickCategoryId] = useState(""); const [quickItemId, setQuickItemId] = useState("");
  const [newQuickCategoryName, setNewQuickCategoryName] = useState(""); const [newQuickItemName, setNewQuickItemName] = useState(""); const [newQuickItemUnit, setNewQuickItemUnit] = useState("kg");
  const [savingQuickCategory, setSavingQuickCategory] = useState(false); const [savingQuickItem, setSavingQuickItem] = useState(false);
  const [quickQuantity, setQuickQuantity] = useState(""); const [quickAmountPerItem, setQuickAmountPerItem] = useState(""); const [quickUnitPrice, setQuickUnitPrice] = useState(""); const [quickAllocation, setQuickAllocation] = useState(""); const [quickNotes, setQuickNotes] = useState(""); const [quickPaid, setQuickPaid] = useState(true);
  const [quickLines, setQuickLines] = useState<QuickPurchaseLine[]>([]); const [createdBatchId, setCreatedBatchId] = useState("");
  const [duration, setDuration] = useState("");
  const [expectedSaleDate, setExpectedSaleDate] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [expectedPrice, setExpectedPrice] = useState("");
  const [plannedFeed, setPlannedFeed] = useState("");
  const [initialAverageWeight, setInitialAverageWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accent = useThemeColor("accent");
  const border = useThemeColor("border");
  const surface = useThemeColor("backgroundLight");
  const muted = useThemeColor("textlight");
  const danger = useThemeColor("bad");
  const quickCategories = purchaseCategories.filter((entry) => entry.active && entry.financialClassification === "consumable" && entry.inventoryTracked);
  const consumableItems = inventoryItems.filter((item) => item.active && item.inventoryTracked !== false && item.defaultFinancialClassification === "consumable" && (item.itemType ?? "consumable") === "consumable" && (!quickCategoryId || item.categoryId === quickCategoryId || item.category === quickCategoryId));
  const quickItem = inventoryItems.find((item) => item.id === quickItemId);
  const quickUsesPackages = !!quickItem && !isCountUnit(quickItem.baseUnit);
  const quickPackageSize = quickUsesPackages ? Number(quickAmountPerItem) : 1;
  const quickReceivedQuantity = (Number(quickQuantity) || 0) * (Number.isFinite(quickPackageSize) ? quickPackageSize : 0);
  const quickPricePerUnit = quickPackageSize > 0 ? (Number(quickUnitPrice) || 0) / quickPackageSize : 0;

  const addQuickCategory = async () => {
    const categoryName = newQuickCategoryName.trim();
    if (!user?.uid || !activeAccountId) return setError("Select a farm account first.");
    if (!categoryName) return setError("Enter a category name first.");
    if (quickCategories.some((entry) => entry.name.trim().toLocaleLowerCase() === categoryName.toLocaleLowerCase())) return setError("A consumable category with this name already exists.");
    setSavingQuickCategory(true); setError(null);
    try {
      const id = await savePurchaseCategory(user.uid, activeAccountId, { name: categoryName, financialClassification: "consumable", inventoryTracked: true, active: true });
      setQuickCategoryId(id); setQuickItemId(""); setNewQuickCategoryName("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save category."); }
    finally { setSavingQuickCategory(false); }
  };

  const addQuickInventoryItem = async () => {
    const itemName = newQuickItemName.trim(); const unit = newQuickItemUnit.trim();
    if (!user?.uid || !activeAccountId) return setError("Select a farm account first.");
    if (!quickCategoryId) return setError("Select or create a consumable category first.");
    if (!itemName || !unit) return setError("Enter an item name and its unit first.");
    if (consumableItems.some((entry) => entry.name.trim().toLocaleLowerCase() === itemName.toLocaleLowerCase())) return setError("This item already exists in the selected category.");
    setSavingQuickItem(true); setError(null);
    try {
      const category = purchaseCategories.find((entry) => entry.id === quickCategoryId);
      const id = await createFarmRecord(user.uid, activeAccountId, "stock", { name: itemName, category: quickCategoryId, categoryId: quickCategoryId, baseUnit: unit, itemType: "consumable", inventoryTracked: true, defaultFinancialClassification: "consumable", active: true });
      setQuickItemId(id); setNewQuickItemName(""); setQuickUnitPrice(""); setQuickQuantity(""); setQuickAllocation("");
      if (!category && !quickCategories.some((entry) => entry.id === quickCategoryId)) setError("Item saved. Category is syncing; you can continue in a moment.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save inventory item."); }
    finally { setSavingQuickItem(false); }
  };

  const addQuickPurchase = () => {
    const packageCount = Number(quickQuantity); const pricePerPackage = Number(quickUnitPrice); const amountPerItem = quickUsesPackages ? Number(quickAmountPerItem) : 1;
    const qty = packageCount * amountPerItem; const unitPrice = amountPerItem > 0 ? pricePerPackage / amountPerItem : 0; const allocated = quickAllocation.trim() ? Number(quickAllocation) : qty;
    if (!quickItem) return setError("Select a saved consumable inventory item.");
    if (!Number.isFinite(packageCount) || packageCount <= 0 || !Number.isFinite(amountPerItem) || amountPerItem <= 0 || !Number.isFinite(pricePerPackage) || pricePerPackage <= 0 || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(allocated) || allocated < 0 || allocated > qty) return setError("Enter package count, amount per package, and price per package. Allocation must be between zero and the total received quantity.");
    setQuickLines((previous) => [...previous, { key: `qp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, itemId: quickItem.id, itemName: quickItem.name, categoryId: quickItem.categoryId, category: quickItem.category, unit: quickItem.baseUnit, quantity: qty, unitPrice, packageCount, amountPerItem, pricePerItem: pricePerPackage, allocationQuantity: allocated, paid: quickPaid, notes: quickNotes.trim() || undefined }]);
    setQuickItemId(""); setQuickQuantity(""); setQuickAmountPerItem(""); setQuickUnitPrice(""); setQuickAllocation(""); setQuickNotes(""); setError(null);
  };

  /* eslint react-hooks/set-state-in-effect: "off" -- fill the editable batch number after the offline batch list loads. */
  useEffect(() => {
    if (batchNumber || batchesLoading) return;
    const highest = batches.map((batch) => (batch.batchNumber ?? batch.name).match(/(?:batch\s*)?(\d+)\s*$/i)?.[1]).filter((number): number is string => !!number).map(Number).filter(Number.isSafeInteger);
    setBatchNumber(String(Math.max(0, ...highest) + 1));
  }, [batches, batchNumber, batchesLoading]);

  const save = async () => {
    const initialQuantity = Number(quantity);
    const numberFields = [initialQuantity, transportCost.trim() ? Number(transportCost) : 0, setupCost.trim() ? Number(setupCost) : 0];
    if (!user?.uid || !activeAccountId) {
      setError("Sign in and select an account before creating a batch.");
      return;
    }
    if (!name.trim() || !Number.isInteger(initialQuantity) || initialQuantity <= 0 || !dateStarted.trim()) {
      setError("Enter a batch name, a valid starting bird count and a start date.");
      return;
    }
    if (enterprise === "broiler" && stockType === "Custom" && !customBreed.trim()) {
      setError("Enter the custom broiler breed name.");
      return;
    }
    if (numberFields.some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Costs and quantities must be zero or greater.");
      return;
    }
    const paidBirds = optionalNumber(paidQuantity);
    if (paidBirds !== undefined && (!Number.isInteger(paidBirds) || paidBirds < 0)) {
      setError("Birds paid for must be a whole number, zero or greater.");
      return;
    }
    const optionalFields = [costPerUnit, duration, targetWeight, expectedPrice, plannedFeed, initialAverageWeight]
      .map(optionalNumber)
      .filter((value): value is number => value !== undefined);
    if (optionalFields.some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Optional numeric values must also be zero or greater.");
      return;
    }
    setError(null);
    setIsSaving(true);
    const initialAverageWeightKg = optionalNumber(initialAverageWeight);
    const data: Omit<Batch, "id" | "ownerId" | "accountId" | "createdAt" | "updatedAt"> & { currentBirdsAlive: number } = {
      name: name.trim(),
      batchNumber: batchNumber.trim(),
      enterprise,
      stockType: enterprise === "broiler" ? stockType === "Custom" ? customBreed.trim() : stockType : stockType.trim() || enterprise,
      supplier: supplier.trim() || undefined,
      dateStarted,
      initialQuantity,
      paidQuantity: paidBirds ?? initialQuantity,
      costPerUnit: optionalNumber(costPerUnit),
      initialAverageWeightKg,
      transportCost: transportCost.trim() ? Number(transportCost) : 0,
      setupCost: setupCost.trim() ? Number(setupCost) : 0,
      expectedDurationDays: optionalNumber(duration),
      expectedSaleDate: expectedSaleDate.trim() || undefined,
      targetLiveWeightKg: optionalNumber(targetWeight),
      expectedSellingPrice: optionalNumber(expectedPrice),
      plannedFeedKg: optionalNumber(plannedFeed),
      notes: notes.trim() || undefined,
      status: "growing",
      productionComplete: false,
      sellingComplete: false,
      currentBirdsAlive: initialQuantity,
    };
    let batchIdToContinue = createdBatchId;
    try {
      let linkedSupplierId = supplierId;
      if (supplier.trim() && saveSupplier && !linkedSupplierId) {
        const matchingSupplier = suppliers.find((item) => item.name.trim().toLocaleLowerCase() === supplier.trim().toLocaleLowerCase());
        linkedSupplierId = matchingSupplier?.id ?? await createFarmRecord(user.uid, activeAccountId, "suppliers", { name: supplier.trim(), active: true });
        if (linkedSupplierId) setSupplierId(linkedSupplierId);
      }
      data.supplierId = linkedSupplierId;
      const id = batchIdToContinue || await saveBatchRecord(user.uid, activeAccountId, data);
      if (!batchIdToContinue) { batchIdToContinue = id; setCreatedBatchId(id); }
      for (const line of quickLines) {
        const item = inventoryItems.find((entry) => entry.id === line.itemId);
        if (!item) throw new Error(`Inventory item ${line.itemName} is no longer available. Batch ${batchNumber} is saved; update the quick purchase list and retry.`);
        const categoryName = purchaseCategories.find((entry) => entry.id === line.categoryId)?.name ?? line.category.replaceAll("_", " ");
        await savePurchase(user.uid, activeAccountId, {
          itemName: line.itemName, inventoryItemId: item.id, category: line.category, categoryId: line.categoryId, categoryNameSnapshot: categoryName,
          itemType: (item.itemType ?? "consumable") as PurchaseItemType, inventoryTracked: true, financialClassification: "consumable",
          date: localDate(new Date()), quantity: line.quantity, unit: line.unit,
          packageCount: line.packageCount, packageWeight: line.unit === "kg" ? line.amountPerItem : undefined, packageVolume: line.unit === "litres" ? line.amountPerItem : undefined,
          itemCount: line.packageCount, amountPerItem: line.amountPerItem, measureUnit: line.amountPerItem !== 1 ? line.unit : undefined,
          pricePerItem: line.pricePerItem, unitPrice: line.unitPrice,
          totalCost: Math.round(line.packageCount * line.pricePerItem * 100) / 100, amountPaid: line.paid ? Math.round(line.packageCount * line.pricePerItem * 100) / 100 : 0,
          fullyPaid: line.paid, outstanding: line.paid ? 0 : Math.round(line.packageCount * line.pricePerItem * 100) / 100,
          receiptStatus: "received",
          batchId: line.allocationQuantity > 0 ? id : undefined, allocationQuantity: line.allocationQuantity,
          notes: line.notes, idempotencyKey: `${id}_${line.key}`,
        });
      }
      Alert.alert("Batch created", `${name.trim()} is saved to your farm account.`);
      router.replace({ pathname: "/Batches/BatchDetails" as never, params: { batchId: id } });
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Unable to save this batch. Please try again."}${batchIdToContinue ? ` Batch ${batchNumber} was saved. Fix the item issue and tap Save batch again to resume its purchases.` : ""}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <BatchPage title="Create batch">
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <ThemedText color={muted}>Enter what you know now. Optional details can be added later.</ThemedText>
        <ThemedText type="defaultSemiBold">Enterprise</ThemedText>
        <View style={styles.choices}>
          {enterprises.map((item) => {
            const selected = enterprise === item.key;
            return <TouchableOpacity key={item.key} onPress={() => setEnterprise(item.key)} style={[styles.choice, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? "#FFFFFF" : muted} style={styles.choiceText}>{item.label}</ThemedText></TouchableOpacity>;
          })}
        </View>
        <FarmField label="Batch name" value={name} onChangeText={setName} placeholder="For example, Broilers July" />
        <FarmField label="Batch number" value={batchNumber} onChangeText={setBatchNumber} keyboardType="number-pad" placeholder="Suggested automatically; editable" />
        {enterprise === "broiler" ? <>
          <ThemedText type="defaultSemiBold">Broiler breed</ThemedText>
          <View style={styles.choices}>{["Cobb", "Ross", "Custom"].map((breed) => {
            const selected = stockType === breed;
            return <TouchableOpacity key={breed} onPress={() => setStockType(breed)} style={[styles.choice, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? "#FFFFFF" : muted} style={styles.choiceText}>{breed}</ThemedText></TouchableOpacity>;
          })}</View>
          {stockType === "Custom" && <FarmField label="Custom broiler breed" value={customBreed} onChangeText={setCustomBreed} placeholder="Enter breed name" />}
        </> : <FarmField label="Breed or stock type" value={stockType} onChangeText={setStockType} placeholder="Stock type" />}
        <FarmField label="Supplier (optional)" value={supplier} onChangeText={(value) => { setSupplier(value); setSupplierId(undefined); }} placeholder="Supplier name" />
        {suppliers.filter((item) => item.active).length > 0 && <>
          <ThemedText type="tiny" color={muted}>Saved suppliers</ThemedText>
          <View style={styles.choices}>{suppliers.filter((item) => item.active).map((item) => {
            const selected = supplierId === item.id;
            return <TouchableOpacity key={item.id} onPress={() => { setSupplier(item.name); setSupplierId(item.id); setSaveSupplier(false); }} style={[styles.choice, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? "#FFFFFF" : muted} style={styles.choiceText}>{item.name}</ThemedText></TouchableOpacity>;
          })}</View>
        </>}
        <TouchableOpacity onPress={() => setSaveSupplier(!saveSupplier)} style={[styles.optionalToggle, { borderColor: border, backgroundColor: surface }]} disabled={!!supplierId || !supplier.trim()}><ThemedText type="tiny" color={supplierId ? accent : muted}>{supplierId ? "Saved supplier · linked by ID" : `${saveSupplier ? "☑" : "☐"} Save supplier for future batches`}</ThemedText></TouchableOpacity>
        <FarmDatePicker label="Arrival / start date" value={dateStarted} onChange={setDateStarted} />
        <FarmField label="Initial birds placed" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="Required" />
        <TouchableOpacity onPress={() => setShowOptionalCosts(!showOptionalCosts)} style={[styles.optionalToggle, { borderColor: border, backgroundColor: surface }]}><ThemedText type="defaultSemiBold" color={accent}>{showOptionalCosts ? "− Hide optional initial costs" : "+ Add initial costs (optional)"}</ThemedText></TouchableOpacity>
        {showOptionalCosts && <><FarmField label="Birds paid for (optional)" value={paidQuantity} onChangeText={setPaidQuantity} keyboardType="number-pad" placeholder="Leave blank if same as birds placed" /><ThemedText type="tiny" color={muted}>Use this when you received extra birds that were not charged. Chick cost is based on birds paid for, not birds placed.</ThemedText><FarmField label="Cost per chick (optional)" value={costPerUnit} onChangeText={setCostPerUnit} keyboardType="decimal-pad" placeholder="0.00" /><FarmField label="Transport cost (optional)" value={transportCost} onChangeText={setTransportCost} keyboardType="decimal-pad" placeholder="0.00" /><FarmField label="Initial setup costs (optional)" value={setupCost} onChangeText={setSetupCost} keyboardType="decimal-pad" placeholder="0.00" /></>}
        <TouchableOpacity onPress={() => { setShowQuickPurchases(!showQuickPurchases); setShowOptionalCosts(true); }} style={[styles.optionalToggle, { borderColor: border, backgroundColor: surface }]}><ThemedText type="defaultSemiBold" color={accent}>{showQuickPurchases ? "− Hide quick consumable purchases" : "+ Add consumable purchases (optional)"}</ThemedText></TouchableOpacity>
        {showQuickPurchases ? <View style={styles.quickCard}>
          <ThemedText type="tiny" color={muted}>Quick purchases are saved as received purchases in the normal purchase ledger. You can allocate all or part of each quantity; allocated value uses the inventory weighted average cost.</ThemedText>
          <ThemedText type="defaultSemiBold">Consumable category</ThemedText><View style={styles.choices}>{quickCategories.map((entry) => <TouchableOpacity key={entry.id} onPress={() => { setQuickCategoryId(entry.id); setQuickItemId(""); }} style={[styles.choice, { backgroundColor: quickCategoryId === entry.id ? accent : surface, borderColor: quickCategoryId === entry.id ? accent : border }]}><ThemedText type="tiny" color={quickCategoryId === entry.id ? "#fff" : muted}>{entry.name}</ThemedText></TouchableOpacity>)}</View>
          <View style={styles.quickCreateRow}><View style={styles.quickCreateInput}><FarmField label="New consumable category" value={newQuickCategoryName} onChangeText={setNewQuickCategoryName} placeholder="e.g. Feed" /></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Save consumable category" disabled={savingQuickCategory} onPress={() => void addQuickCategory()} style={[styles.quickAddButton, { backgroundColor: accent, opacity: savingQuickCategory ? 0.6 : 1 }]}><ThemedText color="#fff">Save</ThemedText></TouchableOpacity></View>
          {quickCategoryId ? <><ThemedText type="defaultSemiBold">Consumable item in this category</ThemedText><View style={styles.choices}>{consumableItems.map((item) => <TouchableOpacity key={item.id} onPress={() => { setQuickItemId(item.id); setQuickAmountPerItem(isCountUnit(item.baseUnit) ? "1" : ""); setQuickQuantity(""); setQuickUnitPrice(""); setQuickAllocation(""); }} style={[styles.choice, { backgroundColor: quickItemId === item.id ? accent : surface, borderColor: quickItemId === item.id ? accent : border }]}><ThemedText type="tiny" color={quickItemId === item.id ? "#fff" : muted}>{item.name} · {item.baseUnit}</ThemedText></TouchableOpacity>)}{!consumableItems.length ? <ThemedText type="tiny" color={muted}>No saved consumable items in this category yet.</ThemedText> : null}</View>
          <View style={styles.quickCreateRow}><View style={styles.quickCreateInput}><FarmField label="New inventory item" value={newQuickItemName} onChangeText={setNewQuickItemName} placeholder="e.g. Broiler starter" /></View><View style={styles.quickUnitInput}><FarmField label="Unit" value={newQuickItemUnit} onChangeText={setNewQuickItemUnit} placeholder="kg" /></View></View><FarmButton label={savingQuickItem ? "Saving item…" : "Save item in this category"} secondary onPress={() => void addQuickInventoryItem()} disabled={savingQuickItem} />
          </> : <ThemedText type="tiny" color={muted}>Choose or create a category to add its consumable items.</ThemedText>}
          {quickItem ? <><FarmField label={quickUsesPackages ? "Number of bags / packages" : `Quantity (${quickItem.baseUnit})`} value={quickQuantity} onChangeText={setQuickQuantity} keyboardType="decimal-pad" placeholder={quickUsesPackages ? "e.g. 3 bags" : "e.g. 50"} />{quickUsesPackages ? <FarmField label={`Amount in each package (${quickItem.baseUnit})`} value={quickAmountPerItem} onChangeText={setQuickAmountPerItem} keyboardType="decimal-pad" placeholder={quickItem.baseUnit === "kg" ? "e.g. 50 kg per bag" : `Amount per package in ${quickItem.baseUnit}`} /> : null}<FarmField label={quickUsesPackages ? "Price for one bag / package" : `Price per ${quickItem.baseUnit}`} value={quickUnitPrice} onChangeText={setQuickUnitPrice} keyboardType="decimal-pad" placeholder={quickUsesPackages ? "e.g. 25.00 per bag" : "e.g. 0.80 each"} />{quickUsesPackages ? <ThemedText type="tiny" color={muted}>Received: {quickReceivedQuantity || 0} {quickItem.baseUnit} · calculated price: {money(quickPricePerUnit)} / {quickItem.baseUnit} · purchase total: {money((Number(quickQuantity) || 0) * (Number(quickUnitPrice) || 0))}</ThemedText> : <ThemedText type="tiny" color={muted}>Purchase total: {money((Number(quickQuantity) || 0) * (Number(quickUnitPrice) || 0))}</ThemedText>}<FarmField label={`Quantity allocated to this batch (${quickItem.baseUnit}; blank = all)`} value={quickAllocation} onChangeText={setQuickAllocation} keyboardType="decimal-pad" placeholder={quickReceivedQuantity ? String(quickReceivedQuantity) : "All received quantity"} /><FarmField label="Purchase description (optional)" value={quickNotes} onChangeText={setQuickNotes} placeholder="Short note" /><TouchableOpacity onPress={() => setQuickPaid(!quickPaid)} style={styles.optionalToggle}><ThemedText type="tiny" color={accent}>{quickPaid ? "☑ Paid in full" : "☐ Unpaid; keep supplier balance due"}</ThemedText></TouchableOpacity><FarmButton label="Add another item" onPress={addQuickPurchase} /></> : null}
          {quickLines.map((line) => <View key={line.key} style={[styles.quickLine, { borderColor: border, backgroundColor: surface }]}><ThemedText type="defaultSemiBold">{line.itemName} · {line.packageCount} package(s) · {line.quantity} {line.unit} · {money(line.packageCount * line.pricePerItem)}</ThemedText><ThemedText type="tiny" color={muted}>Price {money(line.pricePerItem)} / package · calculated {money(line.unitPrice)} / {line.unit} · allocated {line.allocationQuantity} {line.unit} ({money(line.allocationQuantity * line.unitPrice)}) · {line.allocationQuantity < line.quantity ? `remaining ${line.quantity - line.allocationQuantity} ${line.unit} in farm stock` : "all allocated"} · {line.paid ? "paid in full" : "supplier balance due"}</ThemedText>{!createdBatchId ? <TouchableOpacity onPress={() => setQuickLines((previous) => previous.filter((entry) => entry.key !== line.key))}><ThemedText type="tiny" color={danger}>Remove item</ThemedText></TouchableOpacity> : null}</View>)}
        </View> : null}
        <FarmField label="Expected duration in days (optional)" value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="For planning" />
        <FarmDatePicker label="Expected sale date (optional)" value={expectedSaleDate} onChange={setExpectedSaleDate} />
        <FarmField label="Target live weight in kg (optional)" value={targetWeight} onChangeText={setTargetWeight} keyboardType="decimal-pad" placeholder="0.00" />
        <FarmField label="Expected selling price per bird (optional)" value={expectedPrice} onChangeText={setExpectedPrice} keyboardType="decimal-pad" placeholder="0.00" />
        <FarmField label="Planned feed in kg (optional)" value={plannedFeed} onChangeText={setPlannedFeed} keyboardType="decimal-pad" placeholder="0" />
        <FarmField label="Initial average live weight (optional)" value={initialAverageWeight} onChangeText={setInitialAverageWeight} keyboardType="decimal-pad" placeholder="For FCR calculations" />
        <FarmField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Additional batch details" />
        {error && <ThemedText color={danger}>{error}</ThemedText>}
        <FarmButton label={isSaving ? "Saving batch and purchases…" : createdBatchId ? "Retry saving purchases" : "Save batch"} onPress={() => void save()} disabled={isSaving} />
      </ScrollView>
    </BatchPage>
  );
}

function localDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
type QuickPurchaseLine = { key: string; itemId: string; itemName: string; categoryId?: string; category: string; unit: string; quantity: number; unitPrice: number; packageCount: number; amountPerItem: number; pricePerItem: number; allocationQuantity: number; paid: boolean; notes?: string };
const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isCountUnit = (unit: string) => ["unit", "units", "item", "items", "piece", "pieces"].includes(unit.trim().toLocaleLowerCase());

const styles = StyleSheet.create({
  form: { padding: 18, paddingBottom: 32, gap: 16 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { borderWidth: 1, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 20 },
  choiceText: { fontWeight: "700" },
  optionalToggle: { minHeight: 46, borderWidth: 1, borderRadius: 13, padding: 13, justifyContent: "center" },
  quickCard: { gap: 11, borderWidth: 1, borderRadius: 14, padding: 12, borderColor: "#9CA3AF55" },
  quickCreateRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  quickCreateInput: { flex: 1 },
  quickUnitInput: { width: 86 },
  quickAddButton: { height: 46, minWidth: 64, marginBottom: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickLine: { gap: 5, borderWidth: 1, borderRadius: 11, padding: 10 },
});
