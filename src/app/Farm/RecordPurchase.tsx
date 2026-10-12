import { BatchPage } from "@/app/Batches/_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ensureDefaultPaymentMethods, savePurchase, savePurchaseCategory } from "@/services/farmRepository";
import type { Batch, FarmPaymentMethod, InventoryItem, PurchaseCategory, PurchaseCategoryDefinition, PurchaseFinancialClassification, PurchaseItemType } from "@/types/farm";
import { router } from "expo-router";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

const categories: { value: PurchaseCategory; label: string }[] = [
  { value: "feed", label: "Feed" }, { value: "medicine", label: "Medicine" }, { value: "vaccines", label: "Vaccines" },
  { value: "disinfectants", label: "Disinfectants" }, { value: "bedding", label: "Wood shavings / bedding" },
  { value: "heating_fuel", label: "Heating fuel / charcoal / gas" }, { value: "water_cleaning", label: "Water and cleaning supplies" },
  { value: "feeders_drinkers", label: "Feeders and drinkers" }, { value: "heating", label: "Heaters and brooders" },
  { value: "ventilation", label: "Fans and ventilation" }, { value: "storage", label: "Feed and water storage" },
  { value: "pumps", label: "Pumps and farm tools" }, { value: "buildings", label: "Buildings and infrastructure" },
  { value: "chicks", label: "Chicks / livestock" }, { value: "equipment", label: "Other equipment" }, { value: "other", label: "Other" },
];
export default function RecordPurchaseScreen() {
  const { user, activeAccountId } = useAuth();
  const { records: batches } = useFarmRecords<Batch>("batches");
  const { records: items } = useFarmRecords<InventoryItem>("stock");
  const { records: paymentMethods } = useFarmRecords<FarmPaymentMethod>("paymentMethods");
  const { records: customCategories } = useFarmRecords<PurchaseCategoryDefinition>("purchaseCategories");
  const [category, setCategory] = useState<PurchaseCategory>("feed"); const [batchId, setBatchId] = useState(""); const [item, setItem] = useState("");
  const [inventoryItemId, setInventoryItemId] = useState(""); const [createItem, setCreateItem] = useState(true);
  const [itemType, setItemType] = useState<PurchaseItemType>("consumable"); const [inventoryTracked, setInventoryTracked] = useState(true); const [financialClassification, setFinancialClassification] = useState<PurchaseFinancialClassification>("consumable");
  const [newCategoryName, setNewCategoryName] = useState(""); const [newCategoryTreatment, setNewCategoryTreatment] = useState<PurchaseFinancialClassification>("consumable"); const [creatingCategory, setCreatingCategory] = useState(false);
  const [date, setDate] = useState(formatLocalDate(new Date())); const [quantity, setQuantity] = useState(""); const [packageCount, setPackageCount] = useState(""); const [unit, setUnit] = useState("");
  const [unitPrice, setUnitPrice] = useState(""); const [directTotal, setDirectTotal] = useState(""); const [discount, setDiscount] = useState(""); const [additionalCharges, setAdditionalCharges] = useState("");
  const [packageWeight, setPackageWeight] = useState(""); const [packageVolume, setPackageVolume] = useState(""); const [supplier, setSupplier] = useState(""); const [invoice, setInvoice] = useState("");
  const [location, setLocation] = useState("");
  const [assetCondition, setAssetCondition] = useState<"new" | "good" | "fair" | "poor">("new"); const [inServiceDate, setInServiceDate] = useState(""); const [usefulLifeYears, setUsefulLifeYears] = useState(""); const [residualValue, setResidualValue] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(""); const [amountPaid, setAmountPaid] = useState(""); const [receiptStatus, setReceiptStatus] = useState<"ordered" | "received">("received"); const [notes, setNotes] = useState("");
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const purchaseRequestKey = useRef(useId().replaceAll(":", ""));
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const bad = useThemeColor("bad");
  const activeMethods = paymentMethods.filter((method) => method.active);
  const availableItems = items.filter((stockItem) => stockItem.active && stockItem.category === category);
  const categoryOptions = [...categories, ...customCategories.filter((entry) => entry.active).map((entry) => ({ value: entry.id, label: entry.name }))];
  const packages = Number(packageCount || quantity) || 0; const price = Number(unitPrice) || 0; const discountValue = Number(discount) || 0; const chargesValue = Number(additionalCharges) || 0;
  const calculatedTotal = useMemo(() => Math.max(0, packages * price - discountValue + chargesValue), [packages, price, discountValue, chargesValue]);
  const totalCost = directTotal.trim() ? Number(directTotal) : calculatedTotal;
  const outstanding = amountPaid.trim() ? Math.max(0, totalCost - Number(amountPaid)) : undefined;
  const supplierBalance = outstanding ?? totalCost;
  useEffect(() => { if (user?.uid && activeAccountId) void ensureDefaultPaymentMethods(user.uid, activeAccountId); }, [user?.uid, activeAccountId]);

  const save = async () => {
    if (savingRef.current) return;
    if (!user?.uid || !activeAccountId) return setError("Select a farm account first.");
    const qty = quantity.trim() ? Number(quantity) : packageCount.trim() ? Number(packageCount) : undefined;
    const packageQty = packageCount.trim() ? Number(packageCount) : undefined;
    const priceValue = unitPrice.trim() ? Number(unitPrice) : undefined;
    const paidValue = amountPaid.trim() ? Number(amountPaid) : undefined;
    const discountAmount = discount.trim() ? Number(discount) : 0; const extra = additionalCharges.trim() ? Number(additionalCharges) : 0;
    if (!item.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(totalCost) || totalCost <= 0) return setError("Enter an item, purchase date, and positive total cost or package price.");
    const packageWeightValue = packageWeight.trim() ? Number(packageWeight) : undefined;
    const packageVolumeValue = packageVolume.trim() ? Number(packageVolume) : undefined;
    const usefulLifeValue = usefulLifeYears.trim() ? Number(usefulLifeYears) : undefined; const residualValueNumber = residualValue.trim() ? Number(residualValue) : undefined;
    const serviceDate = inServiceDate.trim();
    if (serviceDate && (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || serviceDate < date)) return setError("In-service date must use YYYY-MM-DD and cannot be before the purchase date.");
    if ((qty !== undefined && (!Number.isFinite(qty) || qty <= 0)) || (packageQty !== undefined && (!Number.isFinite(packageQty) || packageQty <= 0)) || (priceValue !== undefined && (!Number.isFinite(priceValue) || priceValue < 0)) || (packageWeightValue !== undefined && (!Number.isFinite(packageWeightValue) || packageWeightValue <= 0)) || (packageVolumeValue !== undefined && (!Number.isFinite(packageVolumeValue) || packageVolumeValue <= 0)) || (usefulLifeValue !== undefined && (!Number.isFinite(usefulLifeValue) || usefulLifeValue <= 0)) || (residualValueNumber !== undefined && (!Number.isFinite(residualValueNumber) || residualValueNumber < 0 || residualValueNumber > totalCost)) || !Number.isFinite(discountAmount) || discountAmount < 0 || !Number.isFinite(extra) || extra < 0) return setError("Quantity, package size, asset details, price, discount, and additional charges must be valid values.");
    if (paidValue !== undefined && (!Number.isFinite(paidValue) || paidValue < 0 || paidValue > totalCost)) return setError("Amount paid must be between zero and the final total.");
    if (receiptStatus === "received" && inventoryTracked && (!qty || !unit.trim())) return setError("Enter the quantity received and its unit, or mark the purchase as ordered.");
    if (receiptStatus === "received" && inventoryTracked && !inventoryItemId && !createItem) return setError("Select an existing inventory item or choose to create one.");
    savingRef.current = true; setSaving(true); setError("");
    try {
      const selectedItem = items.find((stockItem) => stockItem.id === inventoryItemId);
      const method = activeMethods.find((entry) => entry.id === paymentMethodId);
      const categoryDefinition = customCategories.find((entry) => entry.id === category);
      const categoryName = categoryDefinition?.name ?? categories.find((entry) => entry.value === category)?.label ?? category;
      await savePurchase(user.uid, activeAccountId, {
        itemName: item.trim(), inventoryItemId: inventoryItemId || undefined, category, categoryId: categoryDefinition?.id, categoryNameSnapshot: categoryName,
        itemType, inventoryTracked, financialClassification, assetCondition, inServiceDate: inServiceDate.trim() || undefined, usefulLifeYears: usefulLifeValue, residualValue: residualValueNumber, date, quantity: qty, packageCount: packageQty,
        unit: unit.trim() || undefined, unitPrice: priceValue, packageWeight: packageWeightValue,
        packageVolume: packageVolumeValue, totalCost, discount: discountAmount, additionalCharges: extra,
        amountPaid: paidValue, outstanding, paymentMethodId: method?.id, paymentMethodName: method?.name,
        receiptStatus, supplier: supplier.trim() || undefined, invoiceReference: invoice.trim() || undefined, location: location.trim() || undefined, notes: notes.trim() || undefined,
        batchId: batchId || undefined, newInventoryItem: !selectedItem && createItem, idempotencyKey: purchaseRequestKey.current,
      });
      Alert.alert("Purchase saved", receiptStatus === "received" ? "The purchase and received stock movement were saved offline." : "The order was saved without increasing available stock.");
      router.replace("/Farm/Purchases" as never);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save purchase."); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const addCategory = async () => {
    if (!user?.uid || !activeAccountId || !newCategoryName.trim()) return setError("Enter a category name first.");
    setCreatingCategory(true); setError("");
    try {
      const id = await savePurchaseCategory(user.uid, activeAccountId, { name: newCategoryName.trim(), financialClassification: newCategoryTreatment, inventoryTracked: newCategoryTreatment !== "operating_expense", active: true });
      setCategory(id); setFinancialClassification(newCategoryTreatment); setNewCategoryName("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add category."); }
    finally { setCreatingCategory(false); }
  };

  return <BatchPage title="Record purchase"><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
    <ThemedText type="defaultSemiBold">Item category</ThemedText><View style={styles.choices}>{categoryOptions.map((c) => <Chip key={c.value} label={c.label} selected={category === c.value} onPress={() => { setCategory(c.value); setInventoryItemId(""); const definition = customCategories.find((entry) => entry.id === c.value); if (definition) { setFinancialClassification(definition.financialClassification); setInventoryTracked(definition.inventoryTracked); } }} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
    <FarmField label="Add custom category" value={newCategoryName} onChangeText={setNewCategoryName} placeholder="e.g. Irrigation parts" />
    <ThemedText type="tiny" color={muted}>Default treatment for new items in this category</ThemedText><View style={styles.choices}>{treatments.map((entry) => <Chip key={entry.value} label={entry.label} selected={newCategoryTreatment === entry.value} onPress={() => setNewCategoryTreatment(entry.value)} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
    <FarmButton label={creatingCategory ? "Adding category…" : "Add category"} onPress={() => void addCategory()} disabled={creatingCategory} />
    <ThemedText type="defaultSemiBold">Existing inventory item (optional)</ThemedText><View style={styles.choices}>{availableItems.map((stockItem) => <Chip key={stockItem.id} label={stockItem.name} selected={inventoryItemId === stockItem.id} onPress={() => { setInventoryItemId(stockItem.id); setItem(stockItem.name); setUnit(stockItem.baseUnit); setItemType(stockItem.itemType ?? "consumable"); setInventoryTracked(stockItem.inventoryTracked !== false); setFinancialClassification(stockItem.defaultFinancialClassification ?? "consumable"); setCreateItem(false); }} accent={accent} surface={surface} border={border} muted={muted} />)}{!availableItems.length && <ThemedText type="tiny" color={muted}>No inventory items in this category yet.</ThemedText>}</View>
    <FarmField label="Item description" value={item} onChangeText={setItem} placeholder="Starter feed, vaccine…" />
    <FarmDatePicker label="Purchase date" value={date} onChange={setDate} />
    <View style={styles.choices}><Chip label="Received" selected={receiptStatus === "received"} onPress={() => setReceiptStatus("received")} accent={accent} surface={surface} border={border} muted={muted} /><Chip label="Ordered · not received" selected={receiptStatus === "ordered"} onPress={() => setReceiptStatus("ordered")} accent={accent} surface={surface} border={border} muted={muted} /></View>
    <ThemedText type="defaultSemiBold">Item type</ThemedText><View style={styles.choices}>{itemTypes.map((entry) => <Chip key={entry.value} label={entry.label} selected={itemType === entry.value} onPress={() => setItemType(entry.value)} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
    <ThemedText type="defaultSemiBold">Financial treatment</ThemedText><View style={styles.choices}>{treatments.map((entry) => <Chip key={entry.value} label={entry.label} selected={financialClassification === entry.value} onPress={() => { setFinancialClassification(entry.value); if (entry.value === "fixed_asset") setItemType("durable_equipment"); }} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
    {financialClassification === "fixed_asset" ? <><ThemedText type="defaultSemiBold">Asset condition</ThemedText><View style={styles.choices}>{assetConditions.map((condition) => <Chip key={condition} label={condition} selected={assetCondition === condition} onPress={() => setAssetCondition(condition)} accent={accent} surface={surface} border={border} muted={muted} />)}</View><FarmField label="In-service date (optional, YYYY-MM-DD)" value={inServiceDate} onChangeText={setInServiceDate} placeholder="Defaults to purchase date" /><FarmField label="Useful life in years (optional)" value={usefulLifeYears} onChangeText={setUsefulLifeYears} keyboardType="decimal-pad" /><FarmField label="Residual value (optional)" value={residualValue} onChangeText={setResidualValue} keyboardType="decimal-pad" /><ThemedText type="tiny" color={muted}>Depreciation is not calculated; no farm policy is configured.</ThemedText></> : null}
    <TouchableOpacity style={styles.checkbox} onPress={() => setInventoryTracked(!inventoryTracked)}><ThemedText color={accent}>{inventoryTracked ? "☑" : "☐"}</ThemedText><ThemedText type="tiny">Track quantities in Inventory</ThemedText></TouchableOpacity>
    {!inventoryItemId ? <TouchableOpacity style={styles.checkbox} onPress={() => setCreateItem(!createItem)}><ThemedText color={accent}>{createItem ? "☑" : "☐"}</ThemedText><ThemedText type="tiny">Save as a reusable item definition</ThemedText></TouchableOpacity> : null}
    <FarmField label="Quantity received / packages" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="e.g. 20" />
    <FarmField label="Unit of measurement" value={unit} onChangeText={setUnit} placeholder="bags, kg, litres, bottles, units" />
    <FarmField label="Number of packages (optional)" value={packageCount} onChangeText={setPackageCount} keyboardType="decimal-pad" placeholder="Defaults to quantity" />
    <FarmField label="Package weight in kg (optional)" value={packageWeight} onChangeText={setPackageWeight} keyboardType="decimal-pad" placeholder="e.g. 50" />
    <FarmField label="Package volume in litres (optional)" value={packageVolume} onChangeText={setPackageVolume} keyboardType="decimal-pad" placeholder="Optional" />
    <FarmField label="Price per package (optional)" value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" placeholder="Leave blank to enter final total" />
    <FarmField label="Discount (optional)" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" placeholder="0.00" />
    <FarmField label="Transport and other charges (optional)" value={additionalCharges} onChangeText={setAdditionalCharges} keyboardType="decimal-pad" placeholder="0.00" />
    <FarmField label="Final total (optional override)" value={directTotal} onChangeText={setDirectTotal} keyboardType="decimal-pad" placeholder={`Calculated: ${calculatedTotal.toFixed(2)}`} />
    <ThemedText type="tiny" color={muted}>Final purchase total: ${Number.isFinite(totalCost) ? totalCost.toFixed(2) : "0.00"}</ThemedText>
    <FarmField label="Amount paid (optional)" value={amountPaid} onChangeText={setAmountPaid} keyboardType="decimal-pad" placeholder="Leave blank if not known" />
    <ThemedText type="tiny" color={muted}>Supplier balance: ${supplierBalance.toFixed(2)}</ThemedText>
    <ThemedText type="defaultSemiBold">Payment method (optional)</ThemedText><View style={styles.choices}>{activeMethods.map((method) => <Chip key={method.id} label={method.name} selected={paymentMethodId === method.id} onPress={() => setPaymentMethodId(method.id)} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
    <FarmField label="Supplier (optional)" value={supplier} onChangeText={setSupplier} placeholder="Supplier" /><FarmField label="Location (optional)" value={location} onChangeText={setLocation} placeholder="Store, shed, or farm location" /><FarmField label="Invoice / receipt reference (optional)" value={invoice} onChangeText={setInvoice} placeholder="Reference" />
    {inventoryTracked ? <><ThemedText type="defaultSemiBold">Batch allocation (optional; does not consume stock)</ThemedText><View style={styles.choices}><Chip label="General farm stock" selected={!batchId} onPress={() => setBatchId("")} accent={accent} surface={surface} border={border} muted={muted} />{batches.map((b) => <Chip key={b.id} label={b.name} selected={batchId === b.id} onPress={() => setBatchId(b.id)} accent={accent} surface={surface} border={border} muted={muted} />)}</View></> : null}
    <FarmField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Additional details" />
    {error ? <ThemedText color={bad}>{error}</ThemedText> : null}<FarmButton label="Save purchase" onPress={() => void save()} disabled={saving} />
  </ScrollView></BatchPage>;
}
function Chip({ label, selected, onPress, accent, surface, border, muted }: { label: string; selected: boolean; onPress: () => void; accent: string; surface: string; border: string; muted: string }) { return <TouchableOpacity onPress={onPress} style={[styles.chip, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? "#fff" : muted}>{label}</ThemedText></TouchableOpacity>; }
function formatLocalDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
const treatments: { value: PurchaseFinancialClassification; label: string }[] = [{ value: "consumable", label: "Consumable inventory" }, { value: "fixed_asset", label: "Fixed asset" }, { value: "operating_expense", label: "Operating expense" }];
const itemTypes: { value: PurchaseItemType; label: string }[] = [{ value: "consumable", label: "Consumable" }, { value: "durable_equipment", label: "Durable equipment" }, { value: "service", label: "Service / labour" }, { value: "other", label: "Other" }];
const assetConditions = ["new", "good", "fair", "poor"] as const;
const styles = StyleSheet.create({ form: { padding: 18, paddingBottom: 32, gap: 13 }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { borderWidth: 1, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 11 }, checkbox: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8 } });
