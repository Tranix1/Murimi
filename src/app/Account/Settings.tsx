import CustomHeader from "@/components/CustomHeader";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { FarmSyncStatus } from "@/components/farm/FarmSyncStatus";
import { useAuth } from "@/context/AuthContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { purgeLocalFarmUser } from "@/services/farmLocalDatabase";
import { deleteMurimiFarmAccount, finishMurimiFarmAccountDeletion, requestMurimiAccountDeletion } from "@/services/farmRepository";
import { getAuth, getIdToken, PhoneAuthProvider, reauthenticateWithCredential, signInWithPhoneNumber } from "@react-native-firebase/auth";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";

type PhoneConfirmation = Awaited<ReturnType<typeof signInWithPhoneNumber>>;

export default function AccountSettingsScreen() {
  const { user, accounts, activeAccountId, activeAccountName, createAccount, switchAccount, removeFarmAccount, Logout, clearDeletedUserData } = useAuth();
  const [confirmation, setConfirmation] = useState<PhoneConfirmation | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAccountNameInput, setShowAccountNameInput] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const accent = useThemeColor("accent"); const danger = useThemeColor("bad"); const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const text = useThemeColor("text"); const muted = useThemeColor("textlight"); const inputBackground = useThemeColor("background");

  const logout = async () => {
    const success = await Logout();
    if (success) router.replace("/Account/Login" as never);
    else setError("Could not log out. Please try again.");
  };

  const addAccount = async () => {
    if (accounts.length >= 10) { setError("You can have up to 10 farm accounts."); return; }
    setShowAccountNameInput(true);
    setError("");
  };

  const saveNewAccount = async () => {
    if (busy) return;
    const accountName = newAccountName.trim();
    if (!accountName) { setError("Enter a name for this account."); return; }
    setBusy(true); setError("");
    try {
      const account = await createAccount(accountName);
      if (!account) { setError("Account names must be unique and no longer than 40 characters. You can have up to 10 accounts."); return; }
      setNewAccountName(""); setShowAccountNameInput(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create another farm account.");
    } finally { setBusy(false); }
  };

  const selectAccount = async (accountId: string) => {
    if (busy || accountId === activeAccountId) return;
    setBusy(true); setError("");
    try {
      if (!await switchAccount(accountId)) setError("Could not switch farm accounts. Please try again.");
    } finally { setBusy(false); }
  };

  const confirmDeleteFarmAccount = (accountId: string, accountName: string) => Alert.alert(
    `Delete ${accountName}?`,
    `This permanently removes ${accountName} and its farm records from this device and Murimi cloud storage. Your other farm accounts will remain.`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Delete account", style: "destructive", onPress: () => void (async () => {
        if (!user?.uid) return;
        setBusy(true); setError("");
        let cloudDeleted = false;
        try {
          const currentUser = getAuth().currentUser;
          if (!currentUser) throw new Error("Sign in again before deleting a farm account.");
          const token = await getIdToken(currentUser, true);
          await deleteMurimiFarmAccount(user.uid, accountId, token);
          cloudDeleted = true;
          if (!await removeFarmAccount(accountId)) throw new Error("The cloud data was deleted, but the account list could not be updated on this device.");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not delete this farm account. Its local data was kept if cloud deletion failed.");
        } finally {
          if (cloudDeleted) finishMurimiFarmAccountDeletion(user.uid, accountId);
          setBusy(false);
        }
      })() },
    ],
  );

  const confirmDelete = () => Alert.alert(
    "Permanently delete Murimi account?",
    "This removes your Murimi sign-in and all Murimi cloud farm records, then clears this device’s farm data. This cannot be undone. Your records in the separate Transix project are not affected.",
    [{ text: "Cancel", style: "cancel" }, { text: "Continue", style: "destructive", onPress: () => void sendVerificationCode() }],
  );

  const sendVerificationCode = async () => {
    const currentUser = getAuth().currentUser;
    if (!currentUser?.phoneNumber) { setError("A verified phone number is required to delete this account."); return; }
    setBusy(true); setError("");
    try {
      const result = await signInWithPhoneNumber(getAuth(), currentUser.phoneNumber);
      setConfirmation(result); setVerificationCode("");
    } catch (cause) {
      setError(cause instanceof Error ? `Could not send a verification code: ${cause.message}` : "Could not send a verification code.");
    } finally { setBusy(false); }
  };

  const deleteAccount = async () => {
    const currentUser = getAuth().currentUser;
    if (!user?.uid || !currentUser || !confirmation || !verificationCode.trim() || busy) {
      setError("Enter the SMS verification code to continue."); return;
    }
    setBusy(true); setError("");
    try {
      const credential = PhoneAuthProvider.credential(confirmation.verificationId, verificationCode.trim());
      await reauthenticateWithCredential(currentUser, credential);
      const freshToken = await getIdToken(getAuth().currentUser ?? currentUser, true);
      await requestMurimiAccountDeletion(user.uid, freshToken);
      try {
        await purgeLocalFarmUser(user.uid);
        await clearDeletedUserData();
      } catch (cleanupError) {
        await clearDeletedUserData();
        router.replace("/Account/Login" as never);
        setError(cleanupError instanceof Error ? `The cloud account was deleted, but this device could not clear all local records: ${cleanupError.message}` : "The cloud account was deleted, but this device could not clear all local records.");
        return;
      }
      router.replace("/Account/Login" as never);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Murimi account deletion failed. Your local farm data was kept.");
    } finally { setBusy(false); }
  };

  return <ScreenWrapper fh={false}>
    <CustomHeader pageTitle="Account" showAccountAction={false} />
    <FarmSyncStatus />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.profile, { backgroundColor: surface, borderColor: border }]}>
        <View style={[styles.avatar, { backgroundColor: `${accent}18` }]}><Ionicons name="person-outline" size={26} color={accent} /></View>
        <ThemedText type="title" color={text}>Your Murimi account</ThemedText>
        <ThemedText type="tiny" color={muted}>{user?.displayName || user?.phoneNumber || "Murimi account"}</ThemedText>
        {user?.phoneNumber ? <ThemedText type="tiny" color={muted}>Phone number: {user.phoneNumber}</ThemedText> : null}
        {user?.email ? <ThemedText type="tiny" color={muted}>{user.email}</ThemedText> : null}
        <ThemedText type="tiny" color={muted}>{accounts.length} of 10 farm accounts · Current: {activeAccountName ?? "none"}</ThemedText>
      </View>
      <View style={[styles.accountsCard, { backgroundColor: surface, borderColor: border }]}>
        <ThemedText type="defaultSemiBold" color={text}>Farm accounts</ThemedText>
        {accounts.map((account) => {
          const selected = account.id === activeAccountId;
          return <View key={account.id} style={[styles.accountRow, { borderColor: selected ? accent : border, backgroundColor: selected ? `${accent}12` : "transparent", opacity: busy ? 0.7 : 1 }]}>
            <TouchableOpacity disabled={busy} onPress={() => void selectAccount(account.id)} style={styles.accountSelect}>
              <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={19} color={selected ? accent : muted} />
              <View style={styles.copy}><ThemedText type="defaultSemiBold" color={text}>{account.name}{selected ? " · Current" : ""}</ThemedText><ThemedText type="tiny" color={muted}>Account ID: {account.number} · {account.currentRole.accType}</ThemedText></View>
            </TouchableOpacity>
            {accounts.length > 1 ? <TouchableOpacity disabled={busy} onPress={() => confirmDeleteFarmAccount(account.id, account.name)} accessibilityRole="button" accessibilityLabel={`Delete ${account.name}`} style={styles.deleteAccountIcon}><Ionicons name="trash-outline" size={19} color={danger} /></TouchableOpacity> : null}
          </View>;
        })}
        {accounts.length === 1 ? <ThemedText type="tiny" color={muted}>Keep at least one farm account.</ThemedText> : null}
        {accounts.length < 10 ? <TouchableOpacity disabled={busy} onPress={() => void addAccount()} style={[styles.addAccount, { backgroundColor: accent, opacity: busy ? 0.6 : 1 }]}><Ionicons name="add-circle-outline" size={19} color="#fff" /><ThemedText type="defaultSemiBold" style={styles.addAccountText}>Add account</ThemedText></TouchableOpacity> : <ThemedText type="tiny" color={muted}>Maximum of 10 accounts reached.</ThemedText>}
        {showAccountNameInput ? <View style={styles.newAccountForm}><TextInput value={newAccountName} onChangeText={setNewAccountName} maxLength={40} autoFocus placeholder="Enter account name" placeholderTextColor={muted} style={[styles.codeInput, { color: text, borderColor: border, backgroundColor: inputBackground, letterSpacing: 0 }]} /><View style={styles.verifyActions}><TouchableOpacity disabled={busy} onPress={() => { setShowAccountNameInput(false); setNewAccountName(""); }} style={[styles.cancel, { borderColor: border }]}><ThemedText type="tiny" color={text}>Cancel</ThemedText></TouchableOpacity><TouchableOpacity disabled={busy} onPress={() => void saveNewAccount()} style={[styles.addAccount, styles.createAccountButton, { backgroundColor: accent, opacity: busy ? 0.6 : 1 }]}><ThemedText type="defaultSemiBold" style={styles.addAccountText}>{busy ? "Saving…" : "Create account"}</ThemedText></TouchableOpacity></View></View> : null}
      </View>
      <TouchableOpacity disabled={busy} onPress={() => void logout()} style={[styles.action, { backgroundColor: surface, borderColor: border, opacity: busy ? 0.6 : 1 }]}><Ionicons name="log-out-outline" size={21} color={accent} /><View style={styles.copy}><ThemedText type="defaultSemiBold" color={text}>Log out</ThemedText><ThemedText type="tiny" color={muted}>Sign out; keep cloud and local farm records</ThemedText></View><Ionicons name="chevron-forward" size={18} color={muted} /></TouchableOpacity>
      <View style={[styles.dangerCard, { backgroundColor: surface, borderColor: danger }]}>
        <ThemedText type="defaultSemiBold" color={text}>Delete Murimi account</ThemedText>
        <ThemedText type="tiny" color={muted}>Permanently delete the Murimi sign-in and all its Murimi cloud records. The device copy is cleared only after cloud deletion succeeds.</ThemedText>
        {!confirmation ? <TouchableOpacity disabled={busy} onPress={confirmDelete} style={[styles.delete, { backgroundColor: danger, opacity: busy ? 0.6 : 1 }]}><ThemedText type="defaultSemiBold" style={styles.deleteText}>{busy ? "Sending code…" : "Delete Murimi account"}</ThemedText></TouchableOpacity> : <View style={styles.verifyBox}>
          <ThemedText type="tiny" color={muted}>Enter the SMS code sent to {getAuth().currentUser?.phoneNumber ?? "your phone"}.</ThemedText>
          <TextInput value={verificationCode} onChangeText={setVerificationCode} keyboardType="number-pad" maxLength={8} autoComplete="sms-otp" placeholder="Verification code" placeholderTextColor={muted} style={[styles.codeInput, { color: text, borderColor: border, backgroundColor: inputBackground }]} />
          <View style={styles.verifyActions}><TouchableOpacity disabled={busy} onPress={() => { setConfirmation(null); setVerificationCode(""); }} style={[styles.cancel, { borderColor: border }]}><ThemedText type="tiny" color={text}>Cancel</ThemedText></TouchableOpacity><TouchableOpacity disabled={busy} onPress={() => void deleteAccount()} style={[styles.delete, styles.verifyDelete, { backgroundColor: danger, opacity: busy ? 0.6 : 1 }]}><ThemedText type="defaultSemiBold" style={styles.deleteText}>{busy ? "Deleting…" : "Verify and delete"}</ThemedText></TouchableOpacity></View>
        </View>}
      </View>
      {error ? <ThemedText type="tiny" color={danger}>{error}</ThemedText> : null}
    </ScrollView>
  </ScreenWrapper>;
}

const styles = StyleSheet.create({ content: { padding: 18, paddingBottom: 30, gap: 12 }, profile: { alignItems: "center", gap: 6, padding: 20, borderWidth: 1, borderRadius: 16, marginBottom: 4 }, avatar: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", marginBottom: 5 }, action: { minHeight: 70, borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: "row", alignItems: "center", gap: 12 }, accountsCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 9 }, accountRow: { minHeight: 56, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 10 }, accountSelect: { flex: 1, minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10 }, deleteAccountIcon: { padding: 8 }, addAccount: { minHeight: 46, borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }, addAccountText: { color: "#fff" }, newAccountForm: { gap: 9, paddingTop: 4 }, createAccountButton: { flex: 2 }, copy: { flex: 1, gap: 3 }, dangerCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 9, marginTop: 12 }, delete: { minHeight: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 3, paddingHorizontal: 14 }, deleteText: { color: "#fff" }, verifyBox: { gap: 9 }, codeInput: { minHeight: 46, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, fontSize: 18, letterSpacing: 3 }, verifyActions: { flexDirection: "row", gap: 9 }, cancel: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 10 }, verifyDelete: { flex: 2 }, });
