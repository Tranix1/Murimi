import React, { useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { BatchPage } from "@/app/Batches/_components";
import { FarmButton, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { createFarmRecord, updateFarmRecord } from "@/services/farmRepository";
import type { CustomerCategory, FarmCustomer, FarmPaymentMethod } from "@/types/farm";

export default function SalesSettingsScreen() {
  const { user, activeAccountId } = useAuth();
  const { records: categories } = useFarmRecords<CustomerCategory>("customerCategories");
  const { records: customers } = useFarmRecords<FarmCustomer>("customers");
  const { records: methods } = useFarmRecords<FarmPaymentMethod>("paymentMethods");
  const [categoryName, setCategoryName] = useState(""); const [methodName, setMethodName] = useState(""); const [customerName, setCustomerName] = useState(""); const [phone, setPhone] = useState(""); const [location, setLocation] = useState(""); const [customerNotes, setCustomerNotes] = useState(""); const [customerQuery, setCustomerQuery] = useState(""); const [customerCategoryId, setCustomerCategoryId] = useState(""); const [editingId, setEditingId] = useState(""); const [editingName, setEditingName] = useState("");
  const accent = useThemeColor("accent"); const muted = useThemeColor("textlight"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const bad = useThemeColor("bad"); const [error, setError] = useState("");
  const add = async (collection: "customerCategories" | "paymentMethods" | "customers", data: Record<string, unknown>) => {
    if (!user?.uid || !activeAccountId) return setError("Select a farm account first.");
    try { await createFarmRecord(user.uid, activeAccountId, collection, data); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the record."); }
  };
  const changeName = async (collection: "customerCategories" | "paymentMethods" | "customers", id: string, name: string) => {
    if (!user?.uid || !activeAccountId || !name.trim()) return;
    const existing = collection === "customerCategories" ? categories : collection === "paymentMethods" ? methods : customers;
    if (existing.some((r) => r.id !== id && r.name.trim().replace(/\s+/g, " ").toLowerCase() === name.trim().replace(/\s+/g, " ").toLowerCase())) { setError("A record with that name already exists."); return; }
    await updateFarmRecord(user.uid, activeAccountId, collection, id, { name: name.trim().replace(/\s+/g, " ") }); setEditingId(""); setError("");
  };
  const setActive = async (collection: "customerCategories" | "paymentMethods" | "customers", id: string, active: boolean) => { if (user?.uid && activeAccountId) await updateFarmRecord(user.uid, activeAccountId, collection, id, { active }); };
  const section = (title: string, children: React.ReactNode) => <View style={styles.section}><ThemedText type="subtitle">{title}</ThemedText>{children}</View>;
  const row = (record: { id: string; name: string; active: boolean }, collection: "customerCategories" | "paymentMethods" | "customers", detail?: string) => <View key={record.id} style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
    {editingId === record.id ? <><FarmField label="Rename" value={editingName} onChangeText={setEditingName} /><TouchableOpacity onPress={() => void changeName(collection, record.id, editingName)}><ThemedText color={accent}>Save name</ThemedText></TouchableOpacity></> : <TouchableOpacity onPress={() => { setEditingId(record.id); setEditingName(record.name); }}><ThemedText type="defaultSemiBold">{record.name}</ThemedText><ThemedText type="tiny" color={muted}>{detail ?? ""} · {record.active ? "Active" : "Inactive"} · Tap name to rename</ThemedText></TouchableOpacity>}
    <TouchableOpacity onPress={() => void setActive(collection, record.id, !record.active)}><ThemedText type="tiny" color={record.active ? bad : accent}>{record.active ? "Deactivate" : "Reactivate"}</ThemedText></TouchableOpacity>
  </View>;
  return <BatchPage title="Sales settings"><ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
    {section("Customer categories", <><FarmField label="New category" value={categoryName} onChangeText={setCategoryName} placeholder="Butcher, Restaurant…" /><FarmButton label="Add category" onPress={() => { const name = categoryName.trim().replace(/\s+/g, " "); if (!name) return; if (categories.some((c) => c.name.trim().replace(/\s+/g, " ").toLowerCase() === name.toLowerCase())) return setError("That category already exists."); void add("customerCategories", { name, active: true }); setCategoryName(""); }} />{categories.map((r) => row(r, "customerCategories"))}</>)}
    {section("Payment methods", <><ThemedText type="tiny" color={muted}>Cash, EcoCash and Bank transfer are added automatically for each farm.</ThemedText><FarmField label="New payment method" value={methodName} onChangeText={setMethodName} placeholder="ZIPIT, InnBucks…" /><FarmButton label="Add payment method" onPress={() => { const name = methodName.trim().replace(/\s+/g, " "); if (!name) return; if (methods.some((m) => m.name.trim().replace(/\s+/g, " ").toLowerCase() === name.toLowerCase())) return setError("That payment method already exists."); void add("paymentMethods", { name, active: true }); setMethodName(""); }} />{methods.map((r) => row(r, "paymentMethods"))}</>)}
    {section("Customers", <><FarmField label="Customer name" value={customerName} onChangeText={setCustomerName} placeholder="Customer or business" /><ThemedText type="tiny" color={muted}>Choose a category</ThemedText><View style={styles.chips}>{categories.filter((c) => c.active).map((c) => <TouchableOpacity key={c.id} onPress={() => setCustomerCategoryId(c.id)} style={[styles.chip, { backgroundColor: customerCategoryId === c.id ? accent : surface, borderColor: border }]}><ThemedText type="tiny" color={customerCategoryId === c.id ? "#fff" : muted}>{c.name}</ThemedText></TouchableOpacity>)}</View><FarmField label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><FarmField label="Location / address (optional)" value={location} onChangeText={setLocation} placeholder="Location" /><FarmField label="Notes (optional)" value={customerNotes} onChangeText={setCustomerNotes} placeholder="Customer notes" /><FarmButton label="Add customer" onPress={() => { const name = customerName.trim().replace(/\s+/g, " "); if (!name || !customerCategoryId) return setError("Enter a name and select a category."); if (customers.some((c) => c.name.toLowerCase() === name.toLowerCase())) return setError("A customer with that name already exists."); void add("customers", { name, categoryId: customerCategoryId, phone: phone.trim() || undefined, location: location.trim() || undefined, notes: customerNotes.trim() || undefined, active: true, categoryIds: [customerCategoryId] }); setCustomerName(""); setPhone(""); setLocation(""); setCustomerNotes(""); }} /><FarmField label="Search saved customers" value={customerQuery} onChangeText={setCustomerQuery} placeholder="Name or category" />{customers.filter((r) => `${r.name} ${categories.find((c) => c.id === r.categoryId)?.name ?? ""}`.toLowerCase().includes(customerQuery.trim().toLowerCase())).map((r) => row(r, "customers", categories.find((c) => c.id === r.categoryId)?.name ?? "Category unavailable"))}</>)}
    {error ? <ThemedText color={bad}>{error}</ThemedText> : null}
  </ScrollView></BatchPage>;
}
const styles = StyleSheet.create({ body: { padding: 18, paddingBottom: 35, gap: 18 }, section: { gap: 11 }, card: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 9 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { borderWidth: 1, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 11 } });
