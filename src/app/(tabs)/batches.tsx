import { batchProductionStageForAge, batchProductionStageLabel, calculateBatchAgeDays, calculateBatchSummary } from "@/Utilities/farmCalculations";
import CustomHeader from "@/components/CustomHeader";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { FarmEmpty } from "@/components/farm/FarmComponents";
import { FarmSyncStatus } from "@/components/farm/FarmSyncStatus";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import type { Batch, BatchStatus, DailyRecord, Expense, Purchase, Sale, SlaughterRecord, StockMovement, WeightMeasurement } from "@/types/farm";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { updateFarmRecord } from "@/services/farmRepository";

type Filter = "all" | "active" | BatchStatus;
type Sort = "newest" | "oldest" | "highest_cost" | "age";
const filters: { label: string; value: Filter }[] = [
  { label: "All", value: "all" }, { label: "Active", value: "active" }, { label: "Growing", value: "growing" },
  { label: "Selling", value: "selling" }, { label: "Partially sold", value: "partially_sold" },
  { label: "Completed", value: "completed" }, { label: "Archived", value: "archived" },
];

export default function BatchesTab() {
  const { records: batches, isLoading, error, userId, accountId } = useFarmRecords<Batch>("batches");
  const { records: daily } = useFarmRecords<DailyRecord>("dailyRecords");
  const { records: expenses } = useFarmRecords<Expense>("expenses");
  const { records: purchases } = useFarmRecords<Purchase>("purchases");
  const { records: stockMovements } = useFarmRecords<StockMovement>("stockMovements");
  const { records: sales } = useFarmRecords<Sale>("sales");
  const { records: weights } = useFarmRecords<WeightMeasurement>("weights");
  const { records: slaughter } = useFarmRecords<SlaughterRecord>("slaughter");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [search, setSearch] = useState("");
  const [startingSaleId, setStartingSaleId] = useState<string | null>(null);
  const accent = useThemeColor("accent");
  const surface = useThemeColor("backgroundLight");
  const border = useThemeColor("border");
  const muted = useThemeColor("textlight");
  const text = useThemeColor("text");
  const bad = useThemeColor("bad");

  const startSelling = async (batch: Batch) => {
    if (!userId || !accountId || startingSaleId) return;
    setStartingSaleId(batch.id);
    try {
      await updateFarmRecord(userId, accountId, "batches", batch.id, { status: "selling", productionComplete: true });
    } catch (cause) {
      Alert.alert("Could not start selling", cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setStartingSaleId(null);
    }
  };

  const visibleBatches = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const result = batches.filter((batch) => {
      const matchesSearch = !normalized || batch.name.toLowerCase().includes(normalized) || (batch.batchNumber ?? "").toLowerCase().includes(normalized) || batch.id.toLowerCase().includes(normalized);
      const matchesFilter = filter === "all" || (filter === "active" ? !["completed", "archived"].includes(batch.status) : batch.status === filter);
      return matchesSearch && matchesFilter;
    });
    return result.sort((left, right) => {
      if (sort === "oldest") return left.dateStarted.localeCompare(right.dateStarted);
      if (sort === "highest_cost") return summary(right).costsIncurred - summary(left).costsIncurred;
      if (sort === "age") return ageDays(right.dateStarted) - ageDays(left.dateStarted);
      return right.dateStarted.localeCompare(left.dateStarted);
    });
  }, [batches, filter, search, sort, daily, expenses, sales, weights, slaughter, purchases, stockMovements]);

  function summary(batch: Batch) {
    return calculateBatchSummary(batch, daily.filter((record) => record.batchId === batch.id), expenses.filter((record) => record.batchId === batch.id), sales.filter((record) => record.batchId === batch.id), weights.filter((record) => record.batchId === batch.id), slaughter.filter((record) => record.batchId === batch.id), purchases, stockMovements);
  }

  return (
    <ScreenWrapper fh={false}>
      <CustomHeader pageTitle="Batches" addingNavigate="/Batches/CreateBatch" />
      <FarmSyncStatus />
      <TouchableOpacity onPress={() => router.push("/Batches/HistoricalBatch" as never)} style={[styles.historicalButton, { backgroundColor: surface, borderColor: border }]}><Ionicons name="time-outline" size={18} color={accent} /><ThemedText type="tiny" color={text}>Add past batch</ThemedText></TouchableOpacity>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={muted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search name or batch ID" placeholderTextColor={muted} style={[styles.search, { color: text }]} />
      </View>
      <ScrollView
  horizontal={true}
  showsHorizontalScrollIndicator={false}
  style={{
    flexGrow: 0,
    flexShrink: 1,
    alignSelf: "flex-start",
  }}
  contentContainerStyle={styles.filterRow}
>
  {filters.map((item) => {
    const selected = filter === item.value;

    return (
      <TouchableOpacity
        key={item.value}
        onPress={() => setFilter(item.value)}
        style={[
          styles.chip,
          {
            backgroundColor: selected ? accent : surface,
            borderColor: selected ? accent : border,
          },
        ]}
      >
        <ThemedText
          type="tiny"
          color={selected ? "#FFFFFF" : muted}
          style={styles.chipText}
        >
          {item.label}
        </ThemedText>
      </TouchableOpacity>
    );
  })}
</ScrollView>
      <View style={styles.sortRow}>
        <ThemedText type="tiny" color={muted}>Sort</ThemedText>
        {(["newest", "oldest", "highest_cost", "age"] as const).map((value) => <TouchableOpacity key={value} onPress={() => setSort(value)}><ThemedText type="tiny" color={sort === value ? accent : muted}>{value === "highest_cost" ? "Cost" : value === "age" ? "Age" : value}</ThemedText></TouchableOpacity>)}
      </View>
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={accent} /><ThemedText color={muted}>Loading batches…</ThemedText></View> : error && batches.length === 0 ? <FarmEmpty title="Could not load batches" message={error} icon="cloud-offline-outline" /> : visibleBatches.length === 0 ? <FarmEmpty title="No batches yet" message={error ? `Records remain available offline. ${error}` : "Create a batch to start tracking birds, feed and costs."} /> : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {visibleBatches.map((batch) => {
            const values = summary(batch);
            const age = batch.historical ? historicalAge(batch.dateStarted, batch.historicalData?.actualCompletionDate) : ageDays(batch.dateStarted);
            const closed = batch.status === "completed" || batch.status === "archived";
            const productionStage = batch.historical || closed || age == null ? null : batchProductionStageForAge(age);
            const stageColor = productionStage ? stageColors[productionStage] : accent;
            const mortality = values.mortalityPercent == null ? "—" : `${values.mortalityPercent.toFixed(1)}%`;
            return (
              <View key={batch.id} style={[styles.card, { backgroundColor: productionStage ? `${stageColor}0B` : surface, borderColor: productionStage ? `${stageColor}88` : border }]}>
                <TouchableOpacity activeOpacity={0.8} onPress={() => router.push({ pathname: "/Batches/BatchDetails" as never, params: { batchId: batch.id } })} style={styles.cardMain}>
                  <View style={styles.cardHeading}>
                    <View style={[styles.cardIcon, { backgroundColor: `${accent}18` }]}><Ionicons name="leaf-outline" size={20} color={accent} /></View>
                    <View style={styles.cardTitle}>
                      <ThemedText type="defaultSemiBold" color={text}>{batch.batchNumber ? `Batch ${batch.batchNumber}` : batch.name}</ThemedText>
                      <ThemedText type="tiny" color={muted}>{batch.enterprise} · {batch.stockType} · {batch.historical ? age == null ? "Historical dates unknown" : `Completed in ${age} days` : `Day ${age}${productionStage ? ` · ${batchProductionStageLabel(productionStage)}` : ""}`}</ThemedText>
                    </View>
                    <ThemedText type="tiny" color={batch.status === "completed" ? muted : accent} style={styles.status}>{batch.status.replace("_", " ")}</ThemedText>
                  </View>
                  <View style={styles.statsGrid}>
                    <MiniStat label="Birds alive" value={String(values.birdsAlive)} />
                    <MiniStat label="Mortality" value={mortality} valueColor={values.mortalityPercent != null && values.mortalityPercent >= 5 ? bad : text} />
                    <MiniStat label="Costs" value={money(values.costsIncurred)} />
                    <MiniStat label="Feed" value={`${values.feedKg.toFixed(1)} kg`} />
                    <MiniStat label="Sold" value={String(values.birdsSold)} />
                    <MiniStat label="Cash received" value={money(values.cashCollected)} />
                  </View>
                </TouchableOpacity>
                <View style={[styles.cardFooter, { borderTopColor: border }]}>
                  <ThemedText type="tiny" color={muted}>Started {batch.dateStarted}</ThemedText>
                  <View style={styles.footerActions}>{productionStage === "ready_to_sell" && batch.status === "growing" ? <TouchableOpacity disabled={startingSaleId != null} onPress={() => void startSelling(batch)} style={[styles.saleButton, { backgroundColor: stageColors.ready_to_sell, opacity: startingSaleId === batch.id ? 0.6 : 1 }]}><ThemedText type="tiny" style={styles.saleButtonText}>{startingSaleId === batch.id ? "Saving…" : "Start selling"}</ThemedText></TouchableOpacity> : null}<TouchableOpacity onPress={() => router.push({ pathname: "/Batches/Sales" as never, params: { batchId: batch.id } })} style={[styles.saleButton, { backgroundColor: accent }]}><Ionicons name="add" size={16} color="#FFFFFF" /><ThemedText type="tiny" style={styles.saleButtonText}>Record sale</ThemedText></TouchableOpacity></View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </ScreenWrapper>
  );
}

function MiniStat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const muted = useThemeColor("textlight");
  const text = useThemeColor("text");
  return <View style={styles.miniStat}><ThemedText type="tiny" color={muted}>{label}</ThemedText><ThemedText type="defaultSemiBold" color={valueColor ?? text} style={styles.miniValue}>{value}</ThemedText></View>;
}

function ageDays(date: string) {
  return calculateBatchAgeDays(date) ?? 0;
}

function historicalAge(start: string, end?: string) { if (!start || !end) return null; const from = new Date(`${start}T00:00:00`); const to = new Date(`${end}T00:00:00`); if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) return null; return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1; }

function money(amount: number) {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const styles = StyleSheet.create({
  historicalButton: { alignSelf: "flex-start", marginLeft: 18, marginTop: 10, marginBottom: 2, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 38, flexDirection: "row", gap: 7, alignItems: "center" },
  searchWrap: { marginHorizontal: 18, marginTop: 12, marginBottom: 10, paddingHorizontal: 13, minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderColor: "#8886", borderRadius: 13, alignItems: "center", flexDirection: "row", gap: 8 },
  search: { flex: 1, paddingVertical: 8, fontSize: 14 },
  filterRow: { paddingHorizontal: 18, gap: 8, paddingBottom: 10 , },
  chip: { borderWidth: 1, borderRadius: 18, paddingVertical: 7, paddingHorizontal: 11 },
  chipText: { fontWeight: "700", textTransform: "capitalize" },
  sortRow: { flexDirection: "row", gap: 13, alignItems: "center", paddingHorizontal: 19, paddingBottom: 10 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  list: { paddingHorizontal: 16, paddingBottom: 22, gap: 13 },
  card: { borderWidth: 1, borderRadius: 17, overflow: "hidden" },
  cardMain: { padding: 14 },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  cardTitle: { flex: 1, gap: 3 },
  status: { fontWeight: "700", textTransform: "capitalize" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12, marginTop: 16 },
  miniStat: { width: "33.33%", gap: 3 },
  miniValue: { fontSize: 14 },
  cardFooter: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerActions: { flexDirection: "row", gap: 7, alignItems: "center" },
  saleButton: { minHeight: 34, borderRadius: 10, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 3 },
  saleButtonText: { color: "#FFFFFF", fontWeight: "700" },
});

const stageColors = { starter: "#A16207", growing: "#087E8B", finishing: "#C2410C", ready_to_sell: "#15803D" };
