import React, { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import Login from "../Account/Login";
import SignUp from "../Account/SignUp";
import Home from "../Home/Index";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";

export default function HomeTab() {
  const { user, isSignedIn, isLoading, accounts } = useAuth();
  const accent = useThemeColor("accent");
  const muted = useThemeColor("textlight");
  const [showSignUp, setShowSignUp] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const needsAccountEntry = !isSignedIn || !user || accounts.length === 0;

  if (isLoading || isSigningUp) {
    return <ScreenWrapper fh={false}><View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}><ActivityIndicator size="large" color={accent} /><ThemedText color={muted}>{isSigningUp ? "Creating your account…" : "Loading your farm…"}</ThemedText></View></ScreenWrapper>;
  }
  if (!needsAccountEntry) return <Home />;
  return showSignUp
    ? <SignUp setDspLoginOrSignup={() => setShowSignUp(false)} setIsSigningUp={setIsSigningUp} />
    : <Login setDspLoginOrSignup={() => setShowSignUp(true)} />;
}
