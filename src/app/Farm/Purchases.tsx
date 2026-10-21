import CustomHeader from "@/components/CustomHeader";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { FarmEmpty } from "@/components/farm/FarmComponents";
import { useFarmRecords } from "@/hooks/useFarmRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import type { Purchase } from "@/types/farm";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";

export default function PurchasesScreen() {
  const { records, isLoading, error } = useFarmRecords<Purchase>("purchases");
  const [search, setSearch] = useState("");
  const accent = useThemeColor("accent"); const muted = useThemeColor("textlight"); const text = useThemeColor("text"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border");
  const visible = useMemo(() => records.filter((r) => `${r.itemName} ${r.category} ${r.supplier ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())), [records, search]);
  return <ScreenWrapper fh={false}><CustomHeader pageTitle="Purchases" addingNavigate="/Farm/RecordPurchase" />
    <View style={[styles.search, { borderColor: border }]}><Ionicons name="search-outline" size={18} color={muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search purchases" placeholderTextColor={muted} style={{ flex: 1, color: text }} /></View><ScrollView contentContainerStyle={styles.list}>{error ? <ThemedText type="tiny" color={muted}>{error}</ThemedText> : null}{isLoading ? <ThemedText type="tiny" color={muted}>Loading purchases…</ThemedText> : null}
      {!isLoading && !visible.length ? <FarmEmpty title="No purchases recorded" message="Purchases you record offline will appear here and sync when connected." icon="cart-outline" /> : visible.map((purchase) => <TouchableOpacity key={purchase.id} onPress={() => router.push({ pathname: "/Farm/PurchaseDetails" as never, params: { purchaseId: purchase.id } })} style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
        <View style={styles.row}><View style={{ flex: 1 }}><ThemedText type="defaultSemiBold" color={text}>{purchase.categoryNameSnapshot ?? purchase.category.replaceAll("_", " ")} {" · "} {purchase.itemName}</ThemedText><ThemedText type="tiny" color={muted}>{purchase.date}{purchase.quantity != null ? ` · ${purchase.quantity} ${purchase.unit ?? "units"}` : ""}</ThemedText></View><ThemedText type="defaultSemiBold" color={accent}>{money(purchase.totalCost)}</ThemedText></View>
        <ThemedText type="tiny" color={muted}>{purchase.receiptStatus === "ordered" ? "Ordered / not received" : "Received"} · Paid {money(purchase.amountPaid ?? 0)} · Outstanding {money(purchase.outstanding ?? 0)}</ThemedText>
        <ThemedText type="tiny" color={muted}>{purchase.allocations.length ? `${purchase.allocations.length} batch allocation${purchase.allocations.length === 1 ? "" : "s"}` : "General farm stock"} · {purchase.unallocatedQuantity ?? 0} {purchase.unit ?? "units"} unallocated</ThemedText>
      </TouchableOpacity>)}
    </ScrollView>
  </ScreenWrapper>;
}
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const styles = StyleSheet.create({ search: { margin: 16, paddingHorizontal: 12, height: 44, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8 }, list: { paddingHorizontal: 16, paddingBottom: 25, gap: 10 }, card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 }, row: { flexDirection: "row", alignItems: "center", gap: 8 } });
