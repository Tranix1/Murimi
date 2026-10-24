import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { BatchPage } from "./_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { createFarmRecord, deleteFarmRecord, ensureDefaultPaymentMethods, saveSale, updateFarmRecord } from "@/services/farmRepository";
import type { Batch, CustomerCategory, FarmCustomer, FarmPaymentMethod, Sale, SaleProductType } from "@/types/farm";

export default function BatchSalesScreen() {
  const { batchId } = useLocalSearchParams<{ batchId?: string }>();
  const { user, activeAccountId } = useAuth();
  const { records: batches } = useFarmRecords<Batch>("batches");
  const { records: categories } = useFarmRecords<CustomerCategory>("customerCategories");
  const { records: customers } = useFarmRecords<FarmCustomer>("customers");
  const { records: paymentMethods } = useFarmRecords<FarmPaymentMethod>("paymentMethods");
  const { records: customTypes } = useFarmRecords<SaleProductType>("saleProductTypes");
  const [date, setDate] = useState(localToday());
  const [productType, setProductType] = useState<Sale["productType"]>("live_birds");
  const [unit, setUnit] = useState<Sale["unit"]>("birds");
  const [quantity, setQuantity] = useState(""); const [pricePerUnit, setPricePerUnit] = useState(""); const [paymentReceived, setPaymentReceived] = useState("");
  const [customer, setCustomer] = useState(""); const [customerMode, setCustomerMode] = useState<"saved" | "new">("new"); const [categoryId, setCategoryId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState(""); const [customerSearch, setCustomerSearch] = useState(""); const [saveNewCustomer, setSaveNewCustomer] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState(""); const [newCustomerName, setNewCustomerName] = useState(""); const [managing, setManaging] = useState(false);
  const [newCustomerPhone, setNewCustomerPhone] = useState(""); const [buyerPhone, setBuyerPhone] = useState("");
  const [newProductName, setNewProductName] = useState(""); const [newProductUnit, setNewProductUnit] = useState("kg"); const [editingProductId, setEditingProductId] = useState(""); const [customTypeLabel, setCustomTypeLabel] = useState("");
  const [paymentDate, setPaymentDate] = useState(""); const [paymentMethodId, setPaymentMethodId] = useState(""); const [deliveryCost, setDeliveryCost] = useState("0"); const [notes, setNotes] = useState("");
  const [fullyPaid, setFullyPaid] = useState(false);
  const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const bad = useThemeColor("bad");
  const batch = batches.find((item) => item.id === batchId); const selectedCustomer = customers.find((item) => item.id === selectedCustomerId);
  const activeCategories = categories.filter((item) => item.active); const activeMethods = paymentMethods.filter((item) => item.active);
  const customerNeedle = customerSearch.trim().toLocaleLowerCase();
  const matchingCustomers = customers.filter((item) => item.active && (!categoryId || item.categoryId === categoryId || item.categoryIds?.includes(categoryId)) && (!customerNeedle || item.name.toLocaleLowerCase().includes(customerNeedle) || (item.phone ?? "").toLocaleLowerCase().includes(customerNeedle)));
  const activeCustomTypes = customTypes.filter((item) => item.active);
  const selectedCustomType = activeCustomTypes.find((item) => item.id === productType);
  const totalValue = (Number(quantity) || 0) * (Number(pricePerUnit) || 0);
  useEffect(() => { if (user?.uid && activeAccountId) void ensureDefaultPaymentMethods(user.uid, activeAccountId); }, [user?.uid, activeAccountId]);

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!user?.uid || !activeAccountId) return setError("Sign in and select an account before adding a category.");
    if (!name) return setError("Enter a category name.");
    if (activeCategories.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())) return setError("A category with this name already exists.");
    setManaging(true); setError(null);
    try {
      const id = await createFarmRecord(user.uid, activeAccountId, "customerCategories", { name, active: true });
      setNewCategoryName(""); setCategoryId(id); setSelectedCustomerId("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add this category."); }
    finally { setManaging(false); }
  };

  const confirmDeleteCategory = (item: CustomerCategory) => {
    const linked = customers.filter((customerItem) => customerItem.active && customerItem.categoryId === item.id).length;
    Alert.alert("Delete category", linked ? `"${item.name}" has ${linked} saved customer${linked === 1 ? "" : "s"}. They will no longer appear until you re-add them to another category. Past sales are not changed.` : `Delete "${item.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        if (!user?.uid || !activeAccountId) return;
        setManaging(true); setError(null);
        try {
          await deleteFarmRecord(user.uid, activeAccountId, "customerCategories", item.id);
          if (categoryId === item.id) { setCategoryId(""); setSelectedCustomerId(""); }
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this category."); }
        finally { setManaging(false); }
      } },
    ]);
  };

  const addCustomer = async () => {
    const name = newCustomerName.trim();
    if (!user?.uid || !activeAccountId) return setError("Sign in and select an account before adding a customer.");
    if (!name) return setError("Enter a customer name.");
    if (customers.some((item) => item.active && item.categoryId === categoryId && item.name.trim().toLowerCase() === name.toLowerCase())) return setError("This customer already exists in the selected category.");
    const phone = newCustomerPhone.trim();
    if (phone && !/^[+\d\s().-]{7,22}$/.test(phone)) return setError("Enter a valid phone number, or leave it blank.");
    setManaging(true); setError(null);
    try {
      const id = await createFarmRecord(user.uid, activeAccountId, "customers", { name, categoryId, categoryIds: [categoryId], phone: phone || undefined, active: true });
      setNewCustomerName(""); setNewCustomerPhone(""); setSelectedCustomerId(id); setCustomer(name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add this customer."); }
    finally { setManaging(false); }
  };

  const saveProductType = async () => {
    const name = newProductName.trim(); const unitName = newProductUnit.trim();
    if (!user?.uid || !activeAccountId) return setError("Sign in and select an account before adding a product type.");
    if (!name || !unitName) return setError("Enter a product name and unit.");
    if (activeCustomTypes.some((item) => item.id !== editingProductId && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) return setError("A product type with this name already exists.");
    setManaging(true); setError(null);
    try {
      if (editingProductId) {
        await updateFarmRecord(user.uid, activeAccountId, "saleProductTypes", editingProductId, { name, unit: unitName });
        setProductType(editingProductId);
        setCustomTypeLabel(name);
      } else {
        const id = `sale_type_${name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
        if (customTypes.some((item) => item.id === id)) throw new Error("This product type already exists, including an archived type.");
        await createFarmRecord(user.uid, activeAccountId, "saleProductTypes", { name, unit: unitName, active: true }, id);
        setProductType(id); setUnit(unitName); setCustomTypeLabel(name);
      }
      setNewProductName(""); setNewProductUnit("kg"); setEditingProductId("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this product type."); }
    finally { setManaging(false); }
  };

  const archiveProductType = (item: SaleProductType) => Alert.alert("Archive product type", `Archive ${item.name}? Past sales will keep their saved product name.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Archive", style: "destructive", onPress: async () => {
      if (!user?.uid || !activeAccountId) return;
      try { await updateFarmRecord(user.uid, activeAccountId, "saleProductTypes", item.id, { active: false, archivedAt: new Date().toISOString() }); if (productType === item.id) { setProductType("live_birds"); setUnit("birds"); } }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not archive this product type."); }
    } },
  ]);

  const confirmDeleteCustomer = (item: FarmCustomer) => {
    Alert.alert("Delete customer", `Delete "${item.name}"? Past sales keep the buyer name they were recorded with.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        if (!user?.uid || !activeAccountId) return;
        setManaging(true); setError(null);
        try {
          await deleteFarmRecord(user.uid, activeAccountId, "customers", item.id);
          if (selectedCustomerId === item.id) { setSelectedCustomerId(""); setCustomer(""); }
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this customer."); }
        finally { setManaging(false); }
      } },
    ]);
  };

  const save = async () => {
    const qty = Number(quantity); const price = Number(pricePerUnit); const paid = fullyPaid ? qty * price : paymentReceived.trim() ? Number(paymentReceived) : 0; const delivery = Number(deliveryCost);
    if (!user?.uid || !activeAccountId || !batch) return setError("The batch account could not be found.");
    if (!date.trim() || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(delivery) || delivery < 0) return setError("Enter a valid date, quantity, price and delivery cost.");
    if ((productType === "live_birds" || unit === "birds") && !Number.isInteger(qty)) return setError("Bird quantity must be a whole number.");
    if (!Number.isFinite(paid) || paid < 0 || paid > qty * price) return setError("Payment received must be between zero and the total sale value.");
    if (productType === "live_birds" && qty > (batch.currentBirdsAlive ?? batch.initialQuantity)) return setError("This sale exceeds the birds currently available.");
    const buyerName = customerMode === "saved" ? selectedCustomer?.name ?? "" : customer.trim();
    if (customerMode === "saved" && !selectedCustomer) return setError("Select a saved customer or choose Enter new customer.");
    setSaving(true); setError(null);
    try {
      let customerId = customerMode === "saved" ? selectedCustomer?.id : undefined;
      if (customerMode === "new" && saveNewCustomer && buyerName) {
        const phone = buyerPhone.trim();
        if (phone && !/^[+\d\s().-]{7,22}$/.test(phone)) throw new Error("Enter a valid phone number, or leave it blank.");
        customerId = await createFarmRecord(user.uid, activeAccountId, "customers", { name: buyerName, categoryId, categoryIds: categoryId ? [categoryId] : [], phone: phone || undefined, active: true });
      }
      const method = activeMethods.find((item) => item.id === paymentMethodId);
      await saveSale(user.uid, activeAccountId, batch, {
        date, productType, productDescription: productType === "live_birds" ? "Live birds" : productType === "dressed_birds" ? "Dressed chicken" : selectedCustomType?.name ?? customTypeLabel ?? "Custom product", quantity: qty, unit, pricePerUnit: price, totalValue: qty * price, paymentReceived: paid, outstanding: qty * price - paid,
        customer: buyerName || undefined, customerId, customerCategoryId: categoryId || undefined,
        customerCategoryName: categories.find((item) => item.id === categoryId)?.name, customerNameSnapshot: buyerName || undefined,
        paymentDate: fullyPaid ? paymentDate.trim() || localToday() : paymentDate.trim() || undefined, paymentMethod: method?.name, paymentMethodId: method?.id, paymentMethodName: method?.name,
        deliveryCost: delivery, notes: notes.trim() || undefined,
      });
      Alert.alert("Sale saved", `Sale revenue ${money(qty * price)} · cash received ${money(paid)}.`); router.back();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this sale."); }
    finally { setSaving(false); }
  };

  return <BatchPage title="Record sale"><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
    <ThemedText type="tiny" color={muted}>Cash collected is recorded separately from unpaid sale value.</ThemedText>
    <FarmDatePicker label="Sale date" value={date} onChange={setDate} />
    <ThemedText type="defaultSemiBold">Customer category</ThemedText><View style={styles.chips}>{activeCategories.map((item) => <Chip key={item.id} label={item.name} selected={categoryId === item.id} onPress={() => { setCategoryId(item.id); setSelectedCustomerId(""); }} onDelete={() => confirmDeleteCategory(item)} accent={accent} surface={surface} border={border} muted={muted} />)}{!activeCategories.length && <ThemedText type="tiny" color={muted}>No categories yet. Add one below.</ThemedText>}</View>
    <FarmField label="Add a category" value={newCategoryName} onChangeText={setNewCategoryName} placeholder="For example, Butcheries" />
    <FarmButton label="Add category" onPress={() => void addCategory()} disabled={managing} />
    <View style={styles.modeRow}><Chip label="Select saved customer" selected={customerMode === "saved"} onPress={() => setCustomerMode("saved")} accent={accent} surface={surface} border={border} muted={muted} /><Chip label="Enter new customer" selected={customerMode === "new"} onPress={() => { setCustomerMode("new"); setSelectedCustomerId(""); }} accent={accent} surface={surface} border={border} muted={muted} /></View>
    {customerMode === "saved" ? <><FarmField label="Search customers by name or phone" value={customerSearch} onChangeText={setCustomerSearch} placeholder="Name or phone number" /><View style={styles.chips}>{matchingCustomers.map((item) => <Chip key={item.id} label={item.phone ? `${item.name} · ${item.phone}` : item.name} selected={selectedCustomerId === item.id} onPress={() => { setSelectedCustomerId(item.id); setCustomer(item.name); }} onDelete={() => confirmDeleteCustomer(item)} accent={accent} surface={surface} border={border} muted={muted} />)}{!matchingCustomers.length && <ThemedText type="tiny" color={muted}>No matching saved customers.</ThemedText>}</View><FarmField label="Add a customer" value={newCustomerName} onChangeText={setNewCustomerName} placeholder="Customer name" /><FarmField label="Phone (optional)" value={newCustomerPhone} onChangeText={setNewCustomerPhone} keyboardType="phone-pad" placeholder="+263 …" /><FarmButton label="Add customer" onPress={() => void addCustomer()} disabled={managing} /></> : <><FarmField label="Buyer name (optional)" value={customer} onChangeText={setCustomer} placeholder="Buyer name" /><FarmField label="Phone (optional)" value={buyerPhone} onChangeText={setBuyerPhone} keyboardType="phone-pad" placeholder="+263 …" /><TouchableOpacity style={styles.checkbox} onPress={() => setSaveNewCustomer(!saveNewCustomer)}><ThemedText color={accent}>{saveNewCustomer ? "☑" : "☐"}</ThemedText><ThemedText type="tiny">Save this customer for future sales</ThemedText></TouchableOpacity></>}
    <ThemedText type="defaultSemiBold">Product type</ThemedText><View style={styles.modeRow}>{(["live_birds", "dressed_birds"] as const).map((type) => <Chip key={type} label={type === "live_birds" ? "Live birds" : "Dressed birds"} selected={productType === type} onPress={() => { setProductType(type); setUnit("birds"); }} accent={accent} surface={surface} border={border} muted={muted} />)}{activeCustomTypes.map((item) => <Chip key={item.id} label={item.name} selected={productType === item.id} onPress={() => { setProductType(item.id); setUnit(item.unit); setCustomTypeLabel(item.name); }} onDelete={() => archiveProductType(item)} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
    {selectedCustomType && <View style={styles.modeRow}><FarmButton label="Edit selected type" onPress={() => { setEditingProductId(selectedCustomType.id); setNewProductName(selectedCustomType.name); setNewProductUnit(selectedCustomType.unit); }} disabled={managing} /><FarmButton label="Archive selected type" onPress={() => archiveProductType(selectedCustomType)} disabled={managing} /></View>}
    <FarmField label={editingProductId ? "Edit custom type name" : "Custom type name"} value={newProductName} onChangeText={setNewProductName} placeholder="Chicken cuts, manure, offal" />
    <FarmField label="Unit" value={newProductUnit} onChangeText={setNewProductUnit} placeholder="birds, kg, sacks, pieces" />
    <FarmButton label={editingProductId ? "Save type changes" : "Create Custom Type"} onPress={() => void saveProductType()} disabled={managing} />
    {productType === "dressed_birds" && <View style={styles.modeRow}>{(["birds", "kg"] as const).map((value) => <Chip key={value} label={`Per ${value}`} selected={unit === value} onPress={() => setUnit(value)} accent={accent} surface={surface} border={border} muted={muted} />)}</View>}
    <ThemedText type="tiny" color={muted}>{productType === "live_birds" ? `Live birds available: ${batch?.currentBirdsAlive ?? batch?.initialQuantity ?? "—"}` : productType === "dressed_birds" ? "Dressed product should come from a slaughter record." : `Sold per ${unit}.`}</ThemedText>
    <FarmField label={`Quantity (${unit})`} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="0" /><FarmField label={`Price per ${unit}`} value={pricePerUnit} onChangeText={setPricePerUnit} keyboardType="decimal-pad" placeholder="0.00" />
    <View style={[styles.total, { backgroundColor: surface, borderColor: border }]}><ThemedText type="tiny" color={muted}>Total sale value</ThemedText><ThemedText type="subtitle" color={accent}>{money(totalValue)}</ThemedText></View>
    <TouchableOpacity style={styles.checkbox} onPress={() => { const next = !fullyPaid; setFullyPaid(next); if (next) { setPaymentReceived(String(totalValue)); setPaymentDate(paymentDate || localToday()); } else setPaymentReceived(""); }}><ThemedText color={accent}>{fullyPaid ? "☑" : "☐"}</ThemedText><ThemedText type="tiny">Fully paid</ThemedText></TouchableOpacity>
    {!fullyPaid ? <FarmField label="Payment received" value={paymentReceived} onChangeText={setPaymentReceived} keyboardType="decimal-pad" placeholder="0.00 (leave blank if unpaid)" /> : <ThemedText type="tiny" color={muted}>Paid in full: {money(totalValue)}</ThemedText>}<ThemedText type="tiny" color={muted}>Outstanding balance: {money(fullyPaid ? 0 : Math.max(0, totalValue - (Number(paymentReceived) || 0)))}</ThemedText>
    <ThemedText type="defaultSemiBold">Payment method</ThemedText><View style={styles.chips}>{activeMethods.map((method) => <Chip key={method.id} label={method.name} selected={paymentMethodId === method.id} onPress={() => setPaymentMethodId(method.id)} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
    <FarmDatePicker label="Payment date (optional)" value={paymentDate} onChange={setPaymentDate} /><FarmField label="Delivery cost" value={deliveryCost} onChangeText={setDeliveryCost} keyboardType="decimal-pad" placeholder="0.00" /><FarmField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Sale notes" />
    {error && <ThemedText color={bad}>{error}</ThemedText>}<FarmButton label="Save sale" onPress={() => void save()} disabled={saving} />
  </ScrollView></BatchPage>;
}
function Chip({ label, selected, onPress, onDelete, accent, surface, border, muted }: { label: string; selected: boolean; onPress: () => void; onDelete?: () => void; accent: string; surface: string; border: string; muted: string }) { return <View style={[styles.choice, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><TouchableOpacity onPress={onPress} style={styles.chipLabel}><ThemedText type="tiny" color={selected ? "#FFFFFF" : muted}>{label}</ThemedText></TouchableOpacity>{onDelete && <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.chipDelete}><ThemedText type="tiny" color={selected ? "#FFFFFF" : muted}>✕</ThemedText></TouchableOpacity>}</View>; }
const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function localToday() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
const styles = StyleSheet.create({ form: { padding: 18, paddingBottom: 30, gap: 14 }, modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { minHeight: 40, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 11 }, chipLabel: { minHeight: 40, justifyContent: "center" }, chipDelete: { marginLeft: 8, minHeight: 40, justifyContent: "center" }, checkbox: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8 }, total: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 3 } });
