import CustomHeader from "@/components/CustomHeader";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import type { FarmAsset, Purchase } from "@/types/farm";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cleanName = (value: string) => value.replace(/^custom\s*[:\-–]\s*/i, "");

export default function AssetsScreen() {
  const { records: assets } = useFarmRecords<FarmAsset>("assets");
  const { records: purchases, isLoading } = useFarmRecords<Purchase>("purchases");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const accent = useThemeColor("accent"); const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const text = useThemeColor("text"); const muted = useThemeColor("textlight");
  const linked = new Map(assets.filter((asset) => asset.purchaseId).map((asset) => [asset.purchaseId!, asset]));
  const records = useMemo(() => purchases
    .filter((purchase) => purchase.financialClassification === "fixed_asset" || linked.has(purchase.id))
    .map((purchase) => { const asset = linked.get(purchase.id); const status = asset?.status ?? "not_in_use"; return { purchase, asset, status, value: ["sold", "removed", "disposed"].includes(status) ? 0 : asset?.estimatedValue ?? purchase.totalCost, category: purchase.categoryNameSnapshot || asset?.category || purchase.category.replaceAll("_", " ") }; })
    .sort((a, b) => b.value - a.value), [purchases, assets]);
  const categories = [...new Set(records.map((record) => record.category))].sort((a, b) => a.localeCompare(b));
  const visible = selectedCategory === "all" ? records : records.filter((record) => record.category === selectedCategory);
  const groups = categories.filter((category) => selectedCategory === "all" || selectedCategory === category).map((category) => ({ category, records: visible.filter((record) => record.category === category) })).filter((group) => group.records.length);
  const totalValue = records.reduce((sum, record) => sum + record.value, 0);

  return <ScreenWrapper fh={false}>
    <CustomHeader pageTitle="Farm assets" />
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText type="title" color={text}>Fixed assets</ThemedText>
      <ThemedText type="tiny" color={muted} style={styles.subtitle}>Purchase value and category for assets recorded through Record Purchase.</ThemedText>
      <View style={[styles.summary, { backgroundColor: accent }]}><ThemedText type="tiny" style={styles.inverse}>Total recorded asset value</ThemedText><ThemedText type="title" style={styles.summaryValue}>{money(totalValue)}</ThemedText><ThemedText type="tiny" style={styles.inverse}>{records.length} assets · highest value first</ThemedText></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        <CategoryFilter label="All" selected={selectedCategory === "all"} onPress={() => setSelectedCategory("all")} accent={accent} surface={surface} border={border} muted={muted} />
        {categories.map((category) => <CategoryFilter key={category} label={category} selected={selectedCategory === category} onPress={() => setSelectedCategory(category)} accent={accent} surface={surface} border={border} muted={muted} />)}
      </ScrollView>
      {isLoading ? <ThemedText type="tiny" color={muted}>Loading assets…</ThemedText> : visible.length ? groups.map(({ category, records: categoryRecords }) => <View key={category} style={[styles.categoryCard, { borderColor: border, backgroundColor: surface }]}>
        <View style={[styles.categoryHeading, { borderBottomColor: border }]}><ThemedText type="subtitle" color={text}>{category}</ThemedText><ThemedText type="defaultSemiBold" color={accent}>{money(categoryRecords.reduce((sum, record) => sum + record.value, 0))}</ThemedText></View>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={[styles.tableRow, styles.tableHead, { borderBottomColor: border }]}>
              <Cell label="Asset" width={205} muted={muted} strong /><Cell label="Quantity" width={85} muted={muted} strong /><Cell label="Value" width={125} muted={muted} strong />
            </View>
            {categoryRecords.map(({ purchase, value }) => <TouchableOpacity key={purchase.id} onPress={() => router.push({ pathname: "/Farm/PurchaseDetails" as never, params: { purchaseId: purchase.id } })} style={[styles.tableRow, { borderBottomColor: border }]}>
              <View style={styles.assetCell}><ThemedText type="tiny" color={text} numberOfLines={1}>{cleanName(purchase.itemName)}</ThemedText><ThemedText type="tiny" color={muted} numberOfLines={1}>{purchase.date} · {purchase.assetCondition ?? "Condition not set"}</ThemedText></View><Cell label={String(purchase.itemCount ?? purchase.quantity ?? 1)} width={85} muted={text} /><Cell label={money(value)} width={125} muted={accent} strong />
            </TouchableOpacity>)}
          </View>
        </ScrollView>
        {categoryRecords.map(({ purchase, asset, status }) => <View key={`${purchase.id}-details`} style={[styles.details, { borderTopColor: border }]}><ThemedText type="tiny" color={muted}>{cleanName(purchase.itemName)} · Original cost {money(purchase.totalCost)} · Status: {assetStatusLabel(status)}{asset?.disposalDate ? ` · Disposed ${asset.disposalDate}` : ""}{asset?.disposalProceeds != null ? ` · Sale proceeds ${money(asset.disposalProceeds)}` : ""}{purchase.residualValue == null ? "" : ` · Residual ${money(purchase.residualValue)}`}{purchase.usefulLifeYears == null ? "" : ` · Useful life ${purchase.usefulLifeYears} years`}{purchase.location ? ` · ${purchase.location}` : ""}{purchase.supplier ? ` · ${purchase.supplier}` : ""}</ThemedText>{asset?.id ? <TouchableOpacity onPress={() => router.push({ pathname: "/Assets/Create" as never, params: { assetId: asset.id } })}><ThemedText type="tiny" color={accent}>Update asset status</ThemedText></TouchableOpacity> : <ThemedText type="tiny" color={muted}>Asset status unavailable for this older purchase.</ThemedText>}</View>)}
      </View>) : <View style={[styles.empty, { backgroundColor: surface }]}><ThemedText type="defaultSemiBold" color={text}>No fixed asset purchases recorded</ThemedText><ThemedText type="tiny" color={muted}>Record equipment or property from Finance → Record Purchase and set its financial treatment to Fixed asset.</ThemedText></View>}
    </ScrollView>
  </ScreenWrapper>;
}

function CategoryFilter({ label, selected, onPress, accent, surface, border, muted }: { label: string; selected: boolean; onPress: () => void; accent: string; surface: string; border: string; muted: string }) {
  return <TouchableOpacity onPress={onPress} style={[styles.filter, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? "#fff" : muted}>{label}</ThemedText></TouchableOpacity>;
}
function Cell({ label, width, muted, strong }: { label: string; width: number; muted: string; strong?: boolean }) {
  return <View style={[styles.cell, { width }]}><ThemedText type={strong ? "defaultSemiBold" : "tiny"} color={muted} numberOfLines={2}>{label}</ThemedText></View>;
}
function assetStatusLabel(status?: string) { return ({ active: "In use", in_use: "In use", not_in_use: "Bought, not in use", sold: "Sold", removed: "Removed", disposed: "Disposed", retired: "Retired" } as Record<string, string>)[status ?? ""] ?? "Bought, not in use"; }

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 30, gap: 13 }, subtitle: { marginTop: -8 }, summary: { borderRadius: 16, padding: 16, gap: 4 }, inverse: { color: "#FFFFFFD9" }, summaryValue: { color: "#fff", fontSize: 25 }, filters: { flexDirection: "row", gap: 7 }, filter: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7 }, categoryCard: { borderWidth: 1, borderRadius: 12, overflow: "hidden" }, categoryHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth }, tableRow: { flexDirection: "row", minHeight: 41, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "center" }, tableHead: { minHeight: 34 }, cell: { paddingHorizontal: 10, paddingVertical: 5 }, assetCell: { width: 205, paddingHorizontal: 10, paddingVertical: 4, gap: 1 }, details: { paddingHorizontal: 11, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth }, empty: { alignItems: "center", gap: 9, padding: 24, borderRadius: 16 },
});
