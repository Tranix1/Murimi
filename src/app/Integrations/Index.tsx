import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getAuth } from "@react-native-firebase/auth";
import { router } from "expo-router";
import CustomHeader from "@/components/CustomHeader";
import { FarmButton, FarmField } from "@/components/farm/FarmComponents";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { FARM_FIREBASE_PROJECT_ID } from "@/services/farmRepository";

type Connection = { id: string; clientName: string; createdAt: string; lastUsedAt?: string | null; expiresAt: string; revoked: boolean; active: boolean };
const endpoint = `https://us-central1-${FARM_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

async function callOwnerFunction<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again to manage app connections.");
  const response = await fetch(`${endpoint}/${name}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
  const payload = await response.json().catch(() => null) as { result?: T; error?: { message?: string } } | null;
  if (!response.ok || !payload?.result) throw new Error(payload?.error?.message ?? `Could not complete request (${response.status}).`);
  return payload.result;
}

export default function FinanceConnectionsScreen() {
  const { activeAccountId, activeAccountName } = useAuth();
  const [clientName, setClientName] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const accent = useThemeColor("accent"); const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const muted = useThemeColor("textlight"); const text = useThemeColor("text");

  const refresh = useCallback(async () => {
    if (!activeAccountId) return;
    try { const result = await callOwnerFunction<{ connections: Connection[] }>("listMurimiFinanceConnections", { accountId: activeAccountId }); setConnections(result.connections); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load app connections."); }
  }, [activeAccountId]);
  /* eslint react-hooks/set-state-in-effect: "off" -- load the current account's server-managed integrations. */
  useEffect(() => { void refresh(); }, [refresh]);

  const createCode = async () => {
    if (!activeAccountId) { setError("Select a farm account first."); return; }
    const name = clientName.trim();
    if (!name) { setError("Enter the name of the app you want to connect."); return; }
    setBusy(true); setError(""); setPairingCode("");
    try {
      const result = await callOwnerFunction<{ pairingCode: string; expiresAt: string }>("createMurimiFinancePairingCode", { accountId: activeAccountId, clientName: name });
      setPairingCode(result.pairingCode); setExpiresAt(result.expiresAt); setClientName(""); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create a pairing code."); }
    finally { setBusy(false); }
  };
  const revoke = (connection: Connection) => Alert.alert("Disconnect app?", `${connection.clientName} will immediately lose access to this farm’s financial data.`, [
    { text: "Keep connected", style: "cancel" },
    { text: "Disconnect", style: "destructive", onPress: async () => { setBusy(true); try { await callOwnerFunction("revokeMurimiFinanceConnection", { accountId: activeAccountId, connectionId: connection.id }); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not disconnect app."); } finally { setBusy(false); } } },
  ]);

  return <ScreenWrapper fh={false}><CustomHeader pageTitle="Finance app connections" /><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={[styles.info, { backgroundColor: surface, borderColor: border }]}><Ionicons name="shield-checkmark-outline" size={22} color={accent} /><View style={styles.flex}><ThemedText type="defaultSemiBold" color={text}>Share financial data securely</ThemedText><ThemedText type="tiny" color={muted}>Pair an app by name. Its one-time code expires in 10 minutes; its read-only access token expires in 90 days. Disconnect it here at any time. The app may keep downloaded data offline; disconnecting stops future downloads but cannot erase its saved copy.</ThemedText></View></View>
    <ThemedText type="tiny" color={muted}>Farm account: {activeAccountName ?? activeAccountId ?? "None selected"}</ThemedText>
    <FarmField label="App name" value={clientName} onChangeText={setClientName} placeholder="For example, Fynage" />
    <FarmButton label={busy ? "Please wait…" : "Create one-time pairing code"} onPress={() => void createCode()} disabled={busy} />
    {pairingCode ? <View style={[styles.codeCard, { backgroundColor: surface, borderColor: border }]}><ThemedText type="defaultSemiBold" color={text}>Give this code to the app you are connecting</ThemedText><ThemedText selectable style={styles.code} color={accent}>{pairingCode}</ThemedText><ThemedText type="tiny" color={muted}>Expires {new Date(expiresAt).toLocaleTimeString()} · single use</ThemedText><FarmButton label="Share pairing code" secondary onPress={() => void Share.share({ message: `Murimi finance pairing code: ${pairingCode}\nUse it within 10 minutes to connect ${clientName || "your app"}.` })} /></View> : null}
    <ThemedText type="defaultSemiBold" color={text}>Connected apps</ThemedText>
    {connections.filter((item) => item.active).length ? connections.filter((item) => item.active).map((connection) => <View key={connection.id} style={[styles.connection, { backgroundColor: surface, borderColor: border }]}><View style={styles.flex}><ThemedText type="defaultSemiBold" color={text}>{connection.clientName}</ThemedText><ThemedText type="tiny" color={muted}>Connected {new Date(connection.createdAt).toLocaleDateString()} · expires {new Date(connection.expiresAt).toLocaleDateString()}</ThemedText><ThemedText type="tiny" color={muted}>{connection.lastUsedAt ? `Last fetched ${new Date(connection.lastUsedAt).toLocaleString()}` : "Not used yet"}</ThemedText></View><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Disconnect ${connection.clientName}`} disabled={busy} onPress={() => revoke(connection)}><Ionicons name="link-outline" size={21} color="#DC2626" /></TouchableOpacity></View>) : <ThemedText type="tiny" color={muted}>No active connected apps.</ThemedText>}
    {error ? <ThemedText type="tiny" color="#DC2626">{error}</ThemedText> : null}
    <ThemedText type="tiny" color={muted}>The connected app receives a versioned finance snapshot with sales, purchases, expenses, cash movements, balances, assets, batches, and inventory. It cannot edit Murimi records.</ThemedText>
    <TouchableOpacity onPress={() => router.back()}><ThemedText type="tiny" color={accent}>Back</ThemedText></TouchableOpacity>
  </ScrollView></ScreenWrapper>;
}
const styles = StyleSheet.create({ content: { padding: 18, gap: 14, paddingBottom: 36 }, info: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: "row", alignItems: "flex-start", gap: 10 }, flex: { flex: 1, gap: 5 }, codeCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 10 }, code: { fontSize: 14, fontWeight: "700", letterSpacing: 1 }, connection: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: "row", alignItems: "center", gap: 12 } });
