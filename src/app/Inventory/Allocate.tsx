import { BatchPage } from "@/app/Batches/_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { recordStockAllocation } from "@/services/farmRepository";
import { calculateInventoryBalances } from "@/Utilities/inventoryCalculations";
import type { Batch, InventoryItem, Purchase, StockMovement } from "@/types/farm";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

const money = (value: number | null) => value == null ? "Cost unavailable" : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const makeKey = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export default function AllocateStockScreen() {
  const { itemId } = useLocalSearchParams<{ itemId?: string }>(); const { user, activeAccountId } = useAuth();
  const { records: items } = useFarmRecords<InventoryItem>("stock"); const { records: purchases } = useFarmRecords<Purchase>("purchases"); const { records: movements } = useFarmRecords<StockMovement>("stockMovements"); const { records: batches } = useFarmRecords<Batch>("batches");
  const item = items.find((entry) => entry.id === itemId); const balance = item ? calculateInventoryBalances([item], purchases, movements).balances[0] : undefined;
  const receipts = purchases.filter((purchase) => purchase.inventoryItemId === itemId && purchase.receiptStatus !== "ordered").sort((a, b) => b.date.localeCompare(a.date)); const latest = receipts[0];
  const activeBatches = batches.filter((batch) => batch.status !== "completed" && batch.status !== "archived");
  const [batchId, setBatchId] = useState(""); const [quantityText, setQuantityText] = useState(""); const [allocateAll, setAllocateAll] = useState(false); const [date, setDate] = useState(today()); const [error, setError] = useState(""); const [saving, setSaving] = useState(false); const key = useRef(makeKey());
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const text = useThemeColor("text"); const bad = useThemeColor("bad");
  const quantity = Number(quantityText); const valid = Number.isFinite(quantity) && quantity > 0 && !!balance && quantity <= balance.available && balance.averageUnitCost != null;
  const allocatedValue = valid && balance?.averageUnitCost != null ? Math.round(quantity * balance.averageUnitCost * 100) / 100 : null;
  const remainingQuantity = balance ? Math.max(0, balance.available - (valid ? quantity : 0)) : null;
  const remainingValue = balance?.value != null && allocatedValue != null ? Math.max(0, Math.round((balance.value - allocatedValue) * 100) / 100) : balance?.value ?? null;
  const save = async () => {
    if (!user?.uid || !activeAccountId || !item) return setError("Select an inventory item and farm account first.");
    if (!batchId) return setError("Choose the batch receiving this stock.");
    if (!valid) return setError(balance?.averageUnitCost == null ? "Cost unavailable. Restore the recorded purchase value before allocating this stock." : `Enter a quantity greater than zero and no more than ${balance?.available ?? 0} ${item.baseUnit}.`);
    setSaving(true); setError("");
    try {
      await recordStockAllocation(user.uid, activeAccountId, { itemId: item.id, batchId, quantity, date, idempotencyKey: key.current });
      key.current = makeKey(); router.back();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not allocate this stock."); }
    finally { setSaving(false); }
  };
  return <BatchPage title="Allocate stock to batch"><ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
    {item && balance ? <>
      <ThemedText type="title" color={text}>{item.name}</ThemedText>
      {latest ? <ThemedText type="tiny" color={muted}>Latest purchase: {latest.quantity ?? latest.itemCount ?? "Quantity unavailable"} {latest.unit ?? item.baseUnit} · {money(latest.totalCost)} · {latest.date}</ThemedText> : null}
      <ThemedText type="tiny" color={muted}>Current average unit cost: {balance.averageUnitCost == null ? "Cost unavailable" : money(balance.averageUnitCost) + ` / ${item.baseUnit}`}</ThemedText>
      <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
        <Row label="Quantity available before allocation" value={`${balance.available} ${item.baseUnit}`} />
        <Row label="Value available before allocation" value={money(balance.value)} />
        <Row label="Quantity being allocated" value={`${valid ? quantity : 0} ${item.baseUnit}`} />
        <Row label="Value allocated to batch" value={money(allocatedValue)} />
        <Row label="Quantity remaining after allocation" value={remainingQuantity == null ? "—" : `${remainingQuantity} ${item.baseUnit}`} />
        <Row label="Value remaining after allocation" value={money(remainingValue)} />
      </View>
      <ThemedText type="defaultSemiBold">Batch</ThemedText><View style={styles.choices}>{activeBatches.map((batch) => <TouchableOpacity key={batch.id} onPress={() => setBatchId(batch.id)} style={[styles.choice, { backgroundColor: batchId === batch.id ? `${accent}18` : surface, borderColor: batchId === batch.id ? accent : border }]}><ThemedText type="tiny" color={batchId === batch.id ? accent : muted}>{batch.name} · Batch {batch.batchNumber ?? batch.id}</ThemedText></TouchableOpacity>)}</View>
      <ThemedText type="defaultSemiBold">Allocation amount</ThemedText><View style={styles.choices}><TouchableOpacity onPress={() => { setAllocateAll(true); setQuantityText(String(balance.available)); }} style={[styles.choice, { backgroundColor: allocateAll ? accent : surface, borderColor: allocateAll ? accent : border }]}><ThemedText type="tiny" color={allocateAll ? "#fff" : muted}>Allocate all ({balance.available} {item.baseUnit})</ThemedText></TouchableOpacity><TouchableOpacity onPress={() => { setAllocateAll(false); setQuantityText(""); }} style={[styles.choice, { backgroundColor: !allocateAll ? accent : surface, borderColor: !allocateAll ? accent : border }]}><ThemedText type="tiny" color={!allocateAll ? "#fff" : muted}>Allocate part</ThemedText></TouchableOpacity></View>
      {!allocateAll ? <FarmField label={`Quantity to allocate (${item.baseUnit})`} value={quantityText} onChangeText={setQuantityText} keyboardType="decimal-pad" placeholder={`Up to ${balance.available}`} /> : null}
      <FarmDatePicker label="Allocation date" value={date} onChange={setDate} />
      {error ? <ThemedText type="tiny" color={bad}>{error}</ThemedText> : null}
      <FarmButton label={saving ? "Allocating…" : "Allocate to batch"} onPress={() => void save()} disabled={saving} />
    </> : <ThemedText type="tiny" color={muted}>This inventory item is unavailable.</ThemedText>}
  </ScrollView></BatchPage>;
}
function Row({ label, value }: { label: string; value: string }) { const muted = useThemeColor("textlight"); const text = useThemeColor("text"); return <View style={styles.row}><ThemedText type="tiny" color={muted}>{label}</ThemedText><ThemedText type="defaultSemiBold" color={text}>{value}</ThemedText></View>; }
const styles = StyleSheet.create({ body: { padding: 18, paddingBottom: 32, gap: 14 }, card: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 13 }, row: { minHeight: 46, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#9CA3AF55", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8 } });
