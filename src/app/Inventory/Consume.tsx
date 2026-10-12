import { BatchPage } from "@/app/Batches/_components";
import { FarmButton, FarmDatePicker, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { recordStockConsumption } from "@/services/farmRepository";
import type { Batch, InventoryItem } from "@/types/farm";
import { router, useLocalSearchParams } from "expo-router";
import { useId, useRef, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

function localDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export default function RecordStockUseScreen() {
    const { itemId } = useLocalSearchParams<{ itemId?: string }>();
    const { user, activeAccountId } = useAuth();
    const { records: items } = useFarmRecords<InventoryItem>("stock");
    const { records: batches } = useFarmRecords<Batch>("batches");
    const item = items.find((entry) => entry.id === itemId);
    const activeBatches = batches.filter((batch) => batch.status !== "completed" && batch.status !== "archived");
    const [batchId, setBatchId] = useState(""); const [quantity, setQuantity] = useState(""); const [date, setDate] = useState(localDate(new Date())); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
    const idempotencyKey = useRef(useId().replaceAll(":", ""));
    const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const bad = useThemeColor("bad");

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
        {item ? <><ThemedText type="subtitle">{item.name}</ThemedText><ThemedText type="tiny" color={muted}>Available in stock: {item.baseUnit}</ThemedText>
            <ThemedText type="defaultSemiBold">Batch</ThemedText><View style={styles.choices}>{activeBatches.map((batch) => <Choice key={batch.id} label={batch.name} selected={batchId === batch.id} onPress={() => setBatchId(batch.id)} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
            <FarmField label={`Quantity used (${item.baseUnit})`} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
            <FarmDatePicker label="Usage date" value={date} onChange={setDate} />
            {error ? <ThemedText type="tiny" color={bad}>{error}</ThemedText> : null}<FarmButton label="Record usage" onPress={() => void save()} disabled={saving} />
        </> : <ThemedText type="tiny" color={muted}>This inventory item is unavailable.</ThemedText>}
    </ScrollView></BatchPage>;
}

function Choice({ label, selected, onPress, accent, surface, border, muted }: { label: string; selected: boolean; onPress: () => void; accent: string; surface: string; border: string; muted: string }) { return <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, { backgroundColor: selected ? `${accent}18` : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? accent : muted}>{label}</ThemedText></TouchableOpacity>; }
const styles = StyleSheet.create({ body: { padding: 18, paddingBottom: 32, gap: 14 }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { overflow: "hidden", borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8 } });