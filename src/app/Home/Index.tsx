import { calculateBatchSummary, calculateFinanceSummary, purchaseBackedAssets } from "@/Utilities/farmCalculations";
import { calculateInventoryBalances } from "@/Utilities/inventoryCalculations";
import CustomHeader from "@/components/CustomHeader";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { FarmSyncStatus } from "@/components/farm/FarmSyncStatus";
import { useAuth } from "@/context/AuthContext";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import type { Batch, DailyRecord, Expense, FarmAsset, FarmPlan, FinancialTransaction, InventoryItem, Purchase, Sale, SlaughterRecord, StockMovement, WeightMeasurement } from "@/types/farm";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

const money = (amount: number) => `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Home() {
  const { activeAccountName, currentRole } = useAuth();
  const accent = useThemeColor("accent");
  const border = useThemeColor("border");
  const muted = useThemeColor("textlight");
  const text = useThemeColor("text");
  const surface = useThemeColor("backgroundLight");
  const { records: batches, isLoading, error } = useFarmRecords<Batch>("batches");
  const { records: daily } = useFarmRecords<DailyRecord>("dailyRecords");
  const { records: expenses } = useFarmRecords<Expense>("expenses");
  const { records: purchases } = useFarmRecords<Purchase>("purchases");
  const { records: sales } = useFarmRecords<Sale>("sales");
  const { records: weights } = useFarmRecords<WeightMeasurement>("weights");
  const { records: slaughter } = useFarmRecords<SlaughterRecord>("slaughter");
  const { records: transactions } = useFarmRecords<FinancialTransaction>("transactions");
  const { records: assets } = useFarmRecords<FarmAsset>("assets");
  const { records: plans } = useFarmRecords<FarmPlan>("plans");
  const { records: inventoryItems } = useFarmRecords<InventoryItem>("stock");
  const { records: stockMovements } = useFarmRecords<StockMovement>("stockMovements");

  const batchSummaries = batches.map((batch) => ({
    batch,
    summary: calculateBatchSummary(batch,
      daily.filter((entry) => entry.batchId === batch.id),
      expenses.filter((entry) => entry.batchId === batch.id),
      sales.filter((entry) => entry.batchId === batch.id),
      weights.filter((entry) => entry.batchId === batch.id),
      slaughter.filter((entry) => entry.batchId === batch.id), purchases, stockMovements),
  }));
  const inventory = calculateInventoryBalances(inventoryItems, purchases, stockMovements);
  const finance = calculateFinanceSummary({ transactions, sales, expenses, purchases, assets: purchaseBackedAssets(purchases, assets), inventoryValue: inventory.totalValue, stockMovements });
  const totalAlive = batchSummaries.reduce((sum, item) => sum + item.summary.birdsAlive, 0);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = plans.filter((plan) => plan.status !== "completed" && plan.status !== "cancelled" && plan.plannedDate >= today).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)).slice(0, 3);

  const go = (path: string) => router.push(path as never);
  return (
    <ScreenWrapper fh={false}>
      <CustomHeader pageTitle="Murimi" />
      <View style={[styles.accountStrip, { borderBottomColor: border }]}>
        <Ionicons name="checkmark-circle" size={15} color={accent} />
        <ThemedText type="tiny" color={muted}>Selected account</ThemedText>
        <ThemedText type="tiny" color={text} style={styles.accountName}>{activeAccountName ?? "acc 1"}</ThemedText>
        {currentRole?.accType ? <ThemedText type="tiny" color={muted}>· {currentRole.accType}</ThemedText> : null}
      </View>
      <FarmSyncStatus />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <View style={styles.headingCopy}>
            <ThemedText type="title" color={text}>Farm overview</ThemedText>
            <ThemedText type="tiny" color={muted}>Live records for your selected account</ThemedText>
          </View>
          <View style={[styles.count, { backgroundColor: `${accent}18` }]}>
            <ThemedText type="defaultSemiBold" color={accent}>{batches.length}</ThemedText>
            <ThemedText type="tiny" color={accent}>batches</ThemedText>
          </View>
        </View>

        <View style={styles.metrics}>
          <MetricCard icon="wallet-outline" label="Working capital" value={money(finance.workingCapital)} detail="Cash + receivables + inventory − payables" onPress={() => go("/(tabs)/finances")} />
          <MetricCard icon="business-outline" label="Fixed assets" value={money(finance.fixedAssets)} detail="Estimated current value" onPress={() => go("/Assets/Index")} />
          <MetricCard icon="cash-outline" label="Sales revenue" value={money(finance.revenue)} detail={`${money(finance.receivables)} outstanding`} onPress={() => go("/(tabs)/finances")} />
          <MetricCard icon="leaf-outline" label="Birds alive" value={totalAlive.toLocaleString()} detail="Across all batches" onPress={() => go("/(tabs)/batches")} />
        </View>

        <View style={styles.sectionHeader}>
          <View><ThemedText type="subtitle" color={text}>Production batches</ThemedText><ThemedText type="tiny" color={muted}>{batches.length} recorded · {totalAlive.toLocaleString()} alive</ThemedText></View>
          <TouchableOpacity onPress={() => go("/(tabs)/batches")}><ThemedText type="tiny" color={accent} style={styles.link}>View all</ThemedText></TouchableOpacity>
        </View>
        {isLoading ? <ActivityIndicator color={accent} style={styles.loader} /> : error ? <Notice text={`Batches could not load: ${error}`} /> : batches.length === 0 ? (
          <TouchableOpacity onPress={() => go("/Batches/CreateBatch")} activeOpacity={0.75} style={[styles.emptyCard, { backgroundColor: surface, borderColor: border }]}>
            <View style={[styles.actionIcon, { backgroundColor: `${accent}18` }]}><Ionicons name="add" size={22} color={accent} /></View>
            <View style={styles.flex}><ThemedText type="defaultSemiBold" color={text}>Create your first batch</ThemedText><ThemedText type="tiny" color={muted}>Start recording production for this account.</ThemedText></View>
            <Ionicons name="chevron-forward" size={19} color={muted} />
          </TouchableOpacity>
        ) : batchSummaries.slice(0, 4).map(({ batch, summary }) => (
          <TouchableOpacity key={batch.id} activeOpacity={0.8} onPress={() => router.push({ pathname: "/Batches/BatchDetails" as never, params: { batchId: batch.id } })} style={[styles.batchCard, { backgroundColor: surface, borderColor: border }]}>
            <View style={[styles.batchIcon, { backgroundColor: `${accent}18` }]}><Ionicons name="leaf-outline" size={20} color={accent} /></View>
            <View style={styles.flex}><ThemedText type="defaultSemiBold" color={text}>{batch.name} · Batch {batch.batchNumber ?? batch.id}</ThemedText><ThemedText type="tiny" color={muted}>{batch.enterprise} · {batch.stockType} · {summary.birdsAlive.toLocaleString()} alive</ThemedText></View>
            <View style={styles.batchEnd}><ThemedText type="tiny" color={accent}>{batch.status.replace("_", " ")}</ThemedText><Ionicons name="chevron-forward" size={16} color={muted} /></View>
          </TouchableOpacity>
        ))}

        <View style={styles.sectionHeader}><ThemedText type="subtitle" color={text}>Quick actions</ThemedText></View>
        <View style={styles.quickActions}>
          <QuickAction icon="add-circle-outline" label="New batch" onPress={() => go("/Batches/CreateBatch")} />
          <QuickAction icon="today-outline" label="Record today" onPress={() => batches[0] ? router.push({ pathname: "/Batches/RecordToday" as never, params: { batchId: batches[0].id } }) : go("/Batches/CreateBatch")} />
          <QuickAction icon="calendar-outline" label="Add plan" onPress={() => go("/Plans/Create")} />
          <QuickAction icon="cart-outline" label="Record Purchase" onPress={() => go("/Farm/RecordPurchase")} />
        </View>

        <View style={styles.sectionHeader}><View><ThemedText type="subtitle" color={text}>Upcoming plans</ThemedText><ThemedText type="tiny" color={muted}>Your saved reminders</ThemedText></View><TouchableOpacity onPress={() => go("/Plans/Index")}><ThemedText type="tiny" color={accent} style={styles.link}>See all</ThemedText></TouchableOpacity></View>
        {upcoming.length ? upcoming.map((plan) => <View key={plan.id} style={[styles.planRow, { backgroundColor: surface, borderColor: border }]}><View style={[styles.planDate, { backgroundColor: `${accent}18` }]}><ThemedText type="tiny" color={accent}>{plan.plannedDate.slice(5)}</ThemedText></View><View style={styles.flex}><ThemedText type="defaultSemiBold" color={text}>{plan.name}</ThemedText><ThemedText type="tiny" color={muted}>{plan.category} · {money(plan.amount)} · {plan.status.replaceAll("_", " ")}</ThemedText></View></View>) : <ThemedText type="tiny" color={muted} style={styles.noPlans}>No upcoming plans recorded.</ThemedText>}
      </ScrollView>
    </ScreenWrapper>
  );
}

function MetricCard({ icon, label, value, detail, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; detail: string; onPress: () => void }) {
  const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const accent = useThemeColor("accent"); const muted = useThemeColor("textlight"); const text = useThemeColor("text");
  return <TouchableOpacity onPress={onPress} style={[styles.metricCard, { backgroundColor: surface, borderColor: border }]}><Ionicons name={icon} size={19} color={accent} /><ThemedText type="tiny" color={muted}>{label}</ThemedText><ThemedText type="defaultSemiBold" color={text} style={styles.metricValue}>{value}</ThemedText><ThemedText type="tiny" color={muted}>{detail}</ThemedText></TouchableOpacity>;
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const accent = useThemeColor("accent"); const text = useThemeColor("text");
  return <TouchableOpacity onPress={onPress} style={[styles.quickAction, { backgroundColor: surface, borderColor: border }]}><Ionicons name={icon} size={23} color={accent} /><ThemedText type="tiny" color={text}>{label}</ThemedText></TouchableOpacity>;
}

function Notice({ text }: { text: string }) { const muted = useThemeColor("textlight"); return <ThemedText type="tiny" color={muted} style={styles.noPlans}>{text}</ThemedText>; }

const styles = StyleSheet.create({
  accountStrip: { minHeight: 36, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 7, borderBottomWidth: StyleSheet.hairlineWidth }, accountName: { fontWeight: "700" },
  scroll: { flex: 1 }, content: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 32 }, heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }, headingCopy: { gap: 4 }, count: { minWidth: 58, minHeight: 52, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 26 }, metricCard: { width: "48%", flexGrow: 1, minHeight: 130, borderWidth: 1, borderRadius: 16, padding: 13, gap: 5 }, metricValue: { fontSize: 19 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, marginTop: 3 }, link: { fontWeight: "700", padding: 7 }, loader: { paddingVertical: 20 },
  emptyCard: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 22 }, actionIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, gap: 4 },
  batchCard: { borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 }, batchIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" }, batchEnd: { alignItems: "flex-end", gap: 5 },
  quickActions: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 24 }, quickAction: { flexBasis: "48%", flexGrow: 1, borderWidth: 1, borderRadius: 14, minHeight: 76, alignItems: "center", justifyContent: "center", gap: 7 }, planRow: { borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 8 }, planDate: { minWidth: 48, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }, noPlans: { paddingVertical: 6, marginBottom: 12 },
});
