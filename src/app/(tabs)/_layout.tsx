import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function MainTabs() {
  const insets = useSafeAreaInsets();
  const accent = useThemeColor("accent");
  const muted = useThemeColor("icon");
  const background = useThemeColor("background");
  const border = useThemeColor("border");

  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: accent,
      tabBarInactiveTintColor: muted,
      // Include the phone's bottom gesture area in the bar height so the
      // buttons sit above it instead of being clipped at the screen edge.
      tabBarStyle: {
        backgroundColor: background,
        borderTopColor: border,
        height: 62 + insets.bottom,
        paddingTop: 7,
        paddingBottom: Math.max(insets.bottom, 8),
      },
      tabBarIcon: ({ color, size }) => {
        const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
          index: "home-outline",
          batches: "leaf-outline",
          finances: "wallet-outline",
          more: "grid-outline",
        };
        return <Ionicons name={icons[route.name] ?? "ellipse-outline"} color={color} size={size} />;
      },
    })}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="batches" options={{ title: "Batches" }} />
      <Tabs.Screen name="finances" options={{ title: "Finances" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
