import React from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import CustomHeader from "@/components/CustomHeader";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useThemeColor } from "@/hooks/useThemeColor";

type Batch = {
  id: string;
  name: string;
  age: number;
  alive: number;
  deaths: number;
  sold: number;
  invested: number;
  feedKg: number;
  liveWeight: number | null;
  dressedWeight: number | null;
  sales: number;
};

const batches: Batch[] = [
  { id: "batch-001", name: "Batch 001", age: 26, alive: 96, deaths: 4, sold: 0, invested: 307.2, feedKg: 250, liveWeight: 1.1, dressedWeight: null, sales: 0 },
  { id: "batch-002", name: "Batch 002", age: 7, alive: 150, deaths: 0, sold: 0, invested: 180, feedKg: 65, liveWeight: null, dressedWeight: null, sales: 0 },
];

const money = (value: number | null) => value == null ? "—" : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const weight = (value: number | null) => value == null ? "—" : `${value.toFixed(2)} kg`;

function comingSoon(title: string) {
  Alert.alert(title, `${title} will be connected here soon.`);
}

function openBatch(batch: Batch) {
  router.push({ pathname: "/Batches/BatchDetails" as never, params: { batchId: batch.id } });
}

function openSales(batch: Batch) {
  router.push({ pathname: "/Batches/Sales" as never, params: { batchId: batch.id } });
}

function SummaryCard({ title, value, caption, icon, onPress }: { title: string; value: string; caption: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const colors = {
    surface: useThemeColor("backgroundLight"),
    border: useThemeColor("border"),
    accent: useThemeColor("accent"),
    muted: useThemeColor("textlight"),
    text: useThemeColor("text"),
  };
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.summaryIconRow}>
        <Ionicons name={icon} size={19} color={colors.accent} />
        <Ionicons name="open-outline" size={16} color={colors.muted} />
      </View>
      <ThemedText type="tiny" color={colors.muted}>{title}</ThemedText>
      <ThemedText type="subtitle" color={colors.text} style={styles.summaryValue}>{value}</ThemedText>
      <ThemedText type="tiny" color={colors.muted}>{caption}</ThemedText>
    </TouchableOpacity>
  );
}

function BatchCard({ batch }: { batch: Batch }) {
  const surface = useThemeColor("backgroundLight");
  const border = useThemeColor("border");
  const accent = useThemeColor("accent");
  const muted = useThemeColor("textlight");
  const text = useThemeColor("text");
  const aliveCost = batch.alive > 0 ? batch.invested / batch.alive : null;

  return (
    <View style={[styles.batchCard, { backgroundColor: surface, borderColor: border }]}>
      <TouchableOpacity activeOpacity={0.8} onPress={() => openBatch(batch)} style={styles.batchMain}>
        <View style={styles.batchTop}>
          <View style={[styles.batchIcon, { backgroundColor: `${accent}16` }]}>
            <Ionicons name="leaf-outline" size={22} color={accent} />
          </View>
          <View style={styles.batchNameGroup}>
            <ThemedText type="defaultSemiBold" color={text}>{batch.name}</ThemedText>
            <ThemedText type="tiny" color={muted}>Day {batch.age} · {batch.alive} alive</ThemedText>
          </View>
          <View style={[styles.statusPill, { backgroundColor: `${accent}16` }]}>
            <ThemedText type="tiny" color={accent} style={styles.statusText}>Active</ThemedText>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: border }]} />
        <View style={styles.batchFacts}>
          <Fact label="Invested" value={money(batch.invested)} />
          <Fact label="Feed used" value={`${batch.feedKg.toLocaleString()} kg`} />
        </View>
        <View style={[styles.divider, { backgroundColor: border }]} />
        <ThemedText type="defaultSemiBold" color={text} style={styles.performanceTitle}>Bird performance</ThemedText>
        <View style={styles.performanceGrid}>
          <Fact label="Cost per live bird" value={money(aliveCost)} />
          <Fact label="Average live weight" value={weight(batch.liveWeight)} />
          <Fact label="Birds sold" value={String(batch.sold)} />
          <Fact label="Deaths" value={String(batch.deaths)} />
          <Fact label="Dressed weight" value={weight(batch.dressedWeight)} />
          <Fact label="Birds alive" value={String(batch.alive)} />
        </View>
      </TouchableOpacity>

      <View style={[styles.salesRow, { borderTopColor: border }]}>
        <View style={styles.salesSummary}>
          <ThemedText type="tiny" color={muted}>Cash collected</ThemedText>
          <ThemedText type="defaultSemiBold" color={accent}>{money(batch.sales)}</ThemedText>
        </View>
        <TouchableOpacity onPress={() => openSales(batch)} activeOpacity={0.8} style={[styles.salesButton, { backgroundColor: accent }]}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <ThemedText type="tiny" style={styles.salesButtonText}>Record sale</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const muted = useThemeColor("textlight");
  const text = useThemeColor("text");
  return (
    <View style={styles.fact}>
      <ThemedText type="tiny" color={muted}>{label}</ThemedText>
      <ThemedText type="defaultSemiBold" color={text} style={styles.factValue}>{value}</ThemedText>
    </View>
  );
}

export default function Home() {
  const { activeAccountName, currentRole } = useAuth();
  const accent = useThemeColor("accent");
  const surface = useThemeColor("backgroundLight");
  const border = useThemeColor("border");
  const muted = useThemeColor("textlight");
  const text = useThemeColor("text");
  const totalBirds = batches.reduce((sum, batch) => sum + batch.alive, 0);
  const totalSales = batches.reduce((sum, batch) => sum + batch.sales, 0);

  return (
    <ScreenWrapper fh={false}>
      <CustomHeader pageTitle="Murimi" />
      <View style={[styles.accountStrip, { borderBottomColor: border }]}>
        <View style={[styles.accountDot, { backgroundColor: accent }]} />
        <ThemedText type="tiny" color={muted}>Selected account</ThemedText>
        <ThemedText type="tiny" color={text} style={styles.accountName}>{activeAccountName ?? "acc 1"}</ThemedText>
        <ThemedText type="tiny" color={muted}>· {currentRole.accType}</ThemedText>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.welcome}>
          <View style={styles.welcomeText}>
            <ThemedText type="title" color={text} style={styles.pageTitle}>Farm overview</ThemedText>
            <ThemedText type="default" color={muted} style={styles.pageSubtitle}>A quick look at your farm activity.</ThemedText>
          </View>
          <View style={[styles.batchCount, { backgroundColor: `${accent}16` }]}>
            <ThemedText type="defaultSemiBold" color={accent}>{batches.length}</ThemedText>
            <ThemedText type="tiny" color={accent}>batches</ThemedText>
          </View>
        </View>

        <ThemedText type="subtitle" color={text} style={styles.sectionTitle}>Farm summary</ThemedText>
        <View style={styles.summaryGrid}>
          <SummaryCard title="Working capital" value="—" caption="Available funds" icon="wallet-outline" onPress={() => comingSoon("Working capital")} />
          <SummaryCard title="Farm assets" value="—" caption="Equipment and housing" icon="business-outline" onPress={() => comingSoon("Farm assets")} />
        </View>

        <TouchableOpacity activeOpacity={0.8} onPress={() => comingSoon("Sales summary")} style={[styles.salesCard, { backgroundColor: accent }]}>
          <View style={[styles.salesCardIcon, { backgroundColor: "#FFFFFF24" }]}>
            <Ionicons name="trending-up-outline" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.salesCardText}>
            <ThemedText type="tiny" style={styles.salesCardLabel}>Cash collected from sales</ThemedText>
            <ThemedText type="subtitle" style={styles.salesCardAmount}>{money(totalSales)}</ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionCopy}>
            <ThemedText type="subtitle" color={text} style={styles.sectionTitle}>Production batches</ThemedText>
            <ThemedText type="tiny" color={muted}>{batches.length} batches · {totalBirds} birds alive</ThemedText>
          </View>
          <TouchableOpacity activeOpacity={0.75} onPress={() => comingSoon("All batches")}>
            <ThemedText type="tiny" color={accent} style={styles.viewAll}>View all</ThemedText>
          </TouchableOpacity>
        </View>

        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push("/Batches/CreateBatch" as never)} style={[styles.createBatch, { backgroundColor: surface, borderColor: border }]}>
          <View style={[styles.createIcon, { backgroundColor: `${accent}16` }]}>
            <Ionicons name="add" size={22} color={accent} />
          </View>
          <View style={styles.createCopy}>
            <ThemedText type="defaultSemiBold" color={text}>Create a batch</ThemedText>
            <ThemedText type="tiny" color={muted}>Add a new group of birds</ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={19} color={muted} />
        </TouchableOpacity>

        <View style={styles.batchList}>{batches.map((batch) => <BatchCard key={batch.id} batch={batch} />)}</View>

        <View style={styles.sectionHeader}>
          <ThemedText type="subtitle" color={text} style={styles.sectionTitle}>Farm reminder</ThemedText>
        </View>
        <View style={[styles.reminder, { backgroundColor: surface, borderColor: border }]}>
          <View style={[styles.reminderIcon, { backgroundColor: `${accent}16` }]}>
            <Ionicons name="clipboard-outline" size={19} color={accent} />
          </View>
          <View style={styles.reminderCopy}>
            <ThemedText type="defaultSemiBold" color={text}>Keep batch records up to date</ThemedText>
            <ThemedText type="tiny" color={muted} style={styles.reminderText}>Record feed, water, deaths and weights to follow progress.</ThemedText>
          </View>
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  accountStrip: { minHeight: 38, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  accountDot: { width: 7, height: 7, borderRadius: 4 },
  accountName: { fontWeight: "700" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 30 },
  welcome: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  welcomeText: { flex: 1, paddingRight: 12 },
  pageTitle: { fontSize: 24, lineHeight: 30 },
  pageSubtitle: { fontSize: 14, marginTop: 4 },
  batchCount: { minWidth: 58, minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 18, lineHeight: 24 },
  summaryGrid: { flexDirection: "row", gap: 12, marginTop: 12, marginBottom: 16 },
  summaryCard: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 17, padding: 14, gap: 6 },
  summaryIconRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 },
  summaryValue: { fontSize: 21, lineHeight: 26 },
  salesCard: { borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", marginBottom: 28 },
  salesCardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 12 },
  salesCardText: { flex: 1, gap: 3 },
  salesCardLabel: { color: "#FFFFFFD9" },
  salesCardAmount: { color: "#FFFFFF", fontSize: 22, lineHeight: 27 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  sectionCopy: { flex: 1, gap: 4 },
  viewAll: { fontWeight: "700", paddingVertical: 8, paddingLeft: 10 },
  createBatch: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", marginBottom: 15 },
  createIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", marginRight: 12 },
  createCopy: { flex: 1, gap: 3 },
  batchList: { gap: 14, marginBottom: 28 },
  batchCard: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  batchMain: { padding: 15 },
  batchTop: { flexDirection: "row", alignItems: "center" },
  batchIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 11 },
  batchNameGroup: { flex: 1, gap: 3 },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontWeight: "700" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  batchFacts: { flexDirection: "row", gap: 10 },
  fact: { flex: 1, minWidth: 0, gap: 3 },
  factValue: { fontSize: 14 },
  performanceTitle: { fontSize: 14, marginBottom: 12 },
  performanceGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 14 },
  salesRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 15, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  salesSummary: { gap: 2 },
  salesButton: { borderRadius: 11, minHeight: 38, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 4 },
  salesButtonText: { color: "#FFFFFF", fontWeight: "700" },
  reminder: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 11 },
  reminderIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  reminderCopy: { flex: 1, gap: 4, paddingTop: 1 },
  reminderText: { lineHeight: 18 },
});
