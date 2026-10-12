import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { BatchPage } from "@/app/Batches/_components";
import { FarmButton, FarmEmpty } from "@/components/farm/FarmComponents";
import { ThemedText } from "@/components/ThemedText";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import type { Batch, Expense } from "@/types/farm";
export default function ExpensesScreen() {
  const { records } = useFarmRecords<Expense>("expenses"); const { records: batches } = useFarmRecords<Batch>("batches"); const muted = useThemeColor("textlight"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border");
  return <BatchPage title="Expenses"><ScrollView contentContainerStyle={styles.body}><FarmButton label="Record expense" onPress={() => router.push("/Batches/Expenses" as never)} />{records.length ? records.map((e) => <TouchableOpacity key={e.id} onPress={() => e.batchId && router.push({ pathname: "/Batches/BatchDetails" as never, params: { batchId: e.batchId } })} style={[styles.card, { backgroundColor: surface, borderColor: border }]}><View style={styles.row}><ThemedText type="defaultSemiBold">{e.description}</ThemedText><ThemedText type="defaultSemiBold">${e.amount.toFixed(2)}</ThemedText></View><ThemedText type="tiny" color={muted}>{e.category.replaceAll("_", " ")} · {e.date} · {e.batchId ? batches.find((b) => b.id === e.batchId)?.name ?? "Batch" : "General farm"}</ThemedText></TouchableOpacity>) : <FarmEmpty title="No expenses yet" message="Record transport, labour, utilities, repairs, or other operating costs." icon="receipt-outline" />}</ScrollView></BatchPage>;
}
const styles = StyleSheet.create({ body: { padding: 18, gap: 10 }, card: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 6 }, row: { flexDirection: "row", justifyContent: "space-between", gap: 6 } });
