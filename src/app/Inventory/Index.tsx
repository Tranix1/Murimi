import CustomHeader from "@/components/CustomHeader";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import type { InventoryItem, Purchase, StockMovement } from "@/types/farm";
import { calculateInventoryBalances } from "@/Utilities/inventoryCalculations";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cleanName = (value: string) => value.replace(/^custom\s*[:\-]\s*/i, "");

export default function InventoryScreen() {
    const { records: items, isLoading } = useFarmRecords<InventoryItem>("stock");
    const { records: purchases } = useFarmRecords<Purchase>("purchases");
    const { records: movements } = useFarmRecords<StockMovement>("stockMovements");
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const text = useThemeColor("text"); const muted = useThemeColor("textlight");
    const inventory = useMemo(() => calculateInventoryBalances(items, purchases, movements), [items, purchases, movements]);
    const categoryOptions = [...new Set(inventory.balances.map(({ item }) => item.category))].map((category) => {
        const label = purchases.filter((purchase) => purchase.inventoryItemId && items.find((item) => item.id === purchase.inventoryItemId)?.category === category && purchase.categoryNameSnapshot).sort((a, b) => b.date.localeCompare(a.date))[0]?.categoryNameSnapshot ?? category.replaceAll("_", " ");
        return { value: category, label };
    });
    const visible = selectedCategory === "all" ? inventory.balances : inventory.balances.filter(({ item }) => item.category === selectedCategory);

    return <ScreenWrapper fh={false}><CustomHeader pageTitle="Inventory" addingNavigate="/Farm/RecordPurchase" /><ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.summary, { backgroundColor: accent }]}><ThemedText type="tiny" style={styles.inverse}>Consumable inventory value</ThemedText><ThemedText type="title" style={styles.value}>{inventory.valuationReliable ? money(inventory.totalValue) : `${money(inventory.totalValue)}+`}</ThemedText><ThemedText type="tiny" style={styles.inverse}>{inventory.valuationReliable ? "Recorded purchase cost" : "Known value only; some stock is unvalued"}</ThemedText></View>
        <ThemedText type="subtitle" color={text}>Stock on hand</ThemedText>
        <View style={styles.filters}><Filter label="All" selected={selectedCategory === "all"} onPress={() => setSelectedCategory("all")} accent={accent} surface={surface} border={border} muted={muted} />{categoryOptions.map(({ value, label }) => <Filter key={value} label={label} selected={selectedCategory === value} onPress={() => setSelectedCategory(value)} accent={accent} surface={surface} border={border} muted={muted} />)}</View>
        {isLoading ? <ThemedText type="tiny" color={muted}>Loading inventory…</ThemedText> : visible.length ? visible.map((balance) => {
            const { item, onHand, allocated, available, financialClassification, onHandValue } = balance;
            const itemMovements = movements.filter((movement) => movement.itemId === item.id).sort((a, b) => b.date.localeCompare(a.date));
            const itemPurchases = purchases.filter((purchase) => purchase.inventoryItemId === item.id).sort((a, b) => b.date.localeCompare(a.date));
            const durable = financialClassification === "fixed_asset";
            return <View key={item.id} style={[styles.item, { backgroundColor: surface, borderColor: border }]}>
                <View style={styles.itemHead}><View style={styles.copy}><ThemedText type="defaultSemiBold" color={text}>{cleanName(item.name)}</ThemedText><ThemedText type="tiny" color={muted}>{categoryOptions.find((option) => option.value === item.category)?.label ?? item.category.replaceAll("_", " ")} · {financialClassification === "mixed" ? "Mixed treatment" : durable ? "Durable equipment" : item.itemType?.replaceAll("_", " ") ?? "Consumable"}{item.location ? ` · ${item.location}` : ""}</ThemedText></View>{durable ? <ThemedText type="tiny" color={accent}>Fixed asset</ThemedText> : <View style={styles.stockValue}><ThemedText type="tiny" color={muted}>Stock value</ThemedText><ThemedText type="defaultSemiBold" color={accent}>{onHandValue == null ? "Cost unavailable" : money(onHandValue)}</ThemedText></View>}</View>
                <View style={styles.metrics}><Metric label="On hand" value={`${onHand} ${item.baseUnit}`} muted={muted} text={text} /><Metric label="Allocated" value={`${allocated} ${item.baseUnit}`} muted={muted} text={text} /><Metric label="Available" value={`${available} ${item.baseUnit}`} muted={muted} text={text} /></View>
                {!durable ? <>
                  <ThemedText type="tiny" color={muted}>Average cost: {balance.averageUnitCost == null ? "Cost unavailable" : `${money(balance.averageUnitCost)} / ${item.baseUnit}`} · Remaining inventory value: {balance.value == null ? "Cost unavailable" : money(balance.value)}</ThemedText>
                  <ThemedText type="tiny" color={muted}>Opening: {balance.openingQuantity} {item.baseUnit} · {balance.openingValue == null ? "Cost unavailable" : money(balance.openingValue)} · Purchased: {balance.purchasedQuantity} {item.baseUnit} · {balance.purchasedValue == null ? "Cost unavailable" : money(balance.purchasedValue)}</ThemedText>
                  <ThemedText type="tiny" color={muted}>Issued to batches: {balance.issuedQuantity} {item.baseUnit} · {balance.issuedValue == null ? "Cost unavailable" : money(balance.issuedValue)} · Used: {balance.usedQuantity} {item.baseUnit} · {balance.usedValue == null ? "Cost unavailable" : money(balance.usedValue)}</ThemedText>
                  <ThemedText type="tiny" color={muted}>Wasted: {balance.wastedQuantity} {item.baseUnit} · {balance.wastedValue == null ? "Cost unavailable" : money(balance.wastedValue)} · Returned: {balance.returnedQuantity} {item.baseUnit} · {balance.returnedValue == null ? "Cost unavailable" : money(balance.returnedValue)} · Adjustments: {balance.adjustmentQuantity} {item.baseUnit} · {balance.adjustmentValue == null ? "Cost unavailable" : money(balance.adjustmentValue)}</ThemedText>
                  <ThemedText type="tiny" color={muted}>Value still with batches: {balance.allocatedValue == null ? "Cost unavailable" : money(balance.allocatedValue)} · Total physical stock value: {balance.onHandValue == null ? "Cost unavailable" : money(balance.onHandValue)}</ThemedText>
                </> : null}
                <ThemedText type="tiny" color={muted}>Stock movements · {itemMovements.length}</ThemedText>
                {itemMovements.slice(0, 5).map((movement) => <ThemedText key={movement.id} type="tiny" color={muted}>{movement.date} · {movement.type.replaceAll("_", " ")} · {movement.quantity} {movement.unit} · {movement.totalCost == null ? "Cost unavailable" : money(movement.totalCost)}{movement.batchId ? ` · ${movement.batchNameSnapshot ?? `batch ${movement.batchNumberSnapshot ?? movement.batchId}`}` : ""}</ThemedText>)}
                {!durable ? <View style={styles.actions}><TouchableOpacity onPress={() => router.push({ pathname: "/Inventory/Allocate" as never, params: { itemId: item.id } })} style={[styles.consume, { borderColor: border }]}><Ionicons name="git-branch-outline" size={17} color={accent} /><ThemedText type="tiny" color={text}>Allocate to batch</ThemedText></TouchableOpacity><TouchableOpacity onPress={() => router.push({ pathname: "/Inventory/Consume" as never, params: { itemId: item.id } })} style={[styles.consume, { borderColor: border }]}><Ionicons name="remove-circle-outline" size={17} color={accent} /><ThemedText type="tiny" color={text}>Record batch use</ThemedText></TouchableOpacity></View> : null}
                <ThemedText type="tiny" color={muted}>Purchase history · {itemPurchases.length}</ThemedText>
                {itemPurchases.slice(0, 5).map((purchase) => <TouchableOpacity key={purchase.id} onPress={() => router.push({ pathname: "/Farm/PurchaseDetails" as never, params: { purchaseId: purchase.id } })} style={styles.purchase}><ThemedText type="tiny" color={text}>{purchase.date} · {purchase.quantity ?? "Quantity unavailable"} {purchase.unit ?? item.baseUnit} · {purchase.totalCost == null ? "Cost unavailable" : money(purchase.totalCost)}{purchase.quantity && purchase.totalCost != null ? ` (${money(purchase.totalCost / purchase.quantity)}/${purchase.unit ?? item.baseUnit})` : ""} · {purchase.receiptStatus === "ordered" ? "Not received" : "Received"}</ThemedText><Ionicons name="chevron-forward" size={15} color={muted} /></TouchableOpacity>)}
            </View>;
        }) : <ThemedText type="tiny" color={muted}>No tracked inventory items yet.</ThemedText>}
        <TouchableOpacity onPress={() => router.push("/Assets/Index" as never)} style={[styles.assetsLink, { borderColor: border }]}><Ionicons name="business-outline" size={18} color={accent} /><ThemedText type="defaultSemiBold" color={text}>View Fixed Assets</ThemedText><Ionicons name="chevron-forward" size={17} color={muted} /></TouchableOpacity>
    </ScrollView></ScreenWrapper>;
}

function Metric({ label, value, muted, text }: { label: string; value: string; muted: string; text: string }) { return <View style={styles.metric}><ThemedText type="tiny" color={muted}>{label}</ThemedText><ThemedText type="tiny" color={text}>{value}</ThemedText></View>; }
function Filter({ label, selected, onPress, accent, surface, border, muted }: { label: string; selected: boolean; onPress: () => void; accent: string; surface: string; border: string; muted: string }) { return <TouchableOpacity onPress={onPress} style={[styles.filter, { backgroundColor: selected ? accent : surface, borderColor: selected ? accent : border }]}><ThemedText type="tiny" color={selected ? "#fff" : muted}>{label}</ThemedText></TouchableOpacity>; }

const styles = StyleSheet.create({ content: { padding: 17, paddingBottom: 32, gap: 14 }, summary: { borderRadius: 16, padding: 17, gap: 4 }, inverse: { color: "#FFFFFFD9" }, value: { color: "#FFFFFF", fontSize: 26 }, filters: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, filter: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7 }, item: { borderWidth: 1, borderRadius: 12, padding: 13, gap: 9 }, itemHead: { flexDirection: "row", alignItems: "center", gap: 10 }, copy: { flex: 1, gap: 3 }, stockValue: { alignItems: "flex-end", gap: 2 }, metrics: { flexDirection: "row", gap: 12 }, metric: { flex: 1, gap: 3 }, purchase: { minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, consume: { borderWidth: 1, borderRadius: 8, minHeight: 38, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8 }, assetsLink: { borderWidth: 1, borderRadius: 10, minHeight: 48, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 }, });
