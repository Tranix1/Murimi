import React from "react";
import { Alert, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";

export default function AccountsScreen() {
  const { user, accounts, activeAccountId, currentRole, createAccount, switchAccount } = useAuth();
  const accent = useThemeColor("accent");
  const background = useThemeColor("backgroundLight");
  const muted = useThemeColor("textlight");
  const textColor = useThemeColor("text");
  const [accountName, setAccountName] = useState("");

  const handleCreate = async () => {
    const account = await createAccount(accountName);
    if (!account) {
      Alert.alert("Accounts", user ? "Enter a unique account name. You can create up to 10 farm accounts." : "Sign in before creating an account.");
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
            <ThemedText type="subtitle">{account.name}{account.id === activeAccountId ? " (current)" : ""}</ThemedText>
            <ThemedText type="tiny" color={muted}>Account ID: {account.number}</ThemedText>
            <ThemedText>{account.currentRole.accType}</ThemedText>
          </TouchableOpacity>
        ))}
        {accounts.length < 10 && (
          <TextInput value={accountName} onChangeText={setAccountName} maxLength={40} placeholder="New account name" placeholderTextColor={muted} style={[styles.nameInput, { borderColor: accent, color: textColor }]} />
        )}
        {accounts.length < 10 && (
          <TouchableOpacity onPress={() => void handleCreate()} style={[styles.create, { backgroundColor: accent }]}>
            <ThemedText style={styles.createLabel}>Add account</ThemedText>
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
  nameInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 46 },
});
