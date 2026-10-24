import React, { useMemo } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import CustomHeader from "@/components/CustomHeader";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import type { Batch, Expense, FarmPlan, FinancialTransaction, Sale } from "@/types/farm";
const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export default function PlansScreen() {
  const { records, isLoading } = useFarmRecords<FarmPlan>("plans");
  const { records: transactions } = useFarmRecords<FinancialTransaction>("transactions");
  const { records: batches } = useFarmRecords<Batch>("batches");
  const { records: sales } = useFarmRecords<Sale>("sales");
  const { records: expenses } = useFarmRecords<Expense>("expenses");
  const accent = useThemeColor("accent"); const spendColor = useThemeColor("bad"); const earnColor = useThemeColor("info"); const goodColor = useThemeColor("good"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const text = useThemeColor("text");
  const cash = transactions.reduce((sum, row) => sum + (row.direction === "inflow" ? row.amount : -row.amount), 0);
  const active = records.filter((row) => row.status !== "completed" && row.status !== "cancelled");
  const alerts = active.filter((row) => row.alertAtAmount && cash >= row.alertAtAmount);
  const completed = batches.filter((row) => row.status === "completed" || row.status === "archived");
  const averageProfit = useMemo(() => {
    if (!completed.length) return 0;
    const result = completed.map((batch) => sales.filter((sale) => sale.batchId === batch.id).reduce((sum, sale) => sum + sale.totalValue, 0) - expenses.filter((expense) => expense.batchId === batch.id).reduce((sum, expense) => sum + expense.amount, 0) - batch.initialQuantity * (batch.costPerUnit ?? 0) - batch.setupCost - batch.transportCost);
    return result.reduce((sum, value) => sum + value, 0) / result.length;
  }, [completed, sales, expenses]);
  return <ScreenWrapper fh={false}><CustomHeader pageTitle="Farm plans" addingNavigate="/Plans/Create" /><ScrollView contentContainerStyle={styles.content}>
    <ThemedText type="title" color={text}>Plans and targets</ThemedText><ThemedText type="tiny" color={muted} style={styles.subtitle}>Plan costs, track purchases and work, or set an income and break-even goal.</ThemedText>
    <View style={[styles.summary, { backgroundColor: surface, borderColor: border }]}><ThemedText type="tiny" color={muted}>Cash available</ThemedText><ThemedText type="title" color={text}>{money(cash)}</ThemedText><ThemedText type="tiny" color={muted}>Average completed batch profit {money(averageProfit)} · {completed.length} completed batches</ThemedText></View>
    {alerts.map((plan) => <View key={plan.id} style={styles.alert}><Ionicons name="notifications-outline" size={18} color="#2563EB" /><ThemedText type="tiny" color="#1D4ED8">Cash reached {money(plan.alertAtAmount ?? 0)} for “{plan.name}”. You can allocate {money(cash)}.</ThemedText></View>)}
    {isLoading ? <ThemedText type="tiny" color={muted}>Loading plans…</ThemedText> : records.length ? records.map((plan) => {
      const items = plan.items ?? [];
      const purchased = items.reduce((sum, item) => sum + item.purchasedQuantity, 0);
      const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
      const progress = totalQty > 0 ? Math.min(1, purchased / totalQty) : plan.amount > 0 ? Math.min(1, (plan.purpose === "earn" ? plan.recoveredAmount ?? 0 : plan.amountAllocated ?? plan.actualAmount) / plan.amount) : 0;
      const closed = plan.status === "completed" || !!plan.closedAt;
      const linked = plan.relatedBatchId ? batches.find((batch) => batch.id === plan.relatedBatchId)?.name : undefined;
      const estimatedRuns = averageProfit > 0 && plan.purpose === "earn" ? Math.ceil(Math.max(0, plan.amount - (plan.recoveredAmount ?? 0)) / averageProfit) : 0;
      return <TouchableOpacity key={plan.id} onPress={() => router.push({ pathname: "/Plans/Create" as never, params: { planId: plan.id } })} style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
        <View style={[styles.marker, { backgroundColor: closed ? goodColor : plan.purpose === "earn" ? earnColor : spendColor }]} />
        <View style={styles.copy}><View style={styles.titleRow}><ThemedText type="defaultSemiBold" color={text}>{plan.name}</ThemedText><Ionicons name={closed ? "checkmark-circle" : plan.purpose === "earn" ? "trending-up-outline" : "wallet-outline"} size={18} color={closed ? goodColor : plan.purpose === "earn" ? earnColor : spendColor} /></View>
          <ThemedText type="tiny" color={muted}>{plan.plannedDate} · {plan.category}{linked ? ` · ${linked}` : plan.farmRelated === false ? " · Not farm linked" : " · Farm plan"}</ThemedText>
          <ThemedText type="tiny" color={muted}>{plan.purpose === "earn" ? `Target ${money(plan.amount)} · recovered ${money(plan.recoveredAmount ?? 0)}${estimatedRuns ? ` · about ${estimatedRuns} batches left` : ""}` : `Budget ${money(plan.amount)} · allocated ${money(plan.amountAllocated ?? plan.actualAmount)}`}</ThemedText>
          {items.length ? <ThemedText type="tiny" color={muted}>{purchased} of {totalQty} units purchased · {items.length} cost/labour lines</ThemedText> : null}
          <View style={[styles.progressTrack, { backgroundColor: `${accent}20` }]}><View style={[styles.progressFill, { backgroundColor: closed ? goodColor : plan.purpose === "earn" ? earnColor : spendColor, width: `${Math.round(progress * 100)}%` }]} /></View>
          <ThemedText type="tiny" color={closed ? goodColor : plan.purpose === "earn" ? earnColor : spendColor}>{closed ? "Closed" : `${Math.round(progress * 100)}% complete · ${plan.status.replaceAll("_", " ")}`}</ThemedText>
        </View><Ionicons name="chevron-forward" size={18} color={muted} />
      </TouchableOpacity>;
    }) : <View style={[styles.empty, { backgroundColor: surface }]}><Ionicons name="calendar-outline" size={27} color={accent} /><ThemedText type="defaultSemiBold" color={text}>No plans yet</ThemedText><ThemedText type="tiny" color={muted}>Create an income target or a spending plan with itemized costs.</ThemedText></View>}
  </ScrollView></ScreenWrapper>;
}
const styles = StyleSheet.create({ content: { padding: 18, paddingBottom: 32 }, subtitle: { marginTop: 5, marginBottom: 15 }, summary: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 4, marginBottom: 12 }, alert: { flexDirection: "row", gap: 9, backgroundColor: "#DBEAFE", padding: 12, borderRadius: 12, marginBottom: 9 }, card: { borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 }, marker: { width: 4, alignSelf: "stretch", borderRadius: 3 }, copy: { flex: 1, gap: 5 }, titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, progressTrack: { height: 5, borderRadius: 5, overflow: "hidden", marginTop: 2 }, progressFill: { height: "100%", borderRadius: 5 }, empty: { alignItems: "center", padding: 24, borderRadius: 16, gap: 8 } });
