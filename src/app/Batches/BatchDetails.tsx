import React from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { BatchPage, batchStyles } from "./_components";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

export default function BatchDetailsScreen() {
  const { batchId } = useLocalSearchParams<{ batchId?: string }>();
  const muted = useThemeColor("textlight");
  const surface = useThemeColor("backgroundLight");
  const border = useThemeColor("border");
  return (
    <BatchPage title="Batch details">
      <View style={batchStyles.body}>
        <View style={[batchStyles.field, { backgroundColor: surface, borderColor: border }]}>
          <ThemedText type="subtitle">{batchId || "Batch"}</ThemedText>
        </View>
        <ThemedText color={muted} style={batchStyles.note}>Batch performance, feed use and daily records will appear here.</ThemedText>
      </View>
    </BatchPage>
  );
}
