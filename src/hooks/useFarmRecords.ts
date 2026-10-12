/* eslint react-hooks/set-state-in-effect: "off" -- clear user scoped rows immediately when auth/account changes. */
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { subscribeFarmRecords, type FarmCollection } from "@/services/farmRepository";
import type { FarmRecord } from "@/types/farm";

export function useFarmRecords<T extends FarmRecord>(collectionName: FarmCollection) {
  const { user, activeAccountId } = useAuth();
  const [records, setRecords] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid || !activeAccountId) {
      setRecords([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    const unsubscribe = subscribeFarmRecords<T>(user.uid, activeAccountId, collectionName, (nextRecords) => {
      setRecords(nextRecords);
      setIsLoading(false);
    }, (cause) => {
      setError(cause.message || "Unable to load farm records.");
      setIsLoading(false);
    });
    return unsubscribe;
  }, [user?.uid, activeAccountId, collectionName]);

  return { records, isLoading, error, userId: user?.uid, accountId: activeAccountId };
}
