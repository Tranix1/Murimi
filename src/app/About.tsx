import React from "react";
import { View } from "react-native";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";

export default function AboutScreen() {
  return (
    <ScreenWrapper fh={false}>
      <View style={{ flex: 1, padding: 24, gap: 10 }}>
        <ThemedText type="title">About</ThemedText>
        <ThemedText>Hi, this is the About page.</ThemedText>
      </View>
    </ScreenWrapper>
  );
}
