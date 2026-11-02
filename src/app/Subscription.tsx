import React, { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { doc, getDoc, getFirestore } from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { callArmament } from "@/services/armamentApi";
import { useThemeColor } from "@/hooks/useThemeColor";

const endpoint = "https://us-central1-armament-f5a0b.cloudfunctions.net/createArmamentSubscriptionPayment";
export default function SubscriptionScreen() {
  const { activeAccountId } = useAuth();
  const [status, setStatus] = useState<Record<string, any> | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);
  const [businessCovered, setBusinessCovered] = useState(false);
  const [canSubscribe, setCanSubscribe] = useState(true);
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight");
  const refresh = useCallback(async () => {
    const uid = getAuth().currentUser?.uid; if (!uid) return;
    try {
      const [snapshot, businessList] = await Promise.all([
        getDoc(doc(getFirestore(), "subscriptions", uid)),
        callArmament<{ businesses: { id: string; sourceApp: string; sourceId: string; role: string }[] }>("listArmamentBusinesses"),
      ]);
      setStatus(snapshot.exists() ? snapshot.data() : null);
      const farm = businessList.businesses.find((business) => business.sourceApp === "murimi" && business.sourceId === activeAccountId);
      const entitlement = farm ? await callArmament<{ active: boolean }>("getArmamentEntitlement", { businessId: farm.id }) : null;
      setBusinessCovered(entitlement?.active === true);
      setCanSubscribe(!farm || farm.role === "owner");
      setCheckedAt(Date.now());
      const referral = await callArmament<{ code: string }>("assignArmamentReferralCode");
      setCode(referral.code); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Subscription could not be loaded."); }
  }, [activeAccountId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const pay = async () => {
    const user = getAuth().currentUser; if (!user) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { Authorization: "Bearer " + await user.getIdToken(), "Content-Type": "application/json" }, body: JSON.stringify({ sourceApp: "murimi", businessId: activeAccountId, returnUrl: "murimi://subscription" }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Payment could not start.");
      await Linking.openURL(result.redirectUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Payment could not start."); }
    finally { setBusy(false); }
  };
  const expiresAt = status?.expiresAt?.toDate?.();
  const active = businessCovered || (status?.status === "active" && expiresAt instanceof Date && expiresAt.getTime() > checkedAt);
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page}>
    <ThemedText type="title">Armament subscription</ThemedText>
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <ThemedText type="subtitle">{businessCovered ? "Covered by the farm owner’s subscription" : active ? "Active until " + expiresAt.toLocaleDateString() : "No active subscription"}</ThemedText>
      <ThemedText type="tiny" color={muted}>One verified owner subscription grants access to authorised members across Murimi, Tengesa and Fynage.</ThemedText>
      {error ? <ThemedText color="#a33">{error}</ThemedText> : null}
      {canSubscribe ? <Pressable disabled={busy || !activeAccountId} onPress={() => void pay()} style={[styles.button, { backgroundColor: accent, opacity: busy || !activeAccountId ? 0.55 : 1 }]}><ThemedText color="#fff">{busy ? "Opening Paynow…" : active ? "Renew for US$1" : "Subscribe for US$1"}</ThemedText></Pressable> : <ThemedText type="tiny" color={muted}>The farm owner manages the subscription for your access.</ThemedText>}
    </View>
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <ThemedText type="subtitle">Referral code</ThemedText><ThemedText selectable color={accent}>{code || "Loading…"}</ThemedText>
      <ThemedText type="tiny" color={muted}>Referral credits are issued only after the new account makes its first verified payment. Redeem credits from the subscription screen in Tengesa or Fynage.</ThemedText>
    </View>
  </ScrollView></ScreenWrapper>;
}
const styles = StyleSheet.create({ page: { padding: 18, gap: 14 }, card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 }, button: { minHeight: 46, borderRadius: 9, alignItems: "center", justifyContent: "center" } });
