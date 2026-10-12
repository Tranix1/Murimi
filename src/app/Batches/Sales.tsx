import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { BatchPage } from "./_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { createFarmRecord, ensureDefaultPaymentMethods, saveSale } from "@/services/farmRepository";
import type { Batch, CustomerCategory, FarmCustomer, FarmPaymentMethod, Sale } from "@/types/farm";

export default function BatchSalesScreen() {
  const { batchId } = useLocalSearchParams<{ batchId?: string }>();
  const { user, activeAccountId } = useAuth();
  const { records: batches } = useFarmRecords<Batch>("batches");
  const { records: categories } = useFarmRecords<CustomerCategory>("customerCategories");
  const { records: customers } = useFarmRecords<FarmCustomer>("customers");
  const { records: paymentMethods } = useFarmRecords<FarmPaymentMethod>("paymentMethods");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [productType, setProductType] = useState<Sale["productType"]>("live_birds");
  const [unit, setUnit] = useState<Sale["unit"]>("birds");
  const [quantity, setQuantity] = useState(""); const [pricePerUnit, setPricePerUnit] = useState(""); const [paymentReceived, setPaymentReceived] = useState("");
  const [customer, setCustomer] = useState(""); const [customerMode, setCustomerMode] = useState<"saved" | "new">("new"); const [categoryId, setCategoryId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState(""); const [customerSearch, setCustomerSearch] = useState(""); const [saveNewCustomer, setSaveNewCustomer] = useState(false);
  const [paymentDate, setPaymentDate] = useState(""); const [paymentMethodId, setPaymentMethodId] = useState(""); const [deliveryCost, setDeliveryCost] = useState("0"); const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const bad = useThemeColor("bad");
  const batch = batches.find((item) => item.id === batchId); const selectedCustomer = customers.find((item) => item.id === selectedCustomerId);
  const activeCategories = categories.filter((item) => item.active); const activeMethods = paymentMethods.filter((item) => item.active);
  const matchingCustomers = customers.filter((item) => item.active && item.categoryId === categoryId && item.name.toLowerCase().includes(customerSearch.trim().toLowerCase()));
  const totalValue = (Number(quantity) || 0) * (Number(pricePerUnit) || 0);
  useEffect(() => { if (user?.uid && activeAccountId) void ensureDefaultPaymentMethods(user.uid, activeAccountId); }, [user?.uid, activeAccountId]);

  const save = async () => {
    const qty = Number(quantity); const price = Number(pricePerUnit); const paid = paymentReceived.trim() ? Number(paymentReceived) : 0; const delivery = Number(deliveryCost);
    if (!user?.uid || !activeAccountId || !batch) return setError("The batch account could not be found.");
    if (!date.trim() || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(delivery) || delivery < 0) return setError("Enter a valid date, quantity, price and delivery cost.");
    if (productType === "live_birds" && !Number.isInteger(qty)) return setError("Live-bird quantity must be a whole number.");
    if (!Number.isFinite(paid) || paid < 0 || paid > qty * price) return setError("Payment received must be between zero and the total sale value.");
    if (productType === "live_birds" && qty > (batch.currentBirdsAlive ?? batch.initialQuantity)) return setError("This sale exceeds the birds currently available.");
    const buyerName = customerMode === "saved" ? selectedCustomer?.name ?? "" : customer.trim();
    if (customerMode === "saved" && !selectedCustomer) return setError("Select a saved customer or choose Enter new customer.");
    if (saveNewCustomer && !categoryId) return setError("Select a category before saving this customer.");
    setSaving(true); setError(null);
    try {
      let customerId = customerMode === "saved" ? selectedCustomer?.id : undefined;
      if (customerMode === "new" && saveNewCustomer && buyerName) {
        customerId = await createFarmRecord(user.uid, activeAccountId, "customers", { name: buyerName, categoryId, categoryIds: [categoryId], active: true });
      }
      const method = activeMethods.find((item) => item.id === paymentMethodId);
      await saveSale(user.uid, activeAccountId, batch, {
        date, productType, productDescription: productType === "live_birds" ? "Live birds" : "Dressed chicken", quantity: qty, unit, pricePerUnit: price, totalValue: qty * price, paymentReceived: paid, outstanding: qty * price - paid,
        customer: buyerName || undefined, customerId, customerCategoryId: categoryId || undefined,
        customerCategoryName: categories.find((item) => item.id === categoryId)?.name, customerNameSnapshot: buyerName || undefined,
        paymentDate: paymentDate.trim() || undefined, paymentMethod: method?.name, paymentMethodId: method?.id, paymentMethodName: method?.name,
        deliveryCost: delivery, notes: notes.trim() || undefined,
      });
      Alert.alert("Sale saved", `Sale revenue ${money(qty * price)} · cash received ${money(paid)}.`); router.back();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this sale."); }
    finally { setSaving(false); }
  };

  return <BatchPage title="Record sale"><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
    <ThemedText type="tiny" color={muted}>Cash collected is recorded separately from unpaid sale value.</ThemedText>
    <FarmDatePicker label="Sale date" value={date} onChange={setDate} />
    <ThemedText type="defaultSemiBold">Customer category</ThemedText><View style={styles.chips}>{activeCategories.map((item) => <Chip key={item.id} label={item.name} selected={categoryId === item.id} onPress={() => { setCategoryId(item.id); setSelectedCustomerId(""); }} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
    <View style={styles.modeRow}><Chip label="Select saved customer" selected={customerMode === "saved"} onPress={() => setCustomerMode("saved")} accent={accent} surface={surface} border={border} muted={muted} /><Chip label="Enter new customer" selected={customerMode === "new"} onPress={() => { setCustomerMode("new"); setSelectedCustomerId(""); }} accent={accent} surface={surface} border={border} muted={muted} /></View>
    {customerMode === "saved" ? <><FarmField label="Search customers in category" value={customerSearch} onChangeText={setCustomerSearch} placeholder="Type a customer name" /><View style={styles.chips}>{matchingCustomers.map((item) => <Chip key={item.id} label={item.name} selected={selectedCustomerId === item.id} onPress={() => { setSelectedCustomerId(item.id); setCustomer(item.name); }} accent={accent} surface={surface} border={border} muted={muted} />)}{!matchingCustomers.length && <ThemedText type="tiny" color={muted}>No saved customers in this category. Enter a new customer to continue.</ThemedText>}</View></> : <><FarmField label="Buyer name (optional)" value={customer} onChangeText={setCustomer} placeholder="Buyer name" /><TouchableOpacity style={styles.checkbox} onPress={() => setSaveNewCustomer(!saveNewCustomer)}><ThemedText color={accent}>{saveNewCustomer ? "☑" : "☐"}</ThemedText><ThemedText type="tiny">Save this customer for future sales</ThemedText></TouchableOpacity></>}
    <ThemedText type="defaultSemiBold">Product type</ThemedText><View style={styles.modeRow}>{(["live_birds", "dressed_birds"] as const).map((type) => <Chip key={type} label={type === "live_birds" ? "Live birds" : "Dressed birds"} selected={productType === type} onPress={() => { setProductType(type); setUnit("birds"); }} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
    {productType === "dressed_birds" && <View style={styles.modeRow}>{(["birds", "kg"] as const).map((value) => <Chip key={value} label={`Per ${value}`} selected={unit === value} onPress={() => setUnit(value)} accent={accent} surface={surface} border={border} muted={muted} />)}</View>}
    <ThemedText type="tiny" color={muted}>{productType === "live_birds" ? `Live birds available: ${batch?.currentBirdsAlive ?? batch?.initialQuantity ?? "—"}` : "Dressed product should come from a slaughter record."}</ThemedText>
    <FarmField label={`Quantity (${unit})`} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="0" /><FarmField label={`Price per ${unit}`} value={pricePerUnit} onChangeText={setPricePerUnit} keyboardType="decimal-pad" placeholder="0.00" />
    <View style={[styles.total, { backgroundColor: surface, borderColor: border }]}><ThemedText type="tiny" color={muted}>Total sale value</ThemedText><ThemedText type="subtitle" color={accent}>{money(totalValue)}</ThemedText></View>
    <FarmField label="Payment received" value={paymentReceived} onChangeText={setPaymentReceived} keyboardType="decimal-pad" placeholder="0.00 (leave blank if unpaid)" /><ThemedText type="tiny" color={muted}>Outstanding balance: {money(Math.max(0, totalValue - (Number(paymentReceived) || 0)))}</ThemedText>
    <ThemedText type="defaultSemiBold">Payment method</ThemedText><View style={styles.chips}>{activeMethods.map((method) => <Chip key={method.id} label={method.name} selected={paymentMethodId === method.id} onPress={() => setPaymentMethodId(method.id)} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
    <FarmDatePicker label="Payment date (optional)" value={paymentDate} onChange={setPaymentDate} /><FarmField label="Delivery cost" value={deliveryCost} onChangeText={setDeliveryCost} keyboardType="decimal-pad" placeholder="0.00" /><FarmField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Sale notes" />
    {error && <ThemedText color={bad}>{error}</ThemedText>}<FarmButton label="Save sale" onPress={() => void save()} disabled={saving} />
  </ScrollView></BatchPage>;
}
function Chip({ label, selected, onPress, accent, surface, border, muted }: { label: string; selected: boolean; onPress: () => void; accent: string; surface: string; border: string; muted: string }) { return <TouchableOpacity onPress={onPress} style={[styles.choice, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? "#FFFFFF" : muted}>{label}</ThemedText></TouchableOpacity>; }
const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const styles = StyleSheet.create({ form: { padding: 18, paddingBottom: 30, gap: 14 }, modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { minHeight: 40, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 11 }, checkbox: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8 }, total: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 3 } });
