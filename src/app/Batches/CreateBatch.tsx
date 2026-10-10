import React, { useState } from "react";
import { Alert, TextInput, TouchableOpacity, View } from "react-native";
import { BatchPage, batchStyles } from "./_components";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

export default function CreateBatchScreen() {
  const [name, setName] = useState("");
  const [birdCount, setBirdCount] = useState("");
  const border = useThemeColor("border");
  const surface = useThemeColor("backgroundLight");
  const accent = useThemeColor("accent");
  const muted = useThemeColor("textlight");

  const save = () => {
    if (!name.trim() || !birdCount.trim()) {
      Alert.alert("Batch details", "Enter a batch name and starting bird count.");
      return;
    }
    Alert.alert("Saved", "Batch setup is ready to connect to your farm data.");
  };

  return (
    <BatchPage title="Create batch">
      <View style={batchStyles.body}>
        <ThemedText color={muted} style={batchStyles.note}>Start a simple record for a new group of birds.</ThemedText>
        <View style={batchStyles.fieldGroup}>
          <ThemedText style={batchStyles.fieldLabel}>Batch name</ThemedText>
          <TextInput value={name} onChangeText={setName} placeholder="For example, Batch 003" placeholderTextColor={muted} style={[batchStyles.field, { backgroundColor: surface, borderColor: border }]} />
        </View>
        <View style={batchStyles.fieldGroup}>
          <ThemedText style={batchStyles.fieldLabel}>Starting bird count</ThemedText>
          <TextInput value={birdCount} onChangeText={setBirdCount} keyboardType="number-pad" placeholder="Enter number of birds" placeholderTextColor={muted} style={[batchStyles.field, { backgroundColor: surface, borderColor: border }]} />
        </View>
        <TouchableOpacity activeOpacity={0.8} onPress={save} style={[batchStyles.button, { backgroundColor: accent }]}>
          <ThemedText style={batchStyles.buttonText}>Save batch</ThemedText>
        </TouchableOpacity>
      </View>
    </BatchPage>
  );
}
