import { Stack } from "expo-router";
import { AuthProvider } from "@/context/AuthContext";
import { FarmSyncProvider } from "@/context/FarmSyncContext";

export default function RootLayout() {
  return (
    <AuthProvider>
      <FarmSyncProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="Account/Accounts" options={{ presentation: "modal" }} />
          <Stack.Screen name="Batches/CreateBatch" options={{ presentation: "modal" }} />
          <Stack.Screen name="Batches/BatchDetails" />
          <Stack.Screen name="Batches/Sales" options={{ presentation: "modal" }} />
        </Stack>
      </FarmSyncProvider>
    </AuthProvider>
  );
}
