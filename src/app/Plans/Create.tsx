/* eslint react-hooks/set-state-in-effect: "off" -- populate the edit form from the selected plan. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BatchPage } from "@/app/Batches/_components";
import { FarmButton, FarmField, FarmDatePicker } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { createFarmRecord, updateFarmRecord } from "@/services/farmRepository";
import type { Batch, FarmPlan, FarmPlanCategory } from "@/types/farm";

type PlanItem = NonNullable<FarmPlan["items"]>[number];
const freshItem = (): PlanItem => ({ id: `${Date.now()}-${Math.random()}`, name: "", quantity: 1, unit: "item", unitPrice: 0, purchasedQuantity: 0, actualAmount: 0 });
const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PlanFormScreen() {
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const { user, activeAccountId } = useAuth();
  const { records: plans } = useFarmRecords<FarmPlan>("plans");
  const { records: categories } = useFarmRecords<FarmPlanCategory>("planCategories");
  const { records: batches } = useFarmRecords<Batch>("batches");
  const { records: oldExpenses } = useFarmRecords<import("@/types/farm").Expense>("expenses");
  const { records: oldSales } = useFarmRecords<import("@/types/farm").Sale>("sales");
  const { records: old } = useFarmRecords<FarmPlan>("plans");
  const plan = plans.find((row) => row.id === planId) ?? old.find((row) => row.id === planId);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState<"spend" | "earn">("spend");
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [allocated, setAllocated] = useState("0");
  const [recovered, setRecovered] = useState("0");
  const [alertAt, setAlertAt] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [farmRelated, setFarmRelated] = useState(true);
  const [batchId, setBatchId] = useState("");
  const [items, setItems] = useState<PlanItem[]>([freshItem()]);
  const [closed, setClosed] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hydratedPlanId = useRef<string | null>(null);
  const accent = useThemeColor("accent"); const spendColor = useThemeColor("bad"); const earnColor = useThemeColor("info"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const danger = useThemeColor("bad");
  const relevantCategories = categories.filter((row) => row.active && (!row.purpose || row.purpose === purpose));
  const estimate = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, item.quantity) * Math.max(0, item.unitPrice), 0), [items]);
  const relatedBatch = batches.find((row) => row.id === batchId);
  const batchCosts = oldExpenses.filter((row) => row.batchId && batches.some((batch) => batch.id === row.batchId));
  const completed = batches.filter((row) => row.status === "completed" || row.status === "archived");
  const profits = completed.map((batch) => {
    const revenue = oldSales.filter((sale) => sale.batchId === batch.id).reduce((sum, sale) => sum + sale.totalValue, 0);
    const costs = batchCosts.filter((expense) => expense.batchId === batch.id).reduce((sum, expense) => sum + expense.amount, 0);
    return revenue - costs - batch.setupCost - batch.transportCost - batch.initialQuantity * (batch.costPerUnit ?? 0);
  }).filter(Number.isFinite);
  const avgBatchProfit = profits.length ? profits.reduce((sum, value) => sum + value, 0) / profits.length : 0;

  useEffect(() => {
    if (!plan || hydratedPlanId.current === plan.id) return;
    hydratedPlanId.current = plan.id;
    setName(plan.name); setPurpose(plan.purpose ?? "spend"); setCategoryName(plan.category); setAmount(String(plan.amount)); setAllocated(String(plan.amountAllocated ?? plan.actualAmount)); setRecovered(String(plan.recoveredAmount ?? 0)); setAlertAt(plan.alertAtAmount ? String(plan.alertAtAmount) : ""); setDate(plan.plannedDate); setFarmRelated(plan.farmRelated ?? !!plan.relatedBatchId); setBatchId(plan.relatedBatchId ?? ""); setItems(plan.items?.length ? plan.items : [freshItem()]); setClosed(plan.status === "completed" || !!plan.closedAt); setNotes(plan.notes ?? "");
  }, [plan]);

  const updateItem = (id: string, update: Partial<PlanItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  const addCategory = async () => {
    const label = newCategory.trim();
    if (!user?.uid || !activeAccountId || !label) return;
    try { const id = await createFarmRecord(user.uid, activeAccountId, "planCategories", { name: label, purpose, active: true }); setCategoryId(id); setCategoryName(label); setNewCategory(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save category."); }
  };
  const save = async () => {
    const target = Math.max(estimate, Number(amount) || 0);
    const allocatedAmount = Number(allocated) || 0; const recoveredAmount = Number(recovered) || 0;
    if (!user?.uid || !activeAccountId) { setError("Select a farm account before saving."); return; }
    const populatedItems = items.filter((item) => item.name.trim());
    const incompleteItems = items.some((item) => !item.name.trim() && (item.quantity !== 1 || item.unitPrice > 0 || item.purchasedQuantity > 0 || item.actualAmount > 0));
    if (!name.trim() || !categoryName.trim() || target < 0 || allocatedAmount < 0 || recoveredAmount < 0 || incompleteItems || populatedItems.some((item) => item.quantity < 0 || item.unitPrice < 0 || item.purchasedQuantity < 0 || item.purchasedQuantity > item.quantity || item.actualAmount < 0)) { setError("Add a plan name and category, then check each line and amount."); return; }
    if (farmRelated && !batchId && purpose === "earn" && !target) { setError("Set an earnings target for this farm plan."); return; }
    setSaving(true); setError("");
    const savedItems = populatedItems.map((item) => ({ ...item, name: item.name.trim() }));
    const status: FarmPlan["status"] = closed ? "completed" : allocatedAmount > 0 || savedItems.some((item) => item.purchasedQuantity > 0) ? "partially_completed" : "planned";
    const data: Omit<FarmPlan, "id" | "ownerId" | "accountId" | "createdAt" | "updatedAt"> = { name: name.trim(), category: categoryName.trim(), purpose, amount: target, plannedDate: date, farmRelated, relatedBatchId: farmRelated && batchId ? batchId : undefined, priority: "normal", status, actualAmount: savedItems.reduce((sum, item) => sum + item.actualAmount, allocatedAmount), amountAllocated: allocatedAmount, recoveredAmount, alertAtAmount: Number(alertAt) > 0 ? Number(alertAt) : undefined, targetProfit: purpose === "earn" ? target : undefined, items: savedItems, closedAt: closed ? plan?.closedAt ?? new Date().toISOString() : undefined, notes: notes.trim() || undefined };
    try { if (plan) await updateFarmRecord(user.uid, activeAccountId, "plans", plan.id, data); else await createFarmRecord(user.uid, activeAccountId, "plans", data); router.back(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save plan."); }
    finally { setSaving(false); }
  };

  return <BatchPage title={plan ? "Update plan" : "New plan"}><ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
    <FarmField label="Plan name" value={name} onChangeText={setName} placeholder="Build a fowl run" />
    <ThemedText type="defaultSemiBold">What is this plan for?</ThemedText><View style={styles.row}><Choice label="Spend money" icon="arrow-down-circle-outline" selected={purpose === "spend"} color={spendColor} onPress={() => setPurpose("spend")} /><Choice label="Earn / recover money" icon="trending-up-outline" selected={purpose === "earn"} color={earnColor} onPress={() => setPurpose("earn")} /></View>
    <ThemedText type="defaultSemiBold">Saved category</ThemedText><View style={styles.chips}>{relevantCategories.map((row) => <Choice label={row.name} selected={categoryId === row.id || categoryName === row.name} color={accent} onPress={() => { setCategoryId(row.id); setCategoryName(row.name); }} key={row.id} />)}{categoryName && !relevantCategories.some((row) => row.name === categoryName) ? <Choice label={categoryName} selected color={accent} onPress={() => {}} /> : null}</View>
    <View style={styles.row}><View style={styles.flex}><FarmField label="Add a new category" value={newCategory} onChangeText={setNewCategory} placeholder="Labour, bricks, egg sales…" /></View><TouchableOpacity onPress={() => void addCategory()} style={[styles.add, { backgroundColor: accent }]}><Ionicons name="add" color="#fff" size={23} /></TouchableOpacity></View>
    <TouchableOpacity onPress={() => setFarmRelated(!farmRelated)} style={styles.check}><Ionicons name={farmRelated ? "checkbox" : "square-outline"} size={20} color={accent} /><ThemedText>Related to this farm</ThemedText></TouchableOpacity>
    {farmRelated ? <><ThemedText type="defaultSemiBold">Link a batch (optional)</ThemedText><View style={styles.chips}><Choice label="No batch" selected={!batchId} color={accent} onPress={() => setBatchId("")} />{batches.map((row) => <Choice key={row.id} label={row.name} selected={batchId === row.id} color={accent} onPress={() => setBatchId(row.id)} />)}</View>{relatedBatch ? <ThemedText type="tiny" color={muted}>Linked to {relatedBatch.name}</ThemedText> : null}</> : null}
    <FarmDatePicker label="Target date" value={date} onChange={setDate} />
    <ThemedText type="defaultSemiBold">Plan items and labour</ThemedText><ThemedText type="tiny" color={muted}>Add each part separately. Record how many are purchased and what you actually paid.</ThemedText>
    {items.map((item, index) => <View key={item.id} style={[styles.item, { backgroundColor: surface, borderColor: border }]}><View style={styles.itemHeader}><ThemedText type="defaultSemiBold">Item {index + 1}</ThemedText><TouchableOpacity onPress={() => setItems((current) => current.length > 1 ? current.filter((row) => row.id !== item.id) : [freshItem()])}><Ionicons name="close-circle-outline" size={21} color={muted} /></TouchableOpacity></View><FarmField label="Item / work" value={item.name} onChangeText={(value) => updateItem(item.id, { name: value })} placeholder="Bricks, carpenter labour" /><View style={styles.row}><View style={styles.flex}><FarmField label="Qty" value={String(item.quantity)} onChangeText={(value) => updateItem(item.id, { quantity: Number(value) || 0 })} keyboardType="decimal-pad" /></View><View style={styles.flex}><FarmField label="Unit" value={item.unit} onChangeText={(unit) => updateItem(item.id, { unit })} placeholder="pieces, days" /></View></View><View style={styles.row}><View style={styles.flex}><FarmField label="Price each" value={String(item.unitPrice || "")} onChangeText={(value) => updateItem(item.id, { unitPrice: Number(value) || 0 })} keyboardType="decimal-pad" /></View><View style={styles.flex}><FarmField label="Purchased qty" value={String(item.purchasedQuantity || "")} onChangeText={(value) => updateItem(item.id, { purchasedQuantity: Number(value) || 0 })} keyboardType="decimal-pad" /></View></View><FarmField label="Actual paid for this line" value={String(item.actualAmount || "")} onChangeText={(value) => updateItem(item.id, { actualAmount: Number(value) || 0 })} keyboardType="decimal-pad" /><ThemedText type="tiny" color={muted}>Line estimate: {money(item.quantity * item.unitPrice)} · Left: {Math.max(0, item.quantity - item.purchasedQuantity)} {item.unit}</ThemedText></View>)}
    <FarmButton label="Add another item or labour line" secondary onPress={() => setItems((current) => [...current, freshItem()])} />
    <ThemedText type="defaultSemiBold">Money and progress</ThemedText><ThemedText type="tiny" color={muted}>Estimated total from items: {money(estimate)}{purpose === "earn" && avgBatchProfit > 0 ? ` · About ${Math.max(1, Math.ceil((Number(amount) || estimate) / avgBatchProfit))} average completed batches to reach target` : ""}</ThemedText>
    <FarmField label={purpose === "earn" ? "Earnings / break-even target" : "Total plan budget"} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={String(estimate)} />
    {purpose === "spend" ? <FarmField label="Money allocated to this plan" value={allocated} onChangeText={setAllocated} keyboardType="decimal-pad" /> : <FarmField label="Money recovered so far" value={recovered} onChangeText={setRecovered} keyboardType="decimal-pad" />}
    <FarmField label="Notify me when cash reaches (optional)" value={alertAt} onChangeText={setAlertAt} keyboardType="decimal-pad" placeholder="Amount available to allocate" />
    {batchId ? <ThemedText type="tiny" color={muted}>This plan is linked to {relatedBatch?.name}; sales and costs for that batch can be compared while you update recovered money here.</ThemedText> : null}
    <FarmField label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Purpose, supplier quotes, break-even notes" />
    <TouchableOpacity onPress={() => setClosed(!closed)} style={styles.check}><Ionicons name={closed ? "checkmark-circle" : "ellipse-outline"} size={20} color={closed ? "#16A34A" : accent} /><ThemedText color={closed ? "#16A34A" : undefined}>{closed ? "Plan closed" : "Close this plan"}</ThemedText></TouchableOpacity>
    {error ? <ThemedText type="tiny" color={danger}>{error}</ThemedText> : null}<FarmButton label={plan ? "Save plan progress" : "Save plan"} onPress={() => void save()} disabled={saving} />
  </ScrollView></BatchPage>;
}

function Choice({ label, selected, color, onPress, icon }: { label: string; selected: boolean; color: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) { const border = useThemeColor("border"); return <TouchableOpacity onPress={onPress} style={[styles.choice, { borderColor: selected ? color : border, backgroundColor: selected ? `${color}18` : "transparent" }]}>{icon ? <Ionicons name={icon} size={17} color={color} /> : null}<ThemedText type="tiny" color={selected ? color : undefined}>{label}</ThemedText></TouchableOpacity>; }
const styles = StyleSheet.create({ body: { padding: 18, gap: 14, paddingBottom: 36 }, row: { flexDirection: "row", alignItems: "center", gap: 9 }, flex: { flex: 1 }, add: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 20 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, choice: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 6 }, check: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 4 }, item: { borderWidth: 1, borderRadius: 15, padding: 12, gap: 12 }, itemHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" } });
