import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import CustomHeader from "@/components/CustomHeader";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import type { FarmPlan } from "@/types/farm";
const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export default function PlansScreen() {
  const { records, isLoading } = useFarmRecords<FarmPlan>("plans"); const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const text = useThemeColor("text");
  return <ScreenWrapper fh={false}><CustomHeader pageTitle="Farm plans" addingNavigate="/Plans/Create" /><ScrollView contentContainerStyle={styles.content}><ThemedText type="title" color={text}>Farm plans</ThemedText><ThemedText type="tiny" color={muted} style={styles.subtitle}>Keep upcoming spending and work visible.</ThemedText>{isLoading ? <ThemedText type="tiny" color={muted}>Loading plans…</ThemedText> : records.length ? records.map((plan) => <TouchableOpacity key={plan.id} onPress={() => router.push({ pathname: "/Plans/Create" as never, params: { planId: plan.id } })} style={[styles.card, { backgroundColor: surface, borderColor: border }]}><View style={[styles.date, { backgroundColor: `${accent}18` }]}><Ionicons name="calendar-outline" color={accent} size={18} /></View><View style={styles.copy}><ThemedText type="defaultSemiBold" color={text}>{plan.name}</ThemedText><ThemedText type="tiny" color={muted}>{plan.plannedDate} · {plan.category} · {plan.priority} priority</ThemedText><ThemedText type="tiny" color={accent}>{plan.status.replaceAll("_", " ")} · planned {money(plan.amount)} · actual {money(plan.actualAmount)}</ThemedText></View><Ionicons name="chevron-forward" size={18} color={muted} /></TouchableOpacity>) : <View style={[styles.empty, { backgroundColor: surface }]}><Ionicons name="calendar-outline" size={27} color={accent} /><ThemedText type="defaultSemiBold" color={text}>No plans yet</ThemedText><ThemedText type="tiny" color={muted}>Add a reminder or planned farm cost.</ThemedText></View>}</ScrollView></ScreenWrapper>;
}
const styles = StyleSheet.create({ content: { padding: 18, paddingBottom: 30 }, subtitle: { marginTop: 5, marginBottom: 18 }, card: { borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 }, date: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" }, copy: { flex: 1, gap: 4 }, empty: { alignItems: "center", padding: 24, borderRadius: 16, gap: 8 } });
