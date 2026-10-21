import CustomHeader from "@/components/CustomHeader";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import type { Expense, Purchase, Sale } from "@/types/farm";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type BalanceRow = { id: string; party: string; description: string; date: string; value: number };

export default function BalancesScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const receivables = kind !== "payables";
  const { records: sales } = useFarmRecords<Sale>("sales");
  const { records: purchases } = useFarmRecords<Purchase>("purchases");
  const { records: expenses } = useFarmRecords<Expense>("expenses");
  const accent = useThemeColor("accent"); const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const text = useThemeColor("text"); const muted = useThemeColor("textlight");
  const rows: BalanceRow[] = receivables
    ? sales.filter((sale) => sale.outstanding > 0).map((sale) => ({ id: sale.id, party: sale.customerNameSnapshot || sale.customer || "Customer not recorded", description: sale.productDescription || sale.productType.replaceAll("_", " "), date: sale.date, value: sale.outstanding })).sort((a, b) => b.value - a.value)
    : [
      ...purchases.filter((purchase) => (purchase.outstanding ?? 0) > 0).map((purchase) => ({ id: `purchase_${purchase.id}`, party: purchase.supplier || "Supplier not recorded", description: `${purchase.categoryNameSnapshot || purchase.category.replaceAll("_", " ")} · ${purchase.itemName}`, date: purchase.date, value: purchase.outstanding ?? 0 })),
      ...expenses.filter((expense) => expense.amount > expense.amountPaid).map((expense) => ({ id: `expense_${expense.id}`, party: expense.supplier || "Supplier not recorded", description: `${expense.category.replaceAll("_", " ")} · ${expense.description}`, date: expense.date, value: expense.amount - expense.amountPaid })),
    ].sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return <ScreenWrapper fh={false}>
    <CustomHeader pageTitle={receivables ? "Receivables" : "Payables"} />
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText type="title" color={text}>{receivables ? "Money owed by customers" : "Money owed to suppliers"}</ThemedText>
      <View style={[styles.total, { backgroundColor: accent }]}><ThemedText type="tiny" style={styles.inverse}>{receivables ? "Total outstanding" : "Total unpaid"}</ThemedText><ThemedText type="title" style={styles.totalValue}>{money(total)}</ThemedText><ThemedText type="tiny" style={styles.inverse}>{rows.length} outstanding balance{rows.length === 1 ? "" : "s"}</ThemedText></View>
      {rows.length ? <View style={[styles.table, { borderColor: border, backgroundColor: surface }]}>
        <View style={[styles.row, styles.head, { borderBottomColor: border }]}><ThemedText type="tiny" color={muted} style={styles.party}>{receivables ? "Customer" : "Supplier"}</ThemedText><ThemedText type="tiny" color={muted} style={styles.amount}>Balance</ThemedText></View>
        {rows.map((row) => <View key={row.id} style={[styles.row, { borderBottomColor: border }]}><View style={styles.partyCopy}><ThemedText type="defaultSemiBold" color={text}>{row.party}</ThemedText><ThemedText type="tiny" color={muted}>{row.description} · {row.date}</ThemedText></View><ThemedText type="defaultSemiBold" color={text} style={styles.amount}>{money(row.value)}</ThemedText></View>)}
        <View style={[styles.row, styles.totalRow, { borderTopColor: border }]}><ThemedText type="defaultSemiBold" color={text}>Total</ThemedText><ThemedText type="defaultSemiBold" color={accent}>{money(total)}</ThemedText></View>
      </View> : <View style={[styles.empty, { backgroundColor: surface }]}><ThemedText type="defaultSemiBold" color={text}>No outstanding balances</ThemedText><ThemedText type="tiny" color={muted}>{receivables ? "Unpaid customer sales will appear here." : "Unpaid purchases and expenses will appear here."}</ThemedText></View>}
    </ScrollView>
  </ScreenWrapper>;
}

const styles = StyleSheet.create({ content: { padding: 18, paddingBottom: 30, gap: 14 }, total: { borderRadius: 16, padding: 17, gap: 4 }, inverse: { color: "#FFFFFFD9" }, totalValue: { color: "#fff", fontSize: 26 }, table: { borderWidth: 1, borderRadius: 12, overflow: "hidden" }, row: { minHeight: 52, paddingHorizontal: 12, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth }, head: { minHeight: 36 }, party: { flex: 1 }, partyCopy: { flex: 1, gap: 3 }, amount: { minWidth: 100, textAlign: "right" }, totalRow: { borderBottomWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, justifyContent: "space-between" }, empty: { padding: 18, gap: 7, borderRadius: 12 }, });
