import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { BatchPage } from "./_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";
import { saveExpense } from "@/services/farmRepository";
import type { ExpenseCategory } from "@/types/farm";

const categories: { value: ExpenseCategory; label: string }[] = [
  { value: "feed", label: "Feed" }, { value: "medicine", label: "Medicine" }, { value: "bedding", label: "Bedding" },
  { value: "heating", label: "Heating" }, { value: "utilities", label: "Utilities" }, { value: "labour", label: "Labour" },
  { value: "processing", label: "Processing" }, { value: "packaging", label: "Packaging" }, { value: "delivery", label: "Delivery" },
  { value: "maintenance", label: "Maintenance" }, { value: "other", label: "Other" },
];

export default function BatchExpenseScreen() {
  const { batchId } = useLocalSearchParams<{ batchId?: string }>();
  const { user, activeAccountId } = useAuth();
  const [category, setCategory] = useState<ExpenseCategory>("feed");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const accent = useThemeColor("accent");
  const surface = useThemeColor("backgroundLight");
  const border = useThemeColor("border");
  const muted = useThemeColor("textlight");
  const bad = useThemeColor("bad");

  const save = async () => {
    const total = Number(amount);
    const paid = amountPaid.trim() ? Number(amountPaid) : 0;
    if (!user?.uid || !activeAccountId) return setError("The farm account could not be found.");
    if (!description.trim() || !Number.isFinite(total) || total <= 0 || !date.trim()) return setError("Enter a description, date and valid total amount.");
    if (!Number.isFinite(paid) || paid < 0 || paid > total) return setError("Amount paid must be between zero and the total expense.");
    setSaving(true);
    setError(null);
    try {
      await saveExpense(user.uid, activeAccountId, {
        ...(batchId ? { batchId } : {}), date, category, description: description.trim(), amount: total,
        quantity: quantity.trim() ? Number(quantity) : undefined, unit: unit.trim() || undefined,
        supplier: supplier.trim() || undefined, paymentStatus: paid === 0 ? "unpaid" : paid < total ? "partially_paid" : "paid",
        amountPaid: paid, notes: notes.trim() || undefined,
      });
      Alert.alert("Expense saved", "The expense and paid cash movement were recorded.");
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this expense.");
    } finally {
      setSaving(false);
    }
  };

  return <BatchPage title={batchId ? "Batch expense" : "Record expense"}><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
    <FarmDatePicker label="Date" value={date} onChange={setDate} />
    <FarmField label="Description" value={description} onChangeText={setDescription} placeholder="What was purchased or used?" />
    <ThemedText type="defaultSemiBold">Expense category</ThemedText>
    <View style={styles.categories}>{categories.map((item) => { const selected = category === item.value; return <TouchableOpacity key={item.value} onPress={() => setCategory(item.value)} style={[styles.category, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? "#FFFFFF" : muted} style={styles.categoryText}>{item.label}</ThemedText></TouchableOpacity>; })}</View>
    <FarmField label="Total expense amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
    <FarmField label="Amount paid" value={amountPaid} onChangeText={setAmountPaid} keyboardType="decimal-pad" placeholder="0.00 (leave blank if unpaid)" />
    <FarmField label="Quantity (optional)" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="Quantity purchased or used" />
    <FarmField label="Unit (optional)" value={unit} onChangeText={setUnit} placeholder="kg, bags, litres…" />
    <FarmField label="Supplier (optional)" value={supplier} onChangeText={setSupplier} placeholder="Supplier name" />
    <FarmField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Payment method, receipt reference or notes" />
    {error && <ThemedText color={bad}>{error}</ThemedText>}
    <FarmButton label="Save expense" onPress={() => void save()} disabled={saving} />
  </ScrollView></BatchPage>;
}

const styles = StyleSheet.create({ form: { padding: 18, paddingBottom: 30, gap: 15 }, categories: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, category: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7 }, categoryText: { fontWeight: "700" } });
