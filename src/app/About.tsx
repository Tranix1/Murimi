import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

export default function AboutScreen() {
  const accent = useThemeColor("accent");
  return <ScreenWrapper fh={false}><View style={{ flex: 1, padding: 24, gap: 16 }}>
    <ThemedText type="title">About Murimi</ThemedText>
    <ThemedText>Murimi helps manage farm operations and can share authorised farm financial information with Fynage.</ThemedText>
    <Pressable onPress={() => router.push("/Subscription" as never)}><ThemedText color={accent}>Subscription and referral credits</ThemedText></Pressable>
    <Pressable onPress={() => router.push("/Account/Settings" as never)}><ThemedText color={accent}>Farm team access</ThemedText></Pressable>
  </View></ScreenWrapper>;
}
