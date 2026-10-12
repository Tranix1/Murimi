import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { BatchPage } from "./_components";
import { FarmButton, FarmField } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { archiveFarmBatch } from "@/services/farmRepository";
import type { Batch, DailyRecord, Expense, Purchase, Sale, SlaughterRecord } from "@/types/farm";
export default function ArchiveBatchScreen() {
  const { batchId } = useLocalSearchParams<{ batchId?: string }>(); const { user, activeAccountId } = useAuth(); const { records: batches } = useFarmRecords<Batch>("batches"); const { records: daily } = useFarmRecords<DailyRecord>("dailyRecords"); const { records: expenses } = useFarmRecords<Expense>("expenses"); const { records: purchases } = useFarmRecords<Purchase>("purchases"); const { records: sales } = useFarmRecords<Sale>("sales"); const { records: slaughter } = useFarmRecords<SlaughterRecord>("slaughter"); const batch = batches.find((item) => item.id === batchId);
  const [typed, setTyped] = useState(""); const [reason, setReason] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const bad = useThemeColor("bad"); const muted = useThemeColor("textlight");
  if (!batch) return <BatchPage title="Archive batch"><ThemedText color={muted}>Batch unavailable.</ThemedText></BatchPage>;
  const identifier = batch.batchNumber ?? batch.name; const matches = typed.trim() === identifier;
  const archive = () => { if (!matches || !reason.trim() || !user?.uid || !activeAccountId) return setError("Type the exact batch identifier and provide an archive reason."); Alert.alert("Archive " + identifier + "?", "This keeps the batch and all related financial and production history. Only its status changes.", [{ text: "Cancel", style: "cancel" }, { text: "Archive batch", style: "destructive", onPress: () => { setSaving(true); void archiveFarmBatch(user.uid, activeAccountId, batch, reason).then(() => { Alert.alert("Batch archived", "Its related records were preserved."); router.replace("/(tabs)/batches" as never); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not archive batch.")).finally(() => setSaving(false)); } }]); };
  return <BatchPage title="Archive batch"><ScrollView contentContainerStyle={styles.form}><ThemedText type="subtitle">{identifier} · {batch.stockType}</ThemedText><ThemedText type="tiny" color={muted}>Arrival: {batch.dateStarted || "Unknown"} · {batch.initialQuantity} initial birds</ThemedText><ThemedText type="defaultSemiBold">Related records that will remain</ThemedText><ThemedText type="tiny" color={muted}>Daily/mortality: {daily.filter((x) => x.batchId === batch.id).length} · Expenses: {expenses.filter((x) => x.batchId === batch.id).length} · Sales: {sales.filter((x) => x.batchId === batch.id).length} · Slaughter: {slaughter.filter((x) => x.batchId === batch.id).length} · Purchases with allocations: {purchases.filter((x) => x.allocations.some((a) => a.batchId === batch.id)).length}</ThemedText><ThemedText type="tiny" color={muted}>Archive only changes this batch's status. It does not cascade-delete related or shared records.</ThemedText><FarmField label={"Type exactly: " + identifier} value={typed} onChangeText={setTyped} autoCapitalize="none" /><FarmField label="Reason for archiving" value={reason} onChangeText={setReason} multiline />{error ? <ThemedText color={bad}>{error}</ThemedText> : null}<FarmButton label="Archive this batch" onPress={archive} disabled={saving || !matches || !reason.trim()} /></ScrollView></BatchPage>;
}
const styles = StyleSheet.create({ form: { padding: 18, paddingBottom: 30, gap: 14 } });
