import React, { useState } from "react";
import { Alert, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { BatchPage, batchStyles } from "./_components";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

export default function BatchSalesScreen() {
  const { batchId } = useLocalSearchParams<{ batchId?: string }>();
  const [amount, setAmount] = useState("");
  const border = useThemeColor("border");
  const surface = useThemeColor("backgroundLight");
  const accent = useThemeColor("accent");
  const muted = useThemeColor("textlight");
  return (
    <BatchPage title="Record sale">
      <View style={batchStyles.body}>
        <ThemedText color={muted} style={batchStyles.note}>Record a sale for {batchId || "this batch"}.</ThemedText>
        <View style={batchStyles.fieldGroup}>
          <ThemedText style={batchStyles.fieldLabel}>Amount collected</ThemedText>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={muted} style={[batchStyles.field, { backgroundColor: surface, borderColor: border }]} />
        </View>
        <TouchableOpacity activeOpacity={0.8} onPress={() => amount.trim() ? Alert.alert("Saved", "Sales tracking is ready to connect.") : Alert.alert("Sale amount", "Enter an amount to continue.")} style={[batchStyles.button, { backgroundColor: accent }]}>
          <ThemedText style={batchStyles.buttonText}>Save sale</ThemedText>
        </TouchableOpacity>
      </View>
    </BatchPage>
  );
}
