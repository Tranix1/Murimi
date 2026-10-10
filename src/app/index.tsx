import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import About from "./About";
import Home from "./Home/Index";
import Login from "./Account/Login";
import SignUp from "./Account/SignUp";
import { useAuth } from "@/context/AuthContext";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

type MainTab = "Home" | "About";

export default function Index() {
  const { user, isSignedIn, isLoading, accounts } = useAuth();
  const [selectedTab, setSelectedTab] = useState<MainTab>("Home");
  const [showSignUp, setShowSignUp] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const accent = useThemeColor("accent");
  const background = useThemeColor("background");
  const iconColor = useThemeColor("icon");
  const { bottom } = useSafeAreaInsets();

  const needsAccountEntry = !isSignedIn || !user || accounts.length === 0;

  let content: React.ReactNode;
  if (selectedTab === "About") {
    content = <About />;
  } else if (isLoading || isSigningUp) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={accent} />
        <ThemedText>{isSigningUp ? "Creating your account…" : "Loading your account…"}</ThemedText>
      </View>
    );
  } else if (needsAccountEntry) {
    content = showSignUp ? (
      <SignUp
        setDspLoginOrSignup={() => setShowSignUp(false)}
        setIsSigningUp={setIsSigningUp}
      />
    ) : (
      <Login setDspLoginOrSignup={() => setShowSignUp(true)} />
    );
  } else {
    content = <Home />;
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <View style={styles.content}>{content}</View>
      <View style={[styles.tabBar, { backgroundColor: background, paddingBottom: Math.max(bottom, 10) }]}>
        {(["Home", "About"] as const).map((tab) => {
          const selected = selectedTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setSelectedTab(tab)}
              style={styles.tab}
            >
              <Ionicons
                name={tab === "Home" ? "home-outline" : "information-circle-outline"}
                size={22}
                color={selected ? accent : iconColor}
              />
              <ThemedText color={selected ? accent : iconColor} type={selected ? "defaultSemiBold" : "tiny"}>
                {tab}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  tabBar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#8885", paddingTop: 8 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, minHeight: 48 },
});
