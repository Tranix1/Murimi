import { batchProductionStageForAge, batchProductionStageLabel, calculateBatchAgeDays, calculateBatchSummary, calculateMortalityAnalytics } from "@/Utilities/farmCalculations";
import { ThemedText } from "@/components/ThemedText";
import { FarmEmpty } from "@/components/farm/FarmComponents";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { updateFarmRecord } from "@/services/farmRepository";
import type { Batch, BatchProblem, DailyRecord, Expense, InventoryItem, MortalityRecord, Purchase, Sale, SlaughterRecord, StockMovement, WeightMeasurement } from "@/types/farm";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { BatchPage } from "./_components";

export default function BatchDetailsScreen() {
  const { batchId } = useLocalSearchParams<{ batchId?: string }>();
  const { records: batches, isLoading, error, userId, accountId } = useFarmRecords<Batch>("batches");
  const { records: daily } = useFarmRecords<DailyRecord>("dailyRecords");
  const { records: expenses } = useFarmRecords<Expense>("expenses");
  const { records: purchases } = useFarmRecords<Purchase>("purchases");
  const { records: stockMovements } = useFarmRecords<StockMovement>("stockMovements");
  const { records: inventoryItems } = useFarmRecords<InventoryItem>("stock");
  const { records: sales } = useFarmRecords<Sale>("sales");
  const { records: weights } = useFarmRecords<WeightMeasurement>("weights");
  const { records: slaughter } = useFarmRecords<SlaughterRecord>("slaughter");
  const { records: mortalityRecords } = useFarmRecords<MortalityRecord>("mortalityRecords");
  const { records: problems } = useFarmRecords<BatchProblem>("batchProblems");
  const accent = useThemeColor("accent");
  const surface = useThemeColor("backgroundLight");
  const border = useThemeColor("border");
  const muted = useThemeColor("textlight");
  const text = useThemeColor("text");
  const batch = batches.find((record) => record.id === batchId);

  if (isLoading) return <BatchPage title="Batch details"><View style={styles.center}><ActivityIndicator color={accent} /></View></BatchPage>;
  if (error) return <BatchPage title="Batch details"><FarmEmpty title="Unable to load batch" message={error} icon="cloud-offline-outline" /></BatchPage>;
  if (!batch) return <BatchPage title="Batch details"><FarmEmpty title="Batch not found" message="This batch may have been removed from this account." /></BatchPage>;

  const batchDaily = daily.filter((record) => record.batchId === batch.id);
  const batchExpenses = expenses.filter((record) => record.batchId === batch.id);
  const batchSales = sales.filter((record) => record.batchId === batch.id);
  const batchWeights = weights.filter((record) => record.batchId === batch.id);
  const batchSlaughter = slaughter.filter((record) => record.batchId === batch.id);
  const batchMortality = mortalityRecords.filter((record) => record.batchId === batch.id).sort((a, b) => b.date.localeCompare(a.date));
  const batchProblems = problems.filter((record) => record.batchId === batch.id).sort((a, b) => b.date.localeCompare(a.date));
  const batchPurchases = purchases.filter((purchase) => purchase.allocations.some((allocation) => allocation.batchId === batch.id));
  const batchStockEvents = stockMovements.filter((movement) => movement.batchId === batch.id && ["allocated", "consumed", "wasted", "returned"].includes(movement.type)).sort((a, b) => b.date.localeCompare(a.date));
  const summary = calculateBatchSummary(batch, batchDaily, batchExpenses, batchSales, batchWeights, batchSlaughter, purchases, stockMovements);
  const mortalityAnalytics = calculateMortalityAnalytics(batchMortality, batch.initialQuantity);
  const ageDays = batch.historical ? null : calculateBatchAgeDays(batch.dateStarted);
  const productionStage = ageDays == null || batch.status === "completed" || batch.status === "archived" ? null : batchProductionStageForAge(ageDays);
  const stageColor = productionStage ? stageColors[productionStage] : muted;
  const chickQuantity = batch.paidQuantity ?? batch.initialQuantity;
  const chickCost = batch.historical ? batch.historicalData?.chicksCost : (batch.costPerUnit ?? 0) * chickQuantity;
  const expectedRevenue = batch.expectedSellingPrice == null ? null : summary.birdsAlive * batch.expectedSellingPrice;
  const expectedProfit = expectedRevenue == null ? null : expectedRevenue - summary.costsIncurred;

  const actions = [
    { label: "Record today", icon: "today-outline" as const, path: "/Batches/RecordToday" },
    { label: "Record mortality", icon: "heart-outline" as const, path: "/Batches/Mortality" },
    { label: "Add observation", icon: "alert-circle-outline" as const, path: "/Batches/Problems" },
    { label: "Add weight", icon: "barbell-outline" as const, path: "/Batches/Weights" },
    { label: "Add expense", icon: "receipt-outline" as const, path: "/Batches/Expenses" },
    { label: "Record slaughter", icon: "restaurant-outline" as const, path: "/Batches/Slaughter" },
    { label: "Record sale", icon: "cash-outline" as const, path: "/Batches/Sales" },
  ];

  const updateCompletion = async (field: "productionComplete" | "sellingComplete") => {
    if (!userId || !accountId) return;
    if (field === "sellingComplete" && summary.birdsAlive > 0) {
      Alert.alert("Birds remain", `There are ${summary.birdsAlive} birds still available. Record their sale or loss before closing selling.`);
      return;
    }
    try {
      const updates: Record<string, unknown> = { [field]: true };
      if (field === "sellingComplete") updates.status = "selling";
      await updateFarmRecord(userId, accountId, "batches", batch.id, updates);
    } catch (cause) {
      Alert.alert("Could not update batch", cause instanceof Error ? cause.message : "Please try again.");
    }
  };

  const startSelling = async () => {
    if (!userId || !accountId) return;
    try {
      await updateFarmRecord(userId, accountId, "batches", batch.id, { status: "selling", productionComplete: true });
    } catch (cause) {
      Alert.alert("Could not start selling", cause instanceof Error ? cause.message : "Please try again.");
    }
  };

  return (
    <BatchPage title={ageDays == null ? batch.name : `${batch.name} · Day ${ageDays}`}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.subtitleRow}>
          <ThemedText type="tiny" color={muted}>{batch.batchNumber ? `${batch.batchNumber} · ` : ""}{batch.enterprise} · {batch.stockType} · Started {batch.dateStarted || "unknown"}{batch.dateStartedEstimated ? " (estimated)" : ""}</ThemedText>
          <ThemedText type="tiny" color={accent} style={styles.status}>{batch.status.replace("_", " ")}</ThemedText>
        </View>

        {productionStage ? <View style={[styles.stageBadge, { backgroundColor: `${stageColor}18`, borderColor: `${stageColor}66` }]}><View style={[styles.stageDot, { backgroundColor: stageColor }]} /><ThemedText type="tiny" color={stageColor}>{batchProductionStageLabel(productionStage)} · Day {ageDays}</ThemedText></View> : null}
        {productionStage === "ready_to_sell" && batch.status === "growing" ? <ThemedText type="tiny" color={stageColor} style={styles.readyNote}>This flock is past Day 35. Mark it as selling when you are ready to start recording sales.</ThemedText> : null}
        <View style={[styles.hero, { backgroundColor: accent }]}>
          <ThemedText type="tiny" style={styles.heroLabel}>Birds currently alive</ThemedText>
          <ThemedText type="title" style={styles.heroValue}>{summary.birdsAlive.toLocaleString()}</ThemedText>
          <ThemedText type="tiny" style={styles.heroLabel}>{summary.deaths} deaths · {summary.mortalityPercent == null ? "—" : `${summary.mortalityPercent.toFixed(1)}% mortality`}</ThemedText>
        </View>

        <View style={styles.actionGrid}>
          {actions.map((action) => (
            <TouchableOpacity key={action.label} activeOpacity={0.75} onPress={() => router.push({ pathname: action.path as never, params: { batchId: batch.id } })} style={[styles.action, { backgroundColor: surface, borderColor: border }]}>
              <Ionicons name={action.icon} size={21} color={accent} />
              <ThemedText type="tiny" color={text} style={styles.actionLabel}>{action.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        <SectionTitle title="Overview" />
        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Metric label="Initial birds" value={batch.historicalData?.unknownFields?.includes("initialQuantity") ? "Unknown" : batch.initialQuantity.toLocaleString()} />
          {batch.expectedSellingPrice != null ? <Metric label="Expected selling price per bird" value={money(batch.expectedSellingPrice)} /> : null}
          {expectedRevenue != null ? <Metric label="Expected revenue at current bird count" value={money(expectedRevenue)} /> : null}
          {expectedProfit != null ? <Metric label="Expected profit after recorded costs" value={money(expectedProfit)} /> : null}
          {batch.supplier ? <Metric label="Supplier" value={batch.supplier} /> : null}
          {batch.supplierId ? <Metric label="Supplier ID" value={batch.supplierId} /> : null}
          <Metric label="Birds sold" value={summary.birdsSold.toLocaleString()} />
          <Metric label="Recorded costs" value={summary.costsReliable === false ? `${money(summary.costsIncurred)} · Cost unavailable for some stock` : money(summary.costsIncurred)} />
          <Metric label="Cost per live bird" value={moneyOrDash(summary.costPerLiveBird)} />
          <Metric label="Feed consumed" value={`${summary.feedKg.toFixed(1)} kg (${summary.feedBags50Kg.toFixed(1)} bags)`} />
          <Metric label="Average live weight" value={weight(summary.averageLiveWeightKg)} />
          <Metric label="FCR" value={summary.fcr == null ? "Unavailable" : summary.fcr.toFixed(2)} />
          {batch.historical ? <><Metric label="Historical cost per bird sold" value={moneyOrDash(summary.costPerBirdSold)} /><Metric label="Historical cost per kg sold" value={moneyOrDash(summary.costPerKgSold)} /><Metric label="Historical feed cost" value={money(batch.historicalData?.feedCost ?? 0)} /><Metric label="Historical other costs" value={money(batch.historicalData?.otherOperatingCosts ?? 0)} />{summary.missingHistoricalInputs.length > 0 && <ThemedText type="tiny" color={muted}>Missing / unknown: {summary.missingHistoricalInputs.join(", ")}. Historical figures use recorded totals only.</ThemedText>}</> : null}
          <ThemedText onPress={() => Alert.alert("How calculated", "FCR = feed consumed (kg) ÷ flock live-weight gain (kg). Murimi only shows it when initial and current weights exist and there are no unweighed flock movements.")} type="tiny" color={accent} style={styles.help}>How calculated</ThemedText>
        </View>

        <SectionTitle title="Financial results" />
        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Metric label="Sales revenue" value={money(summary.revenue)} />
          <Metric label="Cash collected" value={money(summary.cashCollected)} />
          <Metric label="Outstanding payments" value={money(summary.receivables)} />
          <Metric label="Revenue less recorded costs" value={money(summary.profit)} />
          <ThemedText type="tiny" color={muted} style={styles.explainer}>This is not a complete profitability figure: inventory valuation, feed consumption cost allocation, and other unrecorded inputs may be missing.</ThemedText>
          <ThemedText type="tiny" color={muted} style={styles.explainer}>Unpaid sales are receivables; they are not included in cash collected.</ThemedText>
        </View>

        <View style={styles.sectionHeader}><SectionTitle title="Daily records" /><ThemedText type="tiny" color={muted}>{batchDaily.length} entries</ThemedText></View>
        {batchDaily.length ? batchDaily.slice(0, 5).map((entry) => <View key={entry.id} style={[styles.record, { backgroundColor: surface, borderColor: border }]}><ThemedText type="defaultSemiBold">{entry.date}</ThemedText><ThemedText type="tiny" color={muted}>{entry.openingCount} opened · {entry.deaths} deaths · {entry.closingCount} closed · {entry.feedKg ?? 0} kg feed</ThemedText></View>) : <ThemedText type="tiny" color={muted} style={styles.emptyHint}>No daily records yet.</ThemedText>}

        <View style={styles.sectionHeader}><SectionTitle title="Mortality events" /><ThemedText type="tiny" color={muted}>{batchMortality.length} events</ThemedText></View>
        {batchMortality.slice(0, 8).map((entry) => <View key={entry.id} style={[styles.record, { backgroundColor: surface, borderColor: border }]}><ThemedText type="defaultSemiBold">{entry.quantity} birds · {entry.customCause ?? entry.causeLabel}</ThemedText><ThemedText type="tiny" color={muted}>{entry.date}{entry.birdAgeDays ? ` · age ${entry.birdAgeDays} days (week ${Math.ceil(entry.birdAgeDays / 7)})` : " · age unknown"}{entry.suspectedDisease ? ` · ${entry.suspectedDisease} (${entry.diseaseStatus})` : ""}</ThemedText>{entry.symptoms.length ? <ThemedText type="tiny" color={muted}>{entry.symptoms.join(", ")}</ThemedText> : null}</View>)}
        {!batchMortality.length && <ThemedText type="tiny" color={muted} style={styles.emptyHint}>No separate mortality events recorded.</ThemedText>}
        {batchMortality.length > 0 ? <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}><Metric label="Mortality from event records" value={`${mortalityAnalytics.total} birds${mortalityAnalytics.mortalityPercent == null ? "" : ` · ${mortalityAnalytics.mortalityPercent.toFixed(1)}% of initial flock`}`} />{mortalityAnalytics.byCause.map(([code, count]) => <Metric key={code} label={`Cause: ${batchMortality.find((entry) => entry.causeCode === code)?.causeLabel ?? code}`} value={`${count} birds (suspected)`} />)}{mortalityAnalytics.byWeek.map(([week, count]) => <Metric key={`week-${week}`} label={`Week ${week}`} value={`${count} deaths`} />)}<ThemedText type="tiny" color={muted}>Cause categories record farmer suspicion and do not establish diagnosis or causation.</ThemedText></View> : null}

        <View style={styles.sectionHeader}><SectionTitle title="Problems and observations" /><ThemedText type="tiny" color={muted}>{batchProblems.length} entries</ThemedText></View>
        {batchProblems.slice(0, 8).map((entry) => <View key={entry.id} style={[styles.record, { backgroundColor: surface, borderColor: border }]}><ThemedText type="defaultSemiBold">{entry.customCategory ?? entry.category.replaceAll("_", " ")} · {entry.severity ?? "severity unknown"}</ThemedText><ThemedText type="tiny" color={muted}>{entry.date} · {entry.description}</ThemedText>{entry.actionTaken ? <ThemedText type="tiny" color={muted}>Action: {entry.actionTaken}</ThemedText> : null}{entry.outcome ? <ThemedText type="tiny" color={muted}>Outcome: {entry.outcome}</ThemedText> : null}</View>)}
        {!batchProblems.length && <ThemedText type="tiny" color={muted} style={styles.emptyHint}>No problem or observation notes recorded.</ThemedText>}

        <View style={styles.sectionHeader}><SectionTitle title="Purchases" /><ThemedText type="tiny" color={muted}>{batchPurchases.length + (chickCost != null && chickCost > 0 ? 1 : 0)} entries</ThemedText></View>
        {chickCost != null && chickCost > 0 ? <View style={[styles.record, { backgroundColor: surface, borderColor: border }]}><ThemedText type="defaultSemiBold">Chicks · initial batch purchase</ThemedText><ThemedText type="tiny" color={muted}>{chickQuantity.toLocaleString()} birds · {money(chickCost)} total · {money(chickCost / Math.max(1, chickQuantity))} per bird{batch.supplier ? ` · ${batch.supplier}` : ""}</ThemedText></View> : null}
        {batchPurchases.slice(0, 5).map((purchase) => <View key={purchase.id} style={[styles.record, { backgroundColor: surface, borderColor: border }]}><ThemedText type="defaultSemiBold">{purchase.itemName}</ThemedText><ThemedText type="tiny" color={muted}>{purchase.date} · {purchase.category} · {money(purchase.totalCost)}</ThemedText></View>)}
        {!batchPurchases.length && !(chickCost != null && chickCost > 0) && <ThemedText type="tiny" color={muted} style={styles.emptyHint}>No purchases allocated to this batch.</ThemedText>}

        <View style={styles.sectionHeader}><SectionTitle title="Inventory issued and used" /><ThemedText type="tiny" color={muted}>{batchStockEvents.length} movements</ThemedText></View>
        {batchStockEvents.slice(0, 10).map((movement) => <View key={movement.id} style={[styles.record, { backgroundColor: surface, borderColor: border }]}><ThemedText type="defaultSemiBold">{inventoryItems.find((item) => item.id === movement.itemId)?.name ?? "Inventory item"} · {movement.type.replaceAll("_", " ")}</ThemedText><ThemedText type="tiny" color={muted}>{movement.date} · {movement.quantity} {movement.unit} · {movement.totalCost == null ? "Cost unavailable" : money(movement.totalCost)}</ThemedText></View>)}
        {!batchStockEvents.length && <ThemedText type="tiny" color={muted} style={styles.emptyHint}>No stock issued or used for this batch.</ThemedText>}

        <View style={styles.sectionHeader}><SectionTitle title="Expenses and feed" /><ThemedText type="tiny" color={muted}>{batchExpenses.length} entries</ThemedText></View>
        {batchExpenses.slice(0, 5).map((expense) => <View key={expense.id} style={[styles.record, { backgroundColor: surface, borderColor: border }]}><ThemedText type="defaultSemiBold">{expense.description}</ThemedText><ThemedText type="tiny" color={muted}>{expense.date} · {expense.category.replace("_", " ")} · {money(expense.amount)}</ThemedText></View>)}
        {!batchExpenses.length && <ThemedText type="tiny" color={muted} style={styles.emptyHint}>No expenses recorded.</ThemedText>}

        <View style={styles.sectionHeader}><SectionTitle title="Sales and slaughter" /><ThemedText type="tiny" color={muted}>{batchSales.length} sales</ThemedText></View>
        {batchSales.slice(0, 5).map((sale) => <View key={sale.id} style={[styles.record, { backgroundColor: surface, borderColor: border }]}><ThemedText type="defaultSemiBold">{sale.customerNameSnapshot ?? sale.customer ?? "Walk-in customer"} · {sale.quantity} {sale.unit} · {money(sale.totalValue)}</ThemedText><ThemedText type="tiny" color={muted}>{sale.date} · {sale.customerCategoryName ?? "Uncategorized"} · {sale.paymentMethodName ?? sale.paymentMethod ?? "No method"} · received {money(sale.paymentReceived)} · outstanding {money(sale.outstanding)}</ThemedText></View>)}
        {!batchSales.length && <ThemedText type="tiny" color={muted} style={styles.emptyHint}>No sales recorded.</ThemedText>}
        {batchSales.length > 0 && <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <ThemedText type="defaultSemiBold">Revenue by customer category</ThemedText>
          {groupSales(batchSales, (sale) => sale.customerCategoryName ?? "Uncategorized", (sale) => sale.totalValue).map(([name, amount]) => <Metric key={`category-${name}`} label={name} value={money(amount)} />)}
          <ThemedText type="defaultSemiBold">Cash received by payment method</ThemedText>
          {groupSales(batchSales, (sale) => sale.paymentMethodName ?? sale.paymentMethod ?? "Unspecified", (sale) => sale.paymentReceived).map(([name, amount]) => <Metric key={`method-${name}`} label={name} value={money(amount)} />)}
        </View>}
        {batchSlaughter.map((entry) => <View key={entry.id} style={[styles.record, { backgroundColor: surface, borderColor: border }]}><ThemedText type="defaultSemiBold">Slaughter · {entry.quantitySlaughtered} birds</ThemedText><ThemedText type="tiny" color={muted}>{entry.date} · live {entry.liveWeightKg} kg · dressed {entry.dressedWeightKg} kg</ThemedText></View>)}

        <SectionTitle title="Batch status" />
        <View style={styles.completionRow}>
          {batch.status === "growing" && <TouchableOpacity onPress={() => void startSelling()} style={[styles.completionButton, { backgroundColor: stageColor, borderColor: stageColor }]}><ThemedText type="tiny" style={styles.white}>Start selling</ThemedText></TouchableOpacity>}
          {!batch.productionComplete && <TouchableOpacity onPress={() => void updateCompletion("productionComplete")} style={[styles.completionButton, { borderColor: border }]}><ThemedText type="tiny" color={text}>Mark production complete</ThemedText></TouchableOpacity>}
          {!batch.sellingComplete && <TouchableOpacity onPress={() => void updateCompletion("sellingComplete")} style={[styles.completionButton, { backgroundColor: accent, borderColor: accent }]}><ThemedText type="tiny" style={styles.white}>Close selling</ThemedText></TouchableOpacity>}
          {batch.productionComplete && <ThemedText type="tiny" color={muted}>Production complete</ThemedText>}
          {batch.sellingComplete && <ThemedText type="tiny" color={muted}>Selling complete</ThemedText>}
          {batch.status !== "completed" && batch.status !== "archived" && <TouchableOpacity onPress={() => router.push({ pathname: "/Batches/CloseBatch" as never, params: { batchId: batch.id } })} style={[styles.completionButton, { backgroundColor: accent, borderColor: accent }]}><ThemedText type="tiny" style={styles.white}>Review and close batch</ThemedText></TouchableOpacity>}
          {batch.status !== "archived" && <TouchableOpacity onPress={() => router.push({ pathname: "/Batches/ArchiveBatch" as never, params: { batchId: batch.id } })} style={[styles.completionButton, { borderColor: border }]}><ThemedText type="tiny" color={text}>Archive batch</ThemedText></TouchableOpacity>}
        </View>
      </ScrollView>
    </BatchPage>
  );
}

function SectionTitle({ title }: { title: string }) {
  const text = useThemeColor("text");
  return <ThemedText type="subtitle" color={text} style={styles.sectionTitle}>{title}</ThemedText>;
}

function Metric({ label, value }: { label: string; value: string }) {
  const muted = useThemeColor("textlight");
  return <View style={styles.metric}><ThemedText type="tiny" color={muted}>{label}</ThemedText><ThemedText type="defaultSemiBold">{value}</ThemedText></View>;
}

const money = (amount: number) => `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyOrDash = (amount: number | null) => amount == null ? "—" : money(amount);
const weight = (amount: number | null) => amount == null ? "—" : `${amount.toFixed(2)} kg`;
function groupSales(sales: Sale[], label: (sale: Sale) => string, value: (sale: Sale) => number): [string, number][] {
  const groups = new Map<string, number>();
  for (const sale of sales) groups.set(label(sale), (groups.get(label(sale)) ?? 0) + Math.max(0, value(sale)));
  return [...groups.entries()];
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 17, paddingBottom: 28 },
  subtitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  status: { textTransform: "capitalize", fontWeight: "700" },
  stageBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 15, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  readyNote: { paddingBottom: 12, lineHeight: 18 },
  hero: { borderRadius: 18, padding: 18, marginBottom: 14, gap: 3 },
  heroLabel: { color: "#FFFFFFD8" },
  heroValue: { color: "#FFFFFF", fontSize: 34, lineHeight: 39 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 22 },
  action: { width: "31.5%", minHeight: 76, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", padding: 8, gap: 5 },
  actionIcon: { fontWeight: "800" },
  actionLabel: { textAlign: "center", fontSize: 11 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 7 },
  sectionTitle: { fontSize: 17, marginBottom: 10, marginTop: 7 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 17, gap: 12 },
  metric: { flexDirection: "row", justifyContent: "space-between", gap: 9 },
  help: { fontWeight: "700", paddingTop: 3 },
  explainer: { lineHeight: 18, paddingTop: 3 },
  record: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 4, marginBottom: 8 },
  emptyHint: { paddingBottom: 10 },
  completionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 15 },
  completionButton: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  white: { color: "#FFFFFF", fontWeight: "700" },
});

const stageColors = { starter: "#A16207", growing: "#087E8B", finishing: "#C2410C", ready_to_sell: "#15803D" };
