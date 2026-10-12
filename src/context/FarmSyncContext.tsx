/* eslint react-hooks/set-state-in-effect: "off", react-hooks/preserve-manual-memoization: "off" -- sync lifecycle effects intentionally mirror connectivity, auth, and queue state. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { useAuth } from "@/context/AuthContext";
import { getFarmSyncSummary, subscribeFarmSyncChanges } from "@/services/farmLocalDatabase";
import { refreshFarmAccountFromCloud, syncFarmAccount } from "@/services/farmRepository";

export type FarmSyncState = "signed_out" | "offline" | "saved_offline" | "syncing" | "pending" | "failed" | "synced";
type FarmSyncValue = { state: FarmSyncState; pendingCount: number; failedCount: number; lastSyncedAt: string | null; error: string | null; retry: () => Promise<void> };
const FarmSyncContext = createContext<FarmSyncValue | null>(null);

export function FarmSyncProvider({ children }: { children: ReactNode }) {
  const { user, activeAccountId } = useAuth();
  const [network, setNetwork] = useState<NetInfoState | null>(null);
  const [state, setState] = useState<FarmSyncState>("signed_out");
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = network?.isConnected === true && network.isInternetReachable !== false;
  const loadSummary = useCallback(async () => {
    if (!user?.uid || !activeAccountId) { setPendingCount(0); setFailedCount(0); setLastSyncedAt(null); return; }
    try {
      const summary = await getFarmSyncSummary(user.uid, activeAccountId);
      setPendingCount(summary.pendingCount); setFailedCount(summary.failedCount); setLastSyncedAt(summary.lastSyncedAt);
      if (summary.pendingCount === 0 && connected) setState("synced");
      else if (!connected && summary.pendingCount > 0) setState("saved_offline");
      else if (!connected) setState("offline");
      else if (summary.failedCount > 0) setState("failed");
      else if (summary.pendingCount > 0 && state !== "syncing") setState("pending");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read sync status."); }
  }, [user?.uid, activeAccountId, connected, state]);

  const synchronize = useCallback(async (force = false) => {
    if (!user?.uid || !activeAccountId || !connected) return;
    setState("syncing"); setError(null);
    try {
      await syncFarmAccount(user.uid, activeAccountId, force, (next, message) => {
        if (next === "failed") { setState("failed"); setError(message ?? "Synchronization failed."); }
        else if (next === "syncing") setState("syncing");
        else setError(null);
      });
      if (failedCount === 0) await refreshFarmAccountFromCloud(user.uid, activeAccountId);
      await loadSummary();
    } catch (cause) {
      setState("failed"); setError(cause instanceof Error ? cause.message : "Synchronization failed.");
    }
  }, [user?.uid, activeAccountId, connected, failedCount, loadSummary]);

  const retry = useCallback(async () => { await synchronize(true); }, [synchronize]);

  useEffect(() => NetInfo.addEventListener(setNetwork), []);
  useEffect(() => {
    if (!user?.uid || !activeAccountId) { setState("signed_out"); return; }
    let alive = true;
    const refresh = () => { if (alive) void loadSummary(); };
    const unsubscribe = subscribeFarmSyncChanges(user.uid, activeAccountId, refresh);
    void loadSummary();
    return () => { alive = false; unsubscribe(); };
  }, [user?.uid, activeAccountId, loadSummary]);
  useEffect(() => { if (connected) void synchronize(); else void loadSummary(); }, [connected, user?.uid, activeAccountId]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => { if (next === "active" && connected) void synchronize(); });
    return () => subscription.remove();
  }, [connected, synchronize]);

  const value = useMemo(() => ({ state, pendingCount, failedCount, lastSyncedAt, error, retry }), [state, pendingCount, failedCount, lastSyncedAt, error, retry]);
  return <FarmSyncContext.Provider value={value}>{children}</FarmSyncContext.Provider>;
}

export function useFarmSync(): FarmSyncValue {
  const value = useContext(FarmSyncContext);
  if (!value) throw new Error("useFarmSync must be used inside FarmSyncProvider.");
  return value;
}
