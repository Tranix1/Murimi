import CustomHeader from "@/components/CustomHeader";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

export default function MoreScreen() {
  const { activeAccountName } = useAuth(); const text = useThemeColor("text"); const muted = useThemeColor("textlight"); const accent = useThemeColor("accent");
  const items: { title: string; caption: string; icon: keyof typeof Ionicons.glyphMap; path: string }[] = [
    { title: "Account", caption: "View account details, log out or clear farm data", icon: "person-circle-outline", path: "/Account/Settings" },
    { title: "Purchases", caption: "Record purchases and view purchase history", icon: "cart-outline", path: "/Farm/Purchases" },
    { title: "Expenses", caption: "Record and review farm expenses", icon: "receipt-outline", path: "/Farm/Expenses" },
    { title: "Sales settings", caption: "Manage customer categories, customers and payment methods", icon: "people-outline", path: "/Farm/SalesSettings" },
    { title: "Switch account", caption: `Current: ${activeAccountName ?? "acc 1"}`, icon: "swap-horizontal-outline", path: "/Account/Accounts" },
    { title: "Farm plans", caption: "Plan and track upcoming work", icon: "calendar-outline", path: "/Plans/Index" },
    { title: "Assets", caption: "Equipment, buildings and property", icon: "business-outline", path: "/Assets/Index" },
    { title: "Reports & Export", caption: "Farm analytics and offline data exports", icon: "bar-chart-outline", path: "/Reports/Index" },
    { title: "Finance app connections", caption: "Share read-only financial data securely", icon: "share-social-outline", path: "/Integrations/Index" },
    { title: "About Murimi", caption: "About this farm management app", icon: "information-circle-outline", path: "/About" },
  ];
  return <ScreenWrapper fh={false}><CustomHeader pageTitle="More" /><ScrollView contentContainerStyle={styles.content}><ThemedText type="title" color={text}>More tools</ThemedText><ThemedText type="tiny" color={muted} style={styles.subtitle}>Manage your farm account and records.</ThemedText>{items.map((item) => <MenuItem key={item.title} {...item} onPress={() => router.push(item.path as never)} />)}<View style={styles.footer}><Ionicons name="leaf-outline" size={20} color={accent} /><ThemedText type="tiny" color={muted}>Murimi · Farm records for your selected account</ThemedText></View></ScrollView></ScreenWrapper>;
}
function MenuItem({ title, caption, icon, onPress }: { title: string; caption: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) { const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const accent = useThemeColor("accent"); const text = useThemeColor("text"); const muted = useThemeColor("textlight"); return <TouchableOpacity onPress={onPress} style={[styles.item, { backgroundColor: surface, borderColor: border }]}><View style={[styles.icon, { backgroundColor: `${accent}18` }]}><Ionicons name={icon} size={21} color={accent} /></View><View style={styles.copy}><ThemedText type="defaultSemiBold" color={text}>{title}</ThemedText><ThemedText type="tiny" color={muted}>{caption}</ThemedText></View><Ionicons name="chevron-forward" size={18} color={muted} /></TouchableOpacity>; }
const styles = StyleSheet.create({ content: { padding: 18, paddingBottom: 30 }, subtitle: { marginTop: 5, marginBottom: 19 }, item: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }, icon: { width: 43, height: 43, borderRadius: 13, alignItems: "center", justifyContent: "center" }, copy: { flex: 1, gap: 3 }, footer: { marginTop: 20, alignItems: "center", gap: 8 } });
