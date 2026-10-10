import React from "react";
import { Alert, StyleSheet, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";

export default function AccountsScreen() {
  const { user, accounts, currentRole, createAccount, switchAccount } = useAuth();
  const accent = useThemeColor("accent");
  const background = useThemeColor("backgroundLight");

  const handleCreate = async () => {
    const account = await createAccount();
    if (!account) {
      Alert.alert("Accounts", user ? "You already have acc 1 and acc 2." : "Sign in before creating an account.");
      return;
    }
    router.replace("/");
  };

  const handleSwitch = async (accountId: string) => {
    if (await switchAccount(accountId)) router.replace("/");
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ThemedText>Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title">Accounts</ThemedText>
        <ThemedText>Current role: {currentRole.accType}</ThemedText>
        {accounts.map((account) => (
          <TouchableOpacity
            key={account.id}
            onPress={() => void handleSwitch(account.id)}
            style={[styles.account, { backgroundColor: background, borderColor: accent }]}
          >
            <ThemedText type="subtitle">{account.name}{account.currentRole === currentRole ? " (current)" : ""}</ThemedText>
            <ThemedText>{account.currentRole.accType}</ThemedText>
          </TouchableOpacity>
        ))}
        {accounts.length < 2 && (
          <TouchableOpacity onPress={() => void handleCreate()} style={[styles.create, { backgroundColor: accent }]}>
            <ThemedText style={styles.createLabel}>Create {accounts.length === 0 ? "acc 1" : "acc 2"}</ThemedText>
          </TouchableOpacity>
        )}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 14 },
  back: { alignSelf: "flex-start", paddingVertical: 8 },
  account: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 4 },
  create: { borderRadius: 12, padding: 16, alignItems: "center" },
  createLabel: { color: "white", fontWeight: "700" },
});
