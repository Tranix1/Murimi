import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { BatchPage } from "@/app/Batches/_components";
import { FarmButton, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { createFarmRecord, updateFarmRecord, writeOffSaleBalance } from "@/services/farmRepository";
import type { CustomerCategory, FarmCustomer, FarmPaymentMethod, Sale, SalePayment } from "@/types/farm";

export default function SalesSettingsScreen() {
  const { user, activeAccountId } = useAuth();
  const { records: categories } = useFarmRecords<CustomerCategory>("customerCategories");
  const { records: customers } = useFarmRecords<FarmCustomer>("customers");
  const { records: methods } = useFarmRecords<FarmPaymentMethod>("paymentMethods");
  const { records: sales } = useFarmRecords<Sale>("sales");
  const { records: payments } = useFarmRecords<SalePayment>("payments");
  const [categoryName, setCategoryName] = useState(""); const [methodName, setMethodName] = useState(""); const [customerName, setCustomerName] = useState(""); const [phone, setPhone] = useState(""); const [location, setLocation] = useState(""); const [customerNotes, setCustomerNotes] = useState(""); const [customerQuery, setCustomerQuery] = useState(""); const [customerCategoryId, setCustomerCategoryId] = useState(""); const [editingId, setEditingId] = useState(""); const [editingName, setEditingName] = useState("");
  const [customerSort, setCustomerSort] = useState<"purchases" | "paid" | "outstanding" | "recent">("purchases"); const [expandedCustomerId, setExpandedCustomerId] = useState(""); const [editingPhone, setEditingPhone] = useState(""); const [writeOffReason, setWriteOffReason] = useState("");
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
  const saveCustomerPhone = async (id: string) => {
    const cleaned = editingPhone.trim();
    if (cleaned && !/^[+\d\s().-]{7,22}$/.test(cleaned)) { setError("Enter a valid phone number, or leave it blank."); return; }
    if (!user?.uid || !activeAccountId) return;
    try { await updateFarmRecord(user.uid, activeAccountId, "customers", id, { phone: cleaned || undefined }); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update customer phone."); }
  };
  const confirmWriteOff = (sale: Sale) => Alert.alert("Write off customer debt?", `Mark ${money(sale.outstanding)} as unrecoverable bad debt? This removes it from receivables and records a loss.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Write off", style: "destructive", onPress: async () => {
      if (!user?.uid || !activeAccountId) return;
      try { await writeOffSaleBalance(user.uid, activeAccountId, sale, writeOffReason.trim() || "Confirmed as unrecoverable by account owner"); setError(""); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not write off this balance."); }
    } },
  ]);
  const section = (title: string, children: React.ReactNode) => <View style={styles.section}><ThemedText type="subtitle">{title}</ThemedText>{children}</View>;
  const row = (record: { id: string; name: string; active: boolean }, collection: "customerCategories" | "paymentMethods" | "customers", detail?: string) => <View key={record.id} style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
    {editingId === record.id ? <><FarmField label="Rename" value={editingName} onChangeText={setEditingName} /><TouchableOpacity onPress={() => void changeName(collection, record.id, editingName)}><ThemedText color={accent}>Save name</ThemedText></TouchableOpacity>{collection === "customers" ? <><FarmField label="Phone (optional)" value={editingPhone} onChangeText={setEditingPhone} keyboardType="phone-pad" placeholder="+263 …" /><TouchableOpacity onPress={() => void saveCustomerPhone(record.id)}><ThemedText color={accent}>Save phone</ThemedText></TouchableOpacity></> : null}</> : <TouchableOpacity onPress={() => { setEditingId(record.id); setEditingName(record.name); setEditingPhone(collection === "customers" ? customers.find((customer) => customer.id === record.id)?.phone ?? "" : ""); }}><ThemedText type="defaultSemiBold">{record.name}</ThemedText><ThemedText type="tiny" color={muted}>{detail ?? ""} · {record.active ? "Active" : "Inactive"} · Tap name to edit</ThemedText></TouchableOpacity>}
    <TouchableOpacity onPress={() => void setActive(collection, record.id, !record.active)}><ThemedText type="tiny" color={record.active ? bad : accent}>{record.active ? "Deactivate" : "Reactivate"}</ThemedText></TouchableOpacity>
  </View>;
  return <BatchPage title="Sales settings"><ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
    {section("Customer categories", <><FarmField label="New category" value={categoryName} onChangeText={setCategoryName} placeholder="Butcher, Restaurant…" /><FarmButton label="Add category" onPress={() => { const name = categoryName.trim().replace(/\s+/g, " "); if (!name) return; if (categories.some((c) => c.name.trim().replace(/\s+/g, " ").toLowerCase() === name.toLowerCase())) return setError("That category already exists."); void add("customerCategories", { name, active: true }); setCategoryName(""); }} />{categories.map((r) => row(r, "customerCategories"))}</>)}
    {section("Payment methods", <><ThemedText type="tiny" color={muted}>Cash, EcoCash and Bank transfer are added automatically for each farm.</ThemedText><FarmField label="New payment method" value={methodName} onChangeText={setMethodName} placeholder="ZIPIT, InnBucks…" /><FarmButton label="Add payment method" onPress={() => { const name = methodName.trim().replace(/\s+/g, " "); if (!name) return; if (methods.some((m) => m.name.trim().replace(/\s+/g, " ").toLowerCase() === name.toLowerCase())) return setError("That payment method already exists."); void add("paymentMethods", { name, active: true }); setMethodName(""); }} />{methods.map((r) => row(r, "paymentMethods"))}</>)}
    {section("Customers", <><FarmField label="Customer name" value={customerName} onChangeText={setCustomerName} placeholder="Customer or business" /><ThemedText type="tiny" color={muted}>Choose a category</ThemedText><View style={styles.chips}>{categories.filter((c) => c.active).map((c) => <TouchableOpacity key={c.id} onPress={() => setCustomerCategoryId(c.id)} style={[styles.chip, { backgroundColor: customerCategoryId === c.id ? accent : surface, borderColor: border }]}><ThemedText type="tiny" color={customerCategoryId === c.id ? "#fff" : muted}>{c.name}</ThemedText></TouchableOpacity>)}</View><FarmField label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><FarmField label="Location / address (optional)" value={location} onChangeText={setLocation} placeholder="Location" /><FarmField label="Notes (optional)" value={customerNotes} onChangeText={setCustomerNotes} placeholder="Customer notes" /><FarmButton label="Add customer" onPress={() => { const name = customerName.trim().replace(/\s+/g, " "); if (!name || !customerCategoryId) return setError("Enter a name and select a category."); if (customers.some((c) => c.name.toLowerCase() === name.toLowerCase())) return setError("A customer with that name already exists."); void add("customers", { name, categoryId: customerCategoryId, phone: phone.trim() || undefined, location: location.trim() || undefined, notes: customerNotes.trim() || undefined, active: true, categoryIds: [customerCategoryId] }); setCustomerName(""); setPhone(""); setLocation(""); setCustomerNotes(""); }} /><FarmField label="Search saved customers" value={customerQuery} onChangeText={setCustomerQuery} placeholder="Name or phone" /><View style={styles.chips}>{(["purchases", "paid", "outstanding", "recent"] as const).map((sort) => <TouchableOpacity key={sort} onPress={() => setCustomerSort(sort)} style={[styles.chip, { backgroundColor: customerSort === sort ? accent : surface, borderColor: border }]}><ThemedText type="tiny" color={customerSort === sort ? "#fff" : muted}>Sort: {({ purchases: "purchases", paid: "amount paid", outstanding: "outstanding", recent: "recent purchase" })[sort]}</ThemedText></TouchableOpacity>)}</View>{customers.filter((r) => `${r.name} ${r.phone ?? ""} ${categories.find((c) => c.id === r.categoryId)?.name ?? ""}`.toLocaleLowerCase().includes(customerQuery.trim().toLocaleLowerCase())).map((r) => {
      const customerSales = sales.filter((sale) => sale.customerId === r.id).sort((a, b) => b.date.localeCompare(a.date));
      const paid = customerSales.reduce((sum, sale) => sum + sale.paymentReceived, 0);
      const purchased = customerSales.reduce((sum, sale) => sum + sale.totalValue, 0);
      const outstanding = customerSales.reduce((sum, sale) => sum + sale.outstanding, 0);
      const metric = customerSort === "purchases" ? purchased : customerSort === "paid" ? paid : customerSort === "outstanding" ? outstanding : customerSales[0]?.date ?? "";
      return { customer: r, customerSales, paid, purchased, outstanding, metric, lastDate: customerSales[0]?.date ?? "No purchases" };
    }).sort((a, b) => typeof a.metric === "number" && typeof b.metric === "number" ? b.metric - a.metric : String(b.metric).localeCompare(String(a.metric))).map(({ customer: r, customerSales, paid, purchased, outstanding, lastDate }) => {
      const customerPayments = payments.filter((payment) => customerSales.some((sale) => sale.id === payment.saleId));
      const saleHistory = customerSales.flatMap((sale) => {
        const laterPayments = customerPayments.filter((payment) => payment.saleId === sale.id);
        const initialPayment = Math.max(0, sale.paymentReceived - laterPayments.reduce((sum, payment) => sum + payment.amount, 0));
        return [{ date: sale.date, text: `Sale · ${sale.productDescription || sale.productType} · ${sale.quantity} ${sale.unit} · ${money(sale.totalValue)} · balance ${money(sale.outstanding)}` }, ...(initialPayment > 0 ? [{ date: sale.paymentDate || sale.date, text: `Payment at sale · ${money(initialPayment)}` }] : []), ...(sale.badDebtAmount ? [{ date: sale.badDebtDate || sale.date, text: `Bad debt written off · ${money(sale.badDebtAmount)} · ${sale.badDebtReason ?? "No reason recorded"}` }] : [])];
      });
      return <View key={r.id}>{row(r, "customers", `${r.phone ? `${r.phone} · ` : ""}${categories.find((c) => c.id === r.categoryId)?.name ?? "No category"}`)}<View style={{ paddingHorizontal: 12, paddingBottom: 10, gap: 4 }}><TouchableOpacity onPress={() => setExpandedCustomerId(expandedCustomerId === r.id ? "" : r.id)}><ThemedText type="tiny" color={muted}>Purchases {money(purchased)} · paid {money(paid)} · owed {money(outstanding)}</ThemedText><ThemedText type="tiny" color={muted}>{customerSales.length} sale(s) · last purchase {lastDate} · {expandedCustomerId === r.id ? "Hide" : "View"} history</ThemedText></TouchableOpacity>{expandedCustomerId === r.id ? <>{[...saleHistory, ...customerPayments.map((payment) => ({ date: payment.date, text: `Payment · ${money(payment.amount)}${payment.paymentMethodName ? ` · ${payment.paymentMethodName}` : ""}` }))].sort((a, b) => b.date.localeCompare(a.date)).map((entry, index) => <ThemedText key={`${entry.date}-${index}`} type="tiny" color={muted}>{entry.date} · {entry.text}</ThemedText>)}{customerSales.some((sale) => sale.outstanding > 0) ? <><FarmField label="Bad debt reason (optional)" value={writeOffReason} onChangeText={setWriteOffReason} placeholder="Why this balance will not be collected" />{customerSales.filter((sale) => sale.outstanding > 0).map((sale) => <TouchableOpacity key={`writeoff-${sale.id}`} onPress={() => confirmWriteOff(sale)}><ThemedText type="tiny" color={bad}>Write off {money(sale.outstanding)} for {sale.productDescription || sale.date}</ThemedText></TouchableOpacity>)}</> : null}</> : null}</View></View>;
    })}</>)}
    {error ? <ThemedText color={bad}>{error}</ThemedText> : null}
  </ScrollView></BatchPage>;
}
const styles = StyleSheet.create({ body: { padding: 18, paddingBottom: 35, gap: 18 }, section: { gap: 11 }, card: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 9 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { borderWidth: 1, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 11 } });
const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
