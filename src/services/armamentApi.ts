import { getAuth } from "@react-native-firebase/auth";

const endpoint = "https://us-central1-armament-f5a0b.cloudfunctions.net/";
export async function callArmament<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Sign in to use shared Armament services.");
  const response = await fetch(`${endpoint}${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  const body = await response.json() as { result?: T; error?: { message?: string } };
  if (!response.ok || body.error) throw new Error(body.error?.message ?? "Armament service is unavailable.");
  return body.result as T;
}
