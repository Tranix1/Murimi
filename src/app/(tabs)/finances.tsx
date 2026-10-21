import CustomHeader from "@/components/CustomHeader";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import type { Batch, Expense, FarmAsset, FinancialTransaction, InventoryItem, Purchase, Sale, StockMovement } from "@/types/farm";
import { calculateFinanceSummary, purchaseBackedAssets } from "@/Utilities/farmCalculations";
import { calculateInventoryBalances } from "@/Utilities/inventoryCalculations";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export default function FinancesScreen() {
  const text = useThemeColor("text"); const muted = useThemeColor("textlight"); const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border");
  const { records: transactions, error } = useFarmRecords<FinancialTransaction>("transactions");
  const { records: sales } = useFarmRecords<Sale>("sales"); const { records: expenses } = useFarmRecords<Expense>("expenses"); const { records: purchases } = useFarmRecords<Purchase>("purchases"); const { records: assets } = useFarmRecords<FarmAsset>("assets"); const { records: batches } = useFarmRecords<Batch>("batches");
  const { records: inventoryItems } = useFarmRecords<InventoryItem>("stock"); const { records: movements } = useFarmRecords<StockMovement>("stockMovements");
  const inventory = calculateInventoryBalances(inventoryItems, purchases, movements);
  const summary = calculateFinanceSummary({ transactions, sales, expenses, purchases, assets: purchaseBackedAssets(purchases, assets), stockMovements: movements, inventoryValue: inventory.totalValue, activeBatchCosts: batches.reduce((sum, batch) => sum + batch.initialQuantity * (batch.costPerUnit ?? 0) + batch.transportCost + batch.setupCost, 0) });
  const cashTrail = [...transactions].sort((a, b) => a.date.localeCompare(b.date)).reduce<number[]>((points, entry) => [...points, (points.at(-1) ?? 0) + (entry.direction === "inflow" ? entry.amount : -entry.amount)], [0]);
  const go = (path: string) => router.push(path as never);
  const rows: [string, number, string][] = [
    ["Available cash", summary.availableCash, "Recorded payments received less recorded payments made"],
    ["Receivables", summary.receivables, "Unpaid sales"], ["Payables", summary.payables, "Unpaid expenses"],
    ["Inventory value", summary.inventoryValue, inventory.valuationReliable ? "Consumable stock at recorded purchase cost" : "Known consumable stock value only; some stock is not valued"], ["Working capital", summary.workingCapital, "Cash + receivables + inventory − payables"],
    ["Active batch costs", summary.activeBatchCosts, "Initial stock, setup and transport costs"], ["Fixed assets", summary.fixedAssets, "Estimated value of recorded assets"],
    ["Total assets", summary.totalAssets, "Cash, receivables, inventory and fixed assets"], ["Total liabilities", summary.totalLiabilities, "Recorded payables"], ["Net worth", summary.netWorth, "Total assets less liabilities"],
  ];
  return <ScreenWrapper fh={false}><CustomHeader pageTitle="Finances" /><ScrollView contentContainerStyle={styles.content}>
    <ThemedText type="title" color={text}>Financial position</ThemedText><ThemedText type="tiny" color={muted} style={styles.intro}>Totals are calculated from saved records in this account.</ThemedText>
    <View accessibilityLabel="Cash movement graph" style={[styles.chart, { backgroundColor: surface, borderColor: border }]}><ThemedText type="tiny" color={muted}>Cash movement · below zero is red, above zero is blue</ThemedText><View style={styles.chartBars}>{cashTrail.slice(-32).map((value, index) => <View key={`${index}-${value}`} style={[styles.chartBar, { height: Math.max(4, Math.min(48, Math.abs(value) / Math.max(1, ...cashTrail.map(Math.abs)) * 48)), backgroundColor: value < 0 ? "#D9534F" : "#3988D7", alignSelf: value < 0 ? "flex-end" : "flex-start" }]} />)}</View></View>
    {error ? <ThemedText type="tiny" color={muted}>{error}</ThemedText> : null}
    <View style={styles.grid}>{rows.map(([label, value, detail]) => {
      const onPress = label === "Inventory value" ? () => go("/Inventory/Index") : label === "Fixed assets" || label === "Total assets" ? () => go("/Assets/Index") : label === "Working capital" ? () => go("/Finances/WorkingCapital") : label === "Payables" ? () => router.push({ pathname: "/Finances/Balances", params: { kind: "payables" } }) : label === "Receivables" ? () => router.push({ pathname: "/Finances/Balances", params: { kind: "receivables" } }) : label === "Total liabilities" ? () => router.push({ pathname: "/Finances/Balances", params: { kind: "payables" } }) : label === "Net worth" ? () => go("/Finances/WorkingCapital") : undefined;
      const card = <><ThemedText type="tiny" color={muted}>{label}</ThemedText><ThemedText type="subtitle" color={text} style={styles.amount}>{money(value)}</ThemedText><ThemedText type="tiny" color={muted}>{detail}</ThemedText>{onPress ? <Ionicons name="chevron-forward" size={17} color={muted} style={styles.cardArrow} /> : null}</>;
      return onPress ? <TouchableOpacity key={label} accessibilityRole="button" onPress={onPress} style={[styles.card, { backgroundColor: surface, borderColor: border }]}>{card}</TouchableOpacity> : <View key={label} style={[styles.card, { backgroundColor: surface, borderColor: border }]}>{card}</View>;
    })}</View>
    <View style={[styles.hero, { backgroundColor: accent }]}><ThemedText type="tiny" style={styles.heroCaption}>Working capital</ThemedText><ThemedText type="title" style={styles.heroValue}>{money(summary.workingCapital)}</ThemedText><ThemedText type="tiny" style={styles.heroCaption}>Cash + receivables + inventory − payables</ThemedText>{!inventory.valuationReliable ? <ThemedText type="tiny" style={styles.heroCaption}>Inventory valuation is incomplete.</ThemedText> : null}</View>
    <View style={[styles.result, { backgroundColor: surface, borderColor: border }]}><ThemedText type="subtitle" color={text}>Recorded revenue and spending</ThemedText><Line label="Sales revenue" value={money(summary.revenue)} /><Line label="Expenses and purchases" value={money(summary.expenses)} /><Line label="Revenue less recorded spending" value={money(summary.realizedProfit)} /><ThemedText type="tiny" color={muted}>This is not net profit: on-hand inventory and consumption cost allocation are not yet valued.</ThemedText></View>
    <ThemedText type="subtitle" color={text} style={styles.sectionTitle}>Finance tools</ThemedText>
    <Action title="Working capital" caption="View cash, receivables and payables" icon="wallet-outline" onPress={() => go("/Finances/WorkingCapital")} />
    <Action title="Record Purchase" caption="Record goods bought for the farm" icon="cart-outline" onPress={() => go("/Farm/RecordPurchase")} />
    <Action title="Record expense" caption="Add a farm expense" icon="receipt-outline" onPress={() => go("/Batches/Expenses")} />
    <Action title="Record cash movement" caption="Opening balance or other receipt/payment" icon="swap-vertical-outline" onPress={() => go("/Finances/Transaction")} />
    <Action title="Fixed assets" caption="View and add farm equipment or property" icon="business-outline" onPress={() => go("/Assets/Index")} />
    <Action title="Reports & Export" caption="Filter financial records and export reports" icon="bar-chart-outline" onPress={() => go("/Reports/Index")} />
  </ScrollView></ScreenWrapper>;
}
function Line({ label, value }: { label: string; value: string }) { const muted = useThemeColor("textlight"); const text = useThemeColor("text"); return <View style={styles.line}><ThemedText type="tiny" color={muted}>{label}</ThemedText><ThemedText type="defaultSemiBold" color={text}>{value}</ThemedText></View>; }
function Action({ title, caption, icon, onPress }: { title: string; caption: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) { const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const accent = useThemeColor("accent"); const text = useThemeColor("text"); const muted = useThemeColor("textlight"); return <TouchableOpacity onPress={onPress} style={[styles.action, { backgroundColor: surface, borderColor: border }]}><Ionicons name={icon} size={23} color={accent} /><View style={styles.actionCopy}><ThemedText type="defaultSemiBold" color={text}>{title}</ThemedText><ThemedText type="tiny" color={muted}>{caption}</ThemedText></View><Ionicons name="chevron-forward" size={18} color={muted} /></TouchableOpacity>; }
const styles = StyleSheet.create({ content: { padding: 18, paddingBottom: 32 }, intro: { marginTop: 5, marginBottom: 17 }, chart: { borderWidth: 1, borderRadius: 13, padding: 11, marginBottom: 14, gap: 8 }, chartBars: { height: 50, flexDirection: "row", alignItems: "center", gap: 3 }, chartBar: { flex: 1, minWidth: 2, borderRadius: 2 }, hero: { borderRadius: 18, padding: 18, marginBottom: 15, gap: 5 }, heroCaption: { color: "#FFFFFFD9" }, heroValue: { color: "#FFFFFF", fontSize: 27 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 9 }, card: { width: "48%", flexGrow: 1, minHeight: 104, borderWidth: 1, borderRadius: 15, padding: 12, gap: 5 }, amount: { fontSize: 18 }, cardArrow: { position: "absolute", right: 10, top: 10 }, result: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 14, gap: 13 }, line: { flexDirection: "row", justifyContent: "space-between", gap: 10 }, sectionTitle: { marginTop: 22, marginBottom: 11 }, action: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 9 }, actionCopy: { flex: 1, gap: 3 } });
