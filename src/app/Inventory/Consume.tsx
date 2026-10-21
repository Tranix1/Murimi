import { BatchPage } from "@/app/Batches/_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { recordStockConsumption } from "@/services/farmRepository";
import { calculateBatchAllocatedStock } from "@/Utilities/inventoryCalculations";
import type { Batch, InventoryItem, Purchase, StockMovement } from "@/types/farm";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

function localDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
const makeKey = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
const money = (value: number | null) => value == null ? "Cost unavailable" : `$${value.toFixed(2)}`;

export default function RecordStockUseScreen() {
    const { itemId } = useLocalSearchParams<{ itemId?: string }>();
    const { user, activeAccountId } = useAuth();
    const { records: items } = useFarmRecords<InventoryItem>("stock");
    const { records: batches } = useFarmRecords<Batch>("batches");
    const { records: purchases } = useFarmRecords<Purchase>("purchases"); const { records: movements } = useFarmRecords<StockMovement>("stockMovements");
    const item = items.find((entry) => entry.id === itemId);
    const activeBatches = batches.filter((batch) => batch.status !== "completed" && batch.status !== "archived");
    const [batchId, setBatchId] = useState(""); const [quantity, setQuantity] = useState(""); const [date, setDate] = useState(localDate(new Date())); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
    const idempotencyKey = useRef(makeKey());
    const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const bad = useThemeColor("bad");
    const batchStock = item && batchId ? calculateBatchAllocatedStock(item.id, batchId, purchases, movements, item) : null;
    const amount = Number(quantity); const usedValue = batchStock?.averageUnitCost != null && amount > 0 ? batchStock.averageUnitCost * amount : null;

    const save = async () => {
        const amount = Number(quantity);
        if (!user?.uid || !activeAccountId || !item) return setError("Select an active farm item first.");
        if (!batchId || !Number.isFinite(amount) || amount <= 0) return setError("Choose a batch and enter a positive quantity.");
        setSaving(true); setError("");
        try {
            await recordStockConsumption(user.uid, activeAccountId, { itemId: item.id, batchId, quantity: amount, unit: item.baseUnit, date, idempotencyKey: idempotencyKey.current });
            router.back();
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record stock usage."); }
        finally { setSaving(false); }
    };

    return <BatchPage title="Record batch use"><ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {item ? <><ThemedText type="subtitle">{item.name}</ThemedText><ThemedText type="tiny" color={muted}>Record actual usage from stock already allocated to a batch. Usage reduces batch stock; its cost was recognized when issued.</ThemedText>
            <ThemedText type="defaultSemiBold">Batch</ThemedText><View style={styles.choices}>{activeBatches.map((batch) => <Choice key={batch.id} label={`${batch.name} · ${batch.batchNumber ?? batch.id}`} selected={batchId === batch.id} onPress={() => setBatchId(batch.id)} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
            {batchStock ? <View style={[styles.stockCard, { backgroundColor: surface, borderColor: border }]}><ThemedText type="tiny" color={muted}>Allocated to batch: {batchStock.quantity} {item.baseUnit} · {money(batchStock.value)}</ThemedText><ThemedText type="tiny" color={muted}>Average unit cost: {batchStock.averageUnitCost == null ? "Cost unavailable" : `${money(batchStock.averageUnitCost)} / ${item.baseUnit}`}</ThemedText><ThemedText type="tiny" color={muted}>Planned use value: {money(usedValue)} · Remaining after use: {Math.max(0, batchStock.quantity - Math.max(0, amount || 0))} {item.baseUnit} · {money(batchStock.value != null && usedValue != null ? Math.max(0, batchStock.value - usedValue) : null)}</ThemedText></View> : null}
            <FarmField label={`Quantity used (${item.baseUnit})`} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
            <FarmDatePicker label="Usage date" value={date} onChange={setDate} />
            {error ? <ThemedText type="tiny" color={bad}>{error}</ThemedText> : null}<FarmButton label="Record usage" onPress={() => void save()} disabled={saving} />
        </> : <ThemedText type="tiny" color={muted}>This inventory item is unavailable.</ThemedText>}
    </ScrollView></BatchPage>;
}

function Choice({ label, selected, onPress, accent, surface, border, muted }: { label: string; selected: boolean; onPress: () => void; accent: string; surface: string; border: string; muted: string }) { return <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, { backgroundColor: selected ? `${accent}18` : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? accent : muted}>{label}</ThemedText></TouchableOpacity>; }
const styles = StyleSheet.create({ body: { padding: 18, paddingBottom: 32, gap: 14 }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { overflow: "hidden", borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8 }, stockCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 } });
