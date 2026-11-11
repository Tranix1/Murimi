import { BatchPage } from "@/app/Batches/_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { createFarmRecord, ensureDefaultPaymentMethods, savePurchase, savePurchaseCategory, updateFarmRecord } from "@/services/farmRepository";
import type { Batch, FarmPaymentMethod, FarmSupplier, InventoryItem, PurchaseCategory, PurchaseCategoryDefinition, PurchaseFinancialClassification, PurchaseItemType } from "@/types/farm";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

type CapacityUnit = "kg" | "litres";
type Currency = "USD" | "ZWG" | "ZAR";
type PurchaseMeasure = import("@/types/farm").FarmRecord & { name: string; active: boolean };
const GENERAL_CATEGORY = "general";
const baseMeasures = ["kg", "litres", "metres"];
const genericUnits = ["", "unit", "units", "item", "items"];
const capacityUnits: CapacityUnit[] = ["kg", "litres"];
const currencies: { value: Currency; label: string }[] = [{ value: "USD", label: "USD" }, { value: "ZWG", label: "ZWG" }, { value: "ZAR", label: "Rand (ZAR)" }];
const numeric = (value: string) => value.replace(/[^0-9.]/g, "").replace(/(\..*?)\./g, "$1");
const round2 = (value: number) => Math.round(value * 100) / 100;
const fmt = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const newPurchaseRequestKey = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

export default function RecordPurchaseScreen() {
  const { user, activeAccountId } = useAuth();
  const { records: batches } = useFarmRecords<Batch>("batches");
  const { records: items } = useFarmRecords<InventoryItem>("stock");
  const { records: paymentMethods } = useFarmRecords<FarmPaymentMethod>("paymentMethods");
  const { records: customCategories } = useFarmRecords<PurchaseCategoryDefinition>("purchaseCategories");
  const { records: suppliers } = useFarmRecords<FarmSupplier>("suppliers");
  const { records: customMeasures } = useFarmRecords<PurchaseMeasure>("purchaseMeasures");
  const [category, setCategory] = useState<string>(GENERAL_CATEGORY); const [batchId, setBatchId] = useState(""); const [item, setItem] = useState("");
  const [inventoryItemId, setInventoryItemId] = useState(""); const [createItem, setCreateItem] = useState(true); const [savingItem, setSavingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null); const [editingItemName, setEditingItemName] = useState(""); const [itemActionsId, setItemActionsId] = useState<string | null>(null);
  const [itemType, setItemType] = useState<PurchaseItemType>("consumable"); const [inventoryTracked, setInventoryTracked] = useState(true); const [financialClassification, setFinancialClassification] = useState<PurchaseFinancialClassification>("consumable");
  const [newCategoryName, setNewCategoryName] = useState(""); const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null); const [editingCategoryName, setEditingCategoryName] = useState(""); const [categoryActionsId, setCategoryActionsId] = useState<string | null>(null); const [categoryBusy, setCategoryBusy] = useState(false);
  const [newCategoryHoldsAmount, setNewCategoryHoldsAmount] = useState(false); const [newCategoryCapacityUnit, setNewCategoryCapacityUnit] = useState<CapacityUnit>("litres");
  const [capacity, setCapacity] = useState(""); const [capacityUnit, setCapacityUnit] = useState<CapacityUnit>("litres");
  const [date, setDate] = useState(formatLocalDate(new Date())); const [quantity, setQuantity] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD"); const [exchangeRate, setExchangeRate] = useState("");
  const [measureUnit, setMeasureUnit] = useState(""); const [amountPerItem, setAmountPerItem] = useState(""); const [newMeasureName, setNewMeasureName] = useState(""); const [addingMeasure, setAddingMeasure] = useState(false); const [showCustomMeasure, setShowCustomMeasure] = useState(false);
  const [unitPrice, setUnitPrice] = useState(""); const [directTotal, setDirectTotal] = useState(""); const [additionalCharges, setAdditionalCharges] = useState("");
  const [supplierId, setSupplierId] = useState(""); const [supplierName, setSupplierName] = useState(""); const [newSupplierName, setNewSupplierName] = useState(""); const [addingSupplier, setAddingSupplier] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null); const [editingSupplierName, setEditingSupplierName] = useState(""); const [supplierActionsId, setSupplierActionsId] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [assetCondition, setAssetCondition] = useState<"new" | "good" | "fair" | "poor">("new"); const [inServiceDate, setInServiceDate] = useState(""); const [usefulLifeYears, setUsefulLifeYears] = useState(""); const [residualValue, setResidualValue] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(""); const [amountPaid, setAmountPaid] = useState(""); const [fullyPaid, setFullyPaid] = useState(true); const [receiptStatus, setReceiptStatus] = useState<"ordered" | "received">("received"); const [notes, setNotes] = useState("");
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const purchaseRequestKey = useRef(newPurchaseRequestKey());
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const bad = useThemeColor("bad");
  const activeMethods = paymentMethods.filter((method) => method.active);
  const activeSuppliers = suppliers.filter((entry) => entry.active);
  const availableItems = items.filter((stockItem) => stockItem.active && stockItem.category === category);
  const measureOptions = [...baseMeasures, ...customMeasures.filter((entry) => entry.active).map((entry) => entry.name)];
  const selectedDefinition = customCategories.find((entry) => entry.id === category);
  const needsCapacity = !!selectedDefinition?.requiresCapacity;
  const selectedInventoryItem = items.find((stockItem) => stockItem.id === inventoryItemId);
  const isFixedAsset = financialClassification === "fixed_asset";
  const noInventoryItemMode = !inventoryItemId && !inventoryTracked;
  const newInventoryItemMode = !inventoryItemId && inventoryTracked && createItem;
  const rateValue = currency === "USD" ? 1 : Number(exchangeRate);
  const rateValid = Number.isFinite(rateValue) && rateValue > 0;
  const countValue = Number(quantity) || 0; const price = Number(unitPrice) || 0; const chargesValue = Number(additionalCharges) || 0; const amountValue = Number(amountPerItem) || 0;
  const totalMeasured = measureUnit ? countValue * amountValue : countValue;
  const calculatedTotal = useMemo(() => Math.max(0, countValue * price + chargesValue), [countValue, price, chargesValue]);
  const totalEntered = directTotal.trim() ? Number(directTotal) : calculatedTotal;
  const totalUsd = rateValid && Number.isFinite(totalEntered) ? round2(totalEntered / rateValue) : 0;
  const paidEntered = fullyPaid ? totalEntered : amountPaid.trim() ? Number(amountPaid) : undefined;
  const outstandingEntered = paidEntered !== undefined ? Math.max(0, totalEntered - paidEntered) : undefined;
  const supplierBalance = outstandingEntered ?? totalEntered;
  const setPurchaseType = (value: PurchaseFinancialClassification) => {
    setFinancialClassification(value);
    setItemType(value === "fixed_asset" ? "durable_equipment" : value === "operating_expense" ? "service" : "consumable");
  };
  useEffect(() => { if (user?.uid && activeAccountId) void ensureDefaultPaymentMethods(user.uid, activeAccountId); }, [user?.uid, activeAccountId]);

  const save = async () => {
    if (savingRef.current) return;
    if (!user?.uid || !activeAccountId) return setError("Select a farm account first.");
    const qty = Number(quantity);
    const priceValue = unitPrice.trim() ? Number(unitPrice) : undefined;
    const paidValue = paidEntered;
    const extra = additionalCharges.trim() ? Number(additionalCharges) : 0;
    const capacityValue = needsCapacity ? Number(capacity) : undefined;
    const amountValueToSave = measureUnit ? Number(amountPerItem) : undefined;
    if (!item.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Enter an item name and a purchase date.");
    if (currency !== "USD" && !rateValid) return setError(`Enter the exchange rate (${currency} per 1 USD) as a number greater than zero.`);
    if (!quantity.trim() || !Number.isFinite(qty) || qty <= 0) return setError("Enter the number of items purchased as a number greater than zero.");
    if (measureUnit && (!amountPerItem.trim() || amountValueToSave === undefined || !Number.isFinite(amountValueToSave) || amountValueToSave <= 0)) return setError(`Enter the amount in each item (${measureUnit}), or choose None.`);
    if (!Number.isFinite(totalEntered) || totalEntered <= 0) return setError("Enter a price per item or a final total greater than zero.");
    if (needsCapacity && (!capacity.trim() || capacityValue === undefined || !Number.isFinite(capacityValue) || capacityValue <= 0)) return setError(`Enter how much one item in this category can hold (${capacityUnit}).`);
    const usefulLifeValue = usefulLifeYears.trim() ? Number(usefulLifeYears) : undefined; const residualValueNumber = residualValue.trim() ? Number(residualValue) : undefined;
    const serviceDate = inServiceDate.trim();
    if (serviceDate && (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || serviceDate < date)) return setError("In-service date must use YYYY-MM-DD and cannot be before the purchase date.");
    if ((priceValue !== undefined && (!Number.isFinite(priceValue) || priceValue < 0)) || (usefulLifeValue !== undefined && (!Number.isFinite(usefulLifeValue) || usefulLifeValue <= 0)) || (residualValueNumber !== undefined && (!Number.isFinite(residualValueNumber) || residualValueNumber < 0 || residualValueNumber > totalEntered)) || !Number.isFinite(extra) || extra < 0) return setError("Price, charges and asset details must be valid numbers.");
    if (paidValue !== undefined && (!Number.isFinite(paidValue) || paidValue < 0 || paidValue > totalEntered)) return setError("Amount paid must be between zero and the final total.");
    if (receiptStatus === "received" && inventoryTracked && !inventoryItemId && !createItem) return setError("Choose an inventory item, choose + New item, or choose No inventory item.");
    const totalCostUsd = round2(totalEntered / rateValue);
    const amountPaidUsd = paidValue !== undefined ? (fullyPaid ? totalCostUsd : round2(paidValue / rateValue)) : undefined;
    const outstandingUsd = amountPaidUsd !== undefined ? round2(Math.max(0, totalCostUsd - amountPaidUsd)) : undefined;
    savingRef.current = true; setSaving(true); setError("");
    try {
      const method = activeMethods.find((entry) => entry.id === paymentMethodId);
      const categoryName = selectedDefinition?.name ?? "General purchases";
      await savePurchase(user.uid, activeAccountId, {
        itemName: item.trim(), inventoryItemId: inventoryItemId || undefined, category: category as PurchaseCategory, categoryId: selectedDefinition?.id, categoryNameSnapshot: categoryName,
        itemType, inventoryTracked, financialClassification, assetCondition, inServiceDate: inServiceDate.trim() || undefined, usefulLifeYears: usefulLifeValue, residualValue: residualValueNumber !== undefined ? round2(residualValueNumber / rateValue) : undefined, date,
        quantity: measureUnit && amountValueToSave ? qty * amountValueToSave : qty, unit: measureUnit || "units",
        itemCount: qty, pricePerItem: priceValue !== undefined ? priceValue / rateValue : undefined, measureUnit: measureUnit || undefined, amountPerItem: amountValueToSave,
        capacityPerItem: capacityValue, capacityUnit: capacityValue !== undefined ? capacityUnit : undefined,
        totalCost: totalCostUsd, discount: 0, additionalCharges: round2(extra / rateValue),
        currency, exchangeRate: rateValue, originalTotalCost: totalEntered, originalAmountPaid: paidValue, originalOutstanding: outstandingEntered, originalPricePerItem: priceValue, originalAdditionalCharges: extra, fullyPaid,
        amountPaid: amountPaidUsd, outstanding: outstandingUsd, paymentMethodId: method?.id, paymentMethodName: method?.name,
        receiptStatus, supplier: supplierName || undefined, supplierId: supplierId || undefined, invoiceReference: invoice.trim() || undefined, notes: notes.trim() || undefined,
        batchId: isFixedAsset ? undefined : batchId || undefined, newInventoryItem: inventoryTracked && !selectedInventoryItem && createItem, idempotencyKey: purchaseRequestKey.current,
      });
      purchaseRequestKey.current = newPurchaseRequestKey();
      Alert.alert("Purchase saved", receiptStatus === "received" ? "The purchase and received stock movement were saved offline." : "The order was saved without increasing available stock.");
      router.replace("/Farm/Purchases" as never);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save purchase."); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const addCategory = async () => {
    if (!user?.uid || !activeAccountId || !newCategoryName.trim()) return setError("Enter a category name first.");
    const name = newCategoryName.trim();
    if (name.toLowerCase() === "general purchases" || customCategories.some((entry) => entry.active && entry.name.trim().toLowerCase() === name.toLowerCase())) return setError("A category with this name already exists.");
    setCreatingCategory(true); setError("");
    try {
      const id = await savePurchaseCategory(user.uid, activeAccountId, { name, financialClassification, inventoryTracked: financialClassification !== "operating_expense", requiresCapacity: newCategoryHoldsAmount, capacityUnit: newCategoryHoldsAmount ? newCategoryCapacityUnit : undefined, active: true });
      setCategory(id); setPurchaseType(financialClassification); setInventoryTracked(financialClassification !== "operating_expense"); setInventoryItemId("");
      setCapacity(""); setCapacityUnit(newCategoryHoldsAmount ? newCategoryCapacityUnit : "litres");
      setNewCategoryName(""); setNewCategoryHoldsAmount(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add category."); }
    finally { setCreatingCategory(false); }
  };

  const startCategoryEdit = (id: string, name: string) => { setEditingCategoryId(id); setEditingCategoryName(name); setError(""); };
  const cancelCategoryEdit = () => { setEditingCategoryId(null); setEditingCategoryName(""); };
  const saveCategoryName = async () => {
    const name = editingCategoryName.trim();
    if (!user?.uid || !activeAccountId || !editingCategoryId) return;
    if (!name) return setError("Enter a category name first.");
    if (customCategories.some((entry) => entry.active && entry.id !== editingCategoryId && entry.name.trim().toLowerCase() === name.toLowerCase())) return setError("A category with this name already exists.");
    setCategoryBusy(true); setError("");
    try { await updateFarmRecord(user.uid, activeAccountId, "purchaseCategories", editingCategoryId, { name }); setCategoryActionsId(null); cancelCategoryEdit(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not rename category."); }
    finally { setCategoryBusy(false); }
  };
  const deleteCategory = (id: string, name: string) => {
    Alert.alert("Delete category?", `This hides “${name}” for future purchases. Existing purchases and stock records will not change.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void (async () => {
        if (!user?.uid || !activeAccountId) return;
        setCategoryBusy(true); setError("");
        try { await updateFarmRecord(user.uid, activeAccountId, "purchaseCategories", id, { active: false }); setCategoryActionsId(null); if (category === id) { setCategory(GENERAL_CATEGORY); setPurchaseType("consumable"); setInventoryTracked(true); setInventoryItemId(""); } }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete category."); }
        finally { setCategoryBusy(false); }
      })() },
    ]);
  };

  const saveInventoryItem = async () => {
    const name = item.trim();
    if (!user?.uid || !activeAccountId) return setError("Select a farm account first.");
    if (!name) return setError("Enter the item name first, then save it.");
    if (availableItems.some((entry) => entry.name.trim().toLowerCase() === name.toLowerCase())) return setError("An item with this name already exists in this category. Select it in the Inventory item row.");
    setSavingItem(true); setError("");
    try {
      const id = await createFarmRecord(user.uid, activeAccountId, "stock", { name, category, baseUnit: measureUnit || "units", itemType, inventoryTracked: true, defaultFinancialClassification: financialClassification, active: true } as never);
      setInventoryItemId(id); setCreateItem(false); setInventoryTracked(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this item."); }
    finally { setSavingItem(false); }
  };

  const startItemEdit = (id: string, name: string) => { setEditingItemId(id); setEditingItemName(name); setError(""); };
  const saveItemName = async () => {
    const name = editingItemName.trim();
    if (!user?.uid || !activeAccountId || !editingItemId) return;
    if (!name) return setError("Enter an item name first.");
    if (items.some((entry) => entry.active && entry.id !== editingItemId && entry.category === category && entry.name.trim().toLowerCase() === name.toLowerCase())) return setError("An item with this name already exists in this category.");
    setCategoryBusy(true); setError("");
    try { await updateFarmRecord(user.uid, activeAccountId, "stock", editingItemId, { name }); if (inventoryItemId === editingItemId) setItem(name); setItemActionsId(null); setEditingItemId(null); setEditingItemName(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not rename item."); }
    finally { setCategoryBusy(false); }
  };
  const deleteItem = (id: string, name: string) => {
    Alert.alert("Delete item?", `This hides “${name}” for future purchases. Existing purchases and stock records will not change.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void (async () => {
        if (!user?.uid || !activeAccountId) return;
        setCategoryBusy(true); setError("");
        try { await updateFarmRecord(user.uid, activeAccountId, "stock", id, { active: false }); setItemActionsId(null); if (inventoryItemId === id) { setInventoryItemId(""); setItem(""); setCreateItem(true); } }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete item."); }
        finally { setCategoryBusy(false); }
      })() },
    ]);
  };

  const addMeasure = async () => {
    const name = newMeasureName.trim();
    if (!user?.uid || !activeAccountId) return setError("Select a farm account first.");
    if (!name) return setError("Enter a measure name first.");
    const existing = measureOptions.find((entry) => entry.toLowerCase() === name.toLowerCase());
    if (existing) { setMeasureUnit(existing); setNewMeasureName(""); setShowCustomMeasure(false); return; }
    setAddingMeasure(true); setError("");
    try {
      await createFarmRecord(user.uid, activeAccountId, "purchaseMeasures", { name, active: true });
      setMeasureUnit(name); setNewMeasureName(""); setShowCustomMeasure(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save measure."); }
    finally { setAddingMeasure(false); }
  };

  const addSupplier = async () => {
    const name = newSupplierName.trim();
    if (!user?.uid || !activeAccountId) return setError("Select a farm account first.");
    if (!name) return setError("Enter a supplier name first.");
    setAddingSupplier(true); setError("");
    try {
      const existing = activeSuppliers.find((entry) => entry.name.trim().toLowerCase() === name.toLowerCase());
      const id = existing?.id ?? await createFarmRecord(user.uid, activeAccountId, "suppliers", { name, active: true });
      setSupplierId(id); setSupplierName(existing?.name ?? name); setNewSupplierName("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save supplier."); }
    finally { setAddingSupplier(false); }
  };

  const startSupplierEdit = (id: string, name: string) => { setEditingSupplierId(id); setEditingSupplierName(name); setError(""); };
  const saveSupplierName = async () => {
    const name = editingSupplierName.trim();
    if (!user?.uid || !activeAccountId || !editingSupplierId) return;
    if (!name) return setError("Enter a supplier name first.");
    if (suppliers.some((entry) => entry.active && entry.id !== editingSupplierId && entry.name.trim().toLowerCase() === name.toLowerCase())) return setError("A supplier with this name already exists.");
    setCategoryBusy(true); setError("");
    try { await updateFarmRecord(user.uid, activeAccountId, "suppliers", editingSupplierId, { name }); if (supplierId === editingSupplierId) setSupplierName(name); setSupplierActionsId(null); setEditingSupplierId(null); setEditingSupplierName(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not rename supplier."); }
    finally { setCategoryBusy(false); }
  };
  const deleteSupplier = (id: string, name: string) => {
    Alert.alert("Delete supplier?", `This hides “${name}” for future purchases. Existing purchases will not change.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void (async () => {
        if (!user?.uid || !activeAccountId) return;
        setCategoryBusy(true); setError("");
        try { await updateFarmRecord(user.uid, activeAccountId, "suppliers", id, { active: false }); setSupplierActionsId(null); if (supplierId === id) { setSupplierId(""); setSupplierName(""); } }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete supplier."); }
        finally { setCategoryBusy(false); }
      })() },
    ]);
  };

  return <BatchPage title="Record purchase"><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
    <ThemedText type="defaultSemiBold">Item category</ThemedText><View style={styles.categoryList}><Chip label="General purchases" selected={category === GENERAL_CATEGORY} onPress={() => { setCategoryActionsId(null); setCategory(GENERAL_CATEGORY); setInventoryItemId(""); setCapacity(""); setPurchaseType("consumable"); setInventoryTracked(true); }} accent={accent} surface={surface} border={border} muted={muted} />{customCategories.filter((entry) => entry.active).map((entry) => editingCategoryId === entry.id ? <View key={entry.id} style={styles.categoryEditor}><FarmField label="Category name" value={editingCategoryName} onChangeText={setEditingCategoryName} /><View style={styles.categoryActions}><FarmButton label="Cancel" onPress={cancelCategoryEdit} disabled={categoryBusy} /><FarmButton label={categoryBusy ? "Saving…" : "Save name"} onPress={() => void saveCategoryName()} disabled={categoryBusy} /></View></View> : <View key={entry.id} style={styles.categoryRow}><Chip label={entry.name} selected={category === entry.id} onPress={() => { setCategoryActionsId(null); setCategory(entry.id); setInventoryItemId(""); setCapacity(""); setPurchaseType(entry.financialClassification); setInventoryTracked(entry.inventoryTracked); setCapacityUnit(entry.capacityUnit ?? "litres"); }} onLongPress={() => setCategoryActionsId(entry.id)} accent={accent} surface={surface} border={border} muted={muted} />{categoryActionsId === entry.id ? <><TouchableOpacity onPress={() => startCategoryEdit(entry.id, entry.name)} disabled={categoryBusy}><ThemedText type="tiny" color={accent}>Edit</ThemedText></TouchableOpacity><TouchableOpacity onPress={() => deleteCategory(entry.id, entry.name)} disabled={categoryBusy}><ThemedText type="tiny" color={bad}>Delete</ThemedText></TouchableOpacity></> : null}</View>)}</View>
    <ThemedText type="defaultSemiBold">Purchase type</ThemedText><ThemedText type="tiny" color={muted}>Choose one type. Inventory and accounting treatment align automatically. Hold a custom category to rename or delete it.</ThemedText><View style={styles.choices}>{treatments.map((entry) => <Chip key={entry.value} label={entry.label} selected={financialClassification === entry.value} onPress={() => setPurchaseType(entry.value)} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
    <FarmField label="Add category" value={newCategoryName} onChangeText={setNewCategoryName} placeholder="e.g. Feeders, Drinkers, Irrigation parts" />
    <TouchableOpacity style={styles.checkbox} onPress={() => setNewCategoryHoldsAmount(!newCategoryHoldsAmount)}><ThemedText color={accent}>{newCategoryHoldsAmount ? "☑" : "☐"}</ThemedText><ThemedText type="tiny">Items here hold an amount (feeders, drinkers). Capacity is required on every purchase.</ThemedText></TouchableOpacity>
    {newCategoryHoldsAmount ? <><ThemedText type="tiny" color={muted}>Capacity measured in</ThemedText><View style={styles.choices}>{capacityUnits.map((value) => <Chip key={value} label={value} selected={newCategoryCapacityUnit === value} onPress={() => setNewCategoryCapacityUnit(value)} accent={accent} surface={surface} border={border} muted={muted} />)}</View></> : null}
    <FarmButton label={creatingCategory ? "Adding category…" : "Add category"} onPress={() => void addCategory()} disabled={creatingCategory} />
    <ThemedText type="defaultSemiBold">Inventory item</ThemedText><View style={styles.choices}>
      <Chip label="No inventory item" selected={noInventoryItemMode} onPress={() => { setInventoryItemId(""); setInventoryTracked(false); setCreateItem(false); }} accent={accent} surface={surface} border={border} muted={muted} />
      <Chip label="+ New item" selected={newInventoryItemMode} onPress={() => { setInventoryItemId(""); setInventoryTracked(true); setCreateItem(true); }} accent={accent} surface={surface} border={border} muted={muted} />
      {availableItems.map((stockItem) => editingItemId === stockItem.id ? <View key={stockItem.id} style={styles.manageEditor}><FarmField label="Item name" value={editingItemName} onChangeText={setEditingItemName} /><View style={styles.manageActions}><FarmButton label="Cancel" onPress={() => setEditingItemId(null)} disabled={categoryBusy} /><FarmButton label="Save name" onPress={() => void saveItemName()} disabled={categoryBusy} /></View></View> : <View key={stockItem.id} style={styles.manageRow}><Chip label={stockItem.name} selected={inventoryItemId === stockItem.id} onPress={() => { setItemActionsId(null); setInventoryItemId(stockItem.id); setItem(stockItem.name); setMeasureUnit(genericUnits.includes((stockItem.baseUnit ?? "").trim().toLowerCase()) ? "" : stockItem.baseUnit); setAmountPerItem(""); setPurchaseType(stockItem.defaultFinancialClassification ?? "consumable"); setInventoryTracked(stockItem.inventoryTracked !== false); setCreateItem(false); }} onLongPress={() => setItemActionsId(stockItem.id)} accent={accent} surface={surface} border={border} muted={muted} />{itemActionsId === stockItem.id ? <><TouchableOpacity onPress={() => startItemEdit(stockItem.id, stockItem.name)} disabled={categoryBusy}><ThemedText type="tiny" color={accent}>Edit</ThemedText></TouchableOpacity><TouchableOpacity onPress={() => deleteItem(stockItem.id, stockItem.name)} disabled={categoryBusy}><ThemedText type="tiny" color={bad}>Delete</ThemedText></TouchableOpacity></> : null}</View>)}
    </View>
    {noInventoryItemMode ? <ThemedText type="tiny" color={muted}>No stock is added to inventory for this purchase.</ThemedText> : null}
    {newInventoryItemMode ? <>
      <ThemedText type="tiny" color={muted}>Type the item name and pick its measure below, then save it to reuse it in future purchases. If you don&apos;t save it, a new item is created when you save this purchase.{!availableItems.length ? " No inventory items in this category yet." : ""}</ThemedText>
      <FarmButton label={savingItem ? "Saving item…" : "Save item for future purchases"} onPress={() => void saveInventoryItem()} disabled={savingItem} />
    </> : null}
    <FarmField label="Item name" value={item} onChangeText={setItem} placeholder="Starter feed, vaccine, 5L drinker…" />
    <FarmDatePicker label="Purchase date" value={date} onChange={setDate} />
    <ThemedText type="defaultSemiBold">Currency</ThemedText><View style={styles.choices}>{currencies.map((entry) => <Chip key={entry.value} label={entry.label} selected={currency === entry.value} onPress={() => { setCurrency(entry.value); if (entry.value === "USD") setExchangeRate(""); }} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
    {currency !== "USD" ? <>
      <FarmField label={`Exchange rate (${currency} per 1 USD)`} value={exchangeRate} onChangeText={(value) => setExchangeRate(numeric(value))} keyboardType="decimal-pad" placeholder="e.g. 5" />
      <ThemedText type="tiny" color={muted}>Example: 3000 {currency} at a rate of 5 = $600.00 USD. Amounts are saved in USD, and the original {currency} amounts are kept.</ThemedText>
    </> : null}
    <FarmField label="Number of items purchased" value={quantity} onChangeText={(value) => setQuantity(numeric(value))} keyboardType="decimal-pad" placeholder="e.g. 20" />
    <FarmField label={`Price per item (${currency})`} value={unitPrice} onChangeText={(value) => setUnitPrice(numeric(value))} keyboardType="decimal-pad" placeholder="Leave blank to enter final total" />
    <ThemedText type="defaultSemiBold">Measured in (optional)</ThemedText>
    {selectedInventoryItem ? <>
      <ThemedText type="tiny" color={muted}>{measureUnit ? `Measured in ${measureUnit} (set by the selected inventory item)` : "Counted as items (set by the selected inventory item)"}</ThemedText>
      <View style={styles.choices}><Chip label="Use a different measure" selected={false} onPress={() => { setInventoryItemId(""); setCreateItem(true); }} accent={accent} surface={surface} border={border} muted={muted} /></View>
    </> : <>
      <View style={styles.choices}>
        <Chip label="None" selected={!measureUnit} onPress={() => { setMeasureUnit(""); setAmountPerItem(""); }} accent={accent} surface={surface} border={border} muted={muted} />
        {measureOptions.map((value) => <Chip key={value} label={value} selected={measureUnit === value} onPress={() => setMeasureUnit(value)} accent={accent} surface={surface} border={border} muted={muted} />)}
        <Chip label="+ Custom" selected={showCustomMeasure} onPress={() => setShowCustomMeasure(!showCustomMeasure)} accent={accent} surface={surface} border={border} muted={muted} />
      </View>
      {showCustomMeasure ? <>
        <FarmField label="Custom measure name" value={newMeasureName} onChangeText={setNewMeasureName} placeholder="e.g. bags, crates, rolls" />
        <FarmButton label={addingMeasure ? "Saving measure…" : "Save measure"} onPress={() => void addMeasure()} disabled={addingMeasure} />
      </> : null}
    </>}
    {measureUnit ? <><FarmField label={`Amount in each item (${measureUnit})`} value={amountPerItem} onChangeText={(value) => setAmountPerItem(numeric(value))} keyboardType="decimal-pad" placeholder="e.g. 50" /><ThemedText type="tiny" color={muted}>Total received: {totalMeasured.toLocaleString("en-US", { maximumFractionDigits: 2 })} {measureUnit}</ThemedText>{totalMeasured > 0 && totalEntered > 0 ? <ThemedText type="tiny" color={muted}>Calculated cost: {fmt(totalEntered / totalMeasured)} {currency} / {measureUnit}{rateValid ? ` (≈ $${fmt(totalUsd / totalMeasured)} USD / ${measureUnit})` : ""}</ThemedText> : null}</> : null}
    {needsCapacity ? <><ThemedText type="defaultSemiBold">Capacity per item</ThemedText><View style={styles.choices}>{capacityUnits.map((value) => <Chip key={value} label={value} selected={capacityUnit === value} onPress={() => setCapacityUnit(value)} accent={accent} surface={surface} border={border} muted={muted} />)}</View><FarmField label={`How much can one item hold (${capacityUnit})`} value={capacity} onChangeText={(value) => setCapacity(numeric(value))} keyboardType="decimal-pad" placeholder="Required, e.g. 5" /></> : null}
    <View style={styles.choices}><Chip label="Received" selected={receiptStatus === "received"} onPress={() => setReceiptStatus("received")} accent={accent} surface={surface} border={border} muted={muted} /><Chip label="Ordered · not received" selected={receiptStatus === "ordered"} onPress={() => setReceiptStatus("ordered")} accent={accent} surface={surface} border={border} muted={muted} /></View>
    {isFixedAsset ? <><ThemedText type="defaultSemiBold">Asset condition</ThemedText><View style={styles.choices}>{assetConditions.map((condition) => <Chip key={condition} label={condition} selected={assetCondition === condition} onPress={() => setAssetCondition(condition)} accent={accent} surface={surface} border={border} muted={muted} />)}</View><FarmField label="In-service date (optional, YYYY-MM-DD)" value={inServiceDate} onChangeText={setInServiceDate} placeholder="Defaults to purchase date" /><FarmField label="Useful life in years (optional)" value={usefulLifeYears} onChangeText={(value) => setUsefulLifeYears(numeric(value))} keyboardType="decimal-pad" /><FarmField label={`Residual value in ${currency} (optional)`} value={residualValue} onChangeText={(value) => setResidualValue(numeric(value))} keyboardType="decimal-pad" /><ThemedText type="tiny" color={muted}>Depreciation is not calculated; no farm policy is configured.</ThemedText></> : null}
    <TouchableOpacity style={styles.checkbox} onPress={() => setInventoryTracked(!inventoryTracked)}><ThemedText color={accent}>{inventoryTracked ? "☑" : "☐"}</ThemedText><ThemedText type="tiny">Track quantities in Inventory</ThemedText></TouchableOpacity>
    {!inventoryItemId ? <TouchableOpacity style={styles.checkbox} onPress={() => setCreateItem(!createItem)}><ThemedText color={accent}>{createItem ? "☑" : "☐"}</ThemedText><ThemedText type="tiny">Save as a reusable item definition</ThemedText></TouchableOpacity> : null}
    <FarmField label={`Transport and other charges in ${currency} (optional)`} value={additionalCharges} onChangeText={(value) => setAdditionalCharges(numeric(value))} keyboardType="decimal-pad" placeholder="0.00" />
    <FarmField label={`Final total in ${currency} (optional override)`} value={directTotal} onChangeText={(value) => setDirectTotal(numeric(value))} keyboardType="decimal-pad" placeholder={`Calculated: ${calculatedTotal.toFixed(2)}`} />
    <ThemedText type="tiny" color={muted}>Final purchase total: {Number.isFinite(totalEntered) ? fmt(totalEntered) : "0.00"} {currency}{currency !== "USD" ? (rateValid ? ` ≈ $${fmt(totalUsd)} USD` : " · enter the exchange rate to see the USD value") : ""}</ThemedText>
    <TouchableOpacity style={styles.checkbox} onPress={() => setFullyPaid(!fullyPaid)}><ThemedText color={accent}>{fullyPaid ? "☑" : "☐"}</ThemedText><ThemedText type="tiny">Fully paid</ThemedText></TouchableOpacity>
    {!fullyPaid ? <FarmField label={`Amount paid in ${currency} (optional)`} value={amountPaid} onChangeText={(value) => setAmountPaid(numeric(value))} keyboardType="decimal-pad" placeholder="Leave blank if not known" /> : null}
    <ThemedText type="tiny" color={muted}>Supplier balance: {Number.isFinite(supplierBalance) ? fmt(supplierBalance) : "0.00"} {currency}{currency !== "USD" && rateValid && Number.isFinite(supplierBalance) ? ` ≈ $${fmt(supplierBalance / rateValue)} USD` : ""}</ThemedText>
    <ThemedText type="defaultSemiBold">Payment method (optional)</ThemedText><View style={styles.choices}>{activeMethods.map((method) => <Chip key={method.id} label={method.name} selected={paymentMethodId === method.id} onPress={() => setPaymentMethodId(method.id)} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
    <ThemedText type="defaultSemiBold">Supplier (optional)</ThemedText><View style={styles.manageList}>{activeSuppliers.map((entry) => editingSupplierId === entry.id ? <View key={entry.id} style={styles.manageEditor}><FarmField label="Supplier name" value={editingSupplierName} onChangeText={setEditingSupplierName} /><View style={styles.manageActions}><FarmButton label="Cancel" onPress={() => setEditingSupplierId(null)} disabled={categoryBusy} /><FarmButton label="Save name" onPress={() => void saveSupplierName()} disabled={categoryBusy} /></View></View> : <View key={entry.id} style={styles.manageRow}><Chip label={entry.name} selected={supplierId === entry.id} onPress={() => { setSupplierActionsId(null); if (supplierId === entry.id) { setSupplierId(""); setSupplierName(""); } else { setSupplierId(entry.id); setSupplierName(entry.name); } }} onLongPress={() => setSupplierActionsId(entry.id)} accent={accent} surface={surface} border={border} muted={muted} />{supplierActionsId === entry.id ? <><TouchableOpacity onPress={() => startSupplierEdit(entry.id, entry.name)} disabled={categoryBusy}><ThemedText type="tiny" color={accent}>Edit</ThemedText></TouchableOpacity><TouchableOpacity onPress={() => deleteSupplier(entry.id, entry.name)} disabled={categoryBusy}><ThemedText type="tiny" color={bad}>Delete</ThemedText></TouchableOpacity></> : null}</View>)}{!activeSuppliers.length && <ThemedText type="tiny" color={muted}>No saved suppliers yet. Add one below.</ThemedText>}</View>
    <FarmField label="Add supplier" value={newSupplierName} onChangeText={setNewSupplierName} placeholder="Supplier name" />
    <FarmButton label={addingSupplier ? "Saving supplier…" : "Save supplier"} onPress={() => void addSupplier()} disabled={addingSupplier} />
    <FarmField label="Invoice / receipt reference (optional)" value={invoice} onChangeText={setInvoice} placeholder="Reference" />
    {inventoryTracked && !isFixedAsset ? <><ThemedText type="defaultSemiBold">Batch allocation (optional; does not consume stock)</ThemedText><View style={styles.choices}><Chip label="General farm stock" selected={!batchId} onPress={() => setBatchId("")} accent={accent} surface={surface} border={border} muted={muted} />{batches.map((b) => <Chip key={b.id} label={b.name} selected={batchId === b.id} onPress={() => setBatchId(b.id)} accent={accent} surface={surface} border={border} muted={muted} />)}</View></> : null}
    <FarmField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Additional details" />
    {error ? <ThemedText color={bad}>{error}</ThemedText> : null}<FarmButton label="Save purchase" onPress={() => void save()} disabled={saving} />
  </ScrollView></BatchPage>;
}
function Chip({ label, selected, onPress, onLongPress, accent, surface, border, muted }: { label: string; selected: boolean; onPress: () => void; onLongPress?: () => void; accent: string; surface: string; border: string; muted: string }) { return <TouchableOpacity onPress={onPress} onLongPress={onLongPress} delayLongPress={450} style={[styles.chip, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? "#fff" : muted}>{label}</ThemedText></TouchableOpacity>; }
function formatLocalDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
const treatments: { value: PurchaseFinancialClassification; label: string }[] = [{ value: "consumable", label: "Consumable inventory" }, { value: "fixed_asset", label: "Fixed asset" }, { value: "operating_expense", label: "Operating expense" }];
const assetConditions = ["new", "good", "fair", "poor"] as const;
const styles = StyleSheet.create({ form: { padding: 18, paddingBottom: 32, gap: 13 }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, categoryList: { alignItems: "flex-start", gap: 8 }, categoryRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }, categoryEditor: { gap: 7, width: "100%" }, categoryActions: { flexDirection: "row", gap: 8 }, manageList: { alignItems: "flex-start", gap: 8 }, manageRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }, manageEditor: { gap: 7, width: "100%" }, manageActions: { flexDirection: "row", gap: 8 }, chip: { borderWidth: 1, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 11 }, checkbox: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8 } });
