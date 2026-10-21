
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFarmAccountMetadata, saveFarmAccountMetadata } from "@/services/farmRepository";

import {
  getAuth,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "@react-native-firebase/auth";
import type { AccountType, CurrentRole } from "@/types/types";

export type SavedAccount = {
  id: string;
  number: number;
  name: string;
  currentRole: CurrentRole;
};

const defaultRole = (accountType: AccountType = "tracking"): CurrentRole => {
  if (accountType === "fleet") {
    return { role: "fleet", accType: "fleet", userRole: "owner", fleetId: "", companyName: "", driverId: null, fleetMainAdminId: null, fleetManagerId: null, fleetDispatcherId: null, brokerId: "", referrerCode: null, organizationId: null, phone: null, email: null, billingAddress: null, baseAdress: null, profilePhoto: "" };
  }
  if (accountType === "brokerage") {
    return { role: "brokerage", accType: "brokerage", userRole: "owner", brokerId: "", companyName: "", brokerType: "", fleetId: null, referrerCode: null, organizationId: null, phone: null, email: null, billingAddress: null, baseAdress: null, profilePhoto: "" };
  }
  if (accountType === "driver") {
    return { role: "driver", accType: "driver", userRole: "driver", driverId: "", driverName: "", brokerType: "", fleetId: null, referrerCode: null, organizationId: null, phone: null, email: null, billingAddress: null, baseAdress: null, companyName: "", profilePhoto: "" };
  }
  return { role: "general", accType: accountType, userRole: "tracking", companyName: "", driverId: null, fleetId: null, brokerId: "", referrerCode: null, organizationId: null, phone: null, email: null, billingAddress: null, baseAdress: null, profilePhoto: "" };
};

const accountsStorageKey = (uid: string) => `murimi_accounts_${uid}`;
const currentRoleStorageKey = (uid: string) => `murimi_currentRole_${uid}`;
const activeAccountStorageKey = (uid: string) => `murimi_activeAccount_${uid}`;

export type AuthUser = {
  uid: string;
  phoneNumber?: string | null;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
};

export type AuthResponse = {
  success: boolean;
  message: string;
};

export type LoginInput = {
  phoneNumber: string;
  verificationId?: string;
  accountType: AccountType;
};

export type SignUpInput = LoginInput & {
  displayName: string;
  referrerCode?: string;
  referralValidation?: unknown;
  countryCode?: string;
  countryName?: string;
};

export type AuthContextValue = {
  user: AuthUser | null;
  isSignedIn: boolean;
  isLoading: boolean;
  currentRole: CurrentRole;
  accounts: SavedAccount[];
  activeAccountId: string | null;
  activeAccountName: SavedAccount["name"] | null;
  createAccount: (name: string) => Promise<SavedAccount | null>;
  switchAccount: (accountId: string) => Promise<boolean>;
  removeFarmAccount: (accountId: string) => Promise<boolean>;

  // Called after Firebase phone OTP authentication succeeds.
  Login: (input: LoginInput) => Promise<AuthResponse>;

  // Creates the basic Murimi user profile after OTP verification.
  signUp: (input: SignUpInput) => Promise<AuthResponse>;

  setupUser: (firebaseUser: { uid: string; phoneNumber: string | null; displayName: string | null; email: string | null; photoURL: string | null } | null, accountType?: AccountType) => Promise<void>;

  updateUserProfile: (displayName: string) => Promise<boolean>;

  Logout: () => Promise<boolean>;
  clearDeletedUserData: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentRole, setCurrentRole] = useState<CurrentRole>(defaultRole());
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

  const setupUser = async (firebaseUser: { uid: string; phoneNumber: string | null; displayName: string | null; email: string | null; photoURL: string | null } | null, accountType?: AccountType) => {
    if (!firebaseUser) {
      setUser(null);
      setIsSignedIn(false);
      setAccounts([]);
      setCurrentRole(defaultRole());
      setActiveAccountId(null);
      setIsLoading(false);
      return;
    }

    const appUser: AuthUser = {
      uid: firebaseUser.uid,
      phoneNumber: firebaseUser.phoneNumber,
      displayName: firebaseUser.displayName,
      email: firebaseUser.email,
      photoURL: firebaseUser.photoURL,
    };

    setUser(appUser);
    setIsSignedIn(true);
    try {
      const [storedAccounts, storedRole, storedActiveId] = await Promise.all([
        AsyncStorage.getItem(accountsStorageKey(firebaseUser.uid)),
        AsyncStorage.getItem(currentRoleStorageKey(firebaseUser.uid)),
        AsyncStorage.getItem(activeAccountStorageKey(firebaseUser.uid)),
      ]);
      let nextAccounts: SavedAccount[] = storedAccounts ? JSON.parse(storedAccounts) : [];
      if (!Array.isArray(nextAccounts)) nextAccounts = [];
      nextAccounts = nextAccounts.map((account, index) => {
        const parsedNumber = Number(account.number ?? String(account.id ?? "").match(/\d+/)?.[0] ?? String(account.name ?? "").match(/\d+/)?.[0]);
        return { ...account, id: String(account.id ?? index + 1), number: Number.isInteger(parsedNumber) && parsedNumber > 0 ? parsedNumber : index + 1, name: typeof account.name === "string" && account.name.trim() ? account.name.trim() : `Account ${index + 1}` };
      });
      let storedRoleValue: CurrentRole | null = storedRole ? JSON.parse(storedRole) : null;
      if (!nextAccounts.length) {
        const firstRole = storedRoleValue ?? defaultRole(accountType);
        nextAccounts = [{ id: "1", number: 1, name: "Account 1", currentRole: firstRole }];
        await AsyncStorage.setItem(accountsStorageKey(firebaseUser.uid), JSON.stringify(nextAccounts));
      }
      const selectedAccount = nextAccounts.find((item) => item.id === storedActiveId) ?? nextAccounts[0];
      const nextRole: CurrentRole = selectedAccount?.currentRole ?? storedRoleValue ?? defaultRole(accountType);
      if (selectedAccount) {
        await AsyncStorage.setItem(activeAccountStorageKey(firebaseUser.uid), selectedAccount.id);
        await AsyncStorage.setItem(currentRoleStorageKey(firebaseUser.uid), JSON.stringify(nextRole));
      }
      await AsyncStorage.setItem(accountsStorageKey(firebaseUser.uid), JSON.stringify(nextAccounts));
      setAccounts(nextAccounts);
      setCurrentRole(nextRole);
      setActiveAccountId(selectedAccount?.id ?? (nextAccounts[0]?.id ?? null));
      // Local account state is enough to open the app offline. Cloud metadata is
      // restored in the background so a fresh install can discover its accounts.
      setIsLoading(false);
      void (async () => {
        try {
          const cloudAccounts = await getFarmAccountMetadata(firebaseUser.uid);
          if (cloudAccounts.length) {
            const restoredAccounts = cloudAccounts as SavedAccount[];
            const active = restoredAccounts.find((item) => item.id === storedActiveId) ?? restoredAccounts[0];
            if (!active || getAuth().currentUser?.uid !== firebaseUser.uid) return;
            await AsyncStorage.setItem(accountsStorageKey(firebaseUser.uid), JSON.stringify(restoredAccounts));
            await AsyncStorage.setItem(activeAccountStorageKey(firebaseUser.uid), active.id);
            await AsyncStorage.setItem(currentRoleStorageKey(firebaseUser.uid), JSON.stringify(active.currentRole));
            setAccounts(restoredAccounts);
            setCurrentRole(active.currentRole);
            setActiveAccountId(active.id);
          } else {
            await Promise.all(nextAccounts.map((account) => saveFarmAccountMetadata(firebaseUser.uid, account).catch((error) => console.warn(`Could not sync farm account ${account.number} metadata yet.`, error))));
          }
        } catch (error) {
          console.warn("Could not restore Murimi farm accounts from cloud; using this device's saved copy.", error);
        }
      })();
    } catch (error) {
      console.error("Failed to restore saved accounts:", error);
    }
    setIsLoading(false);
  };

  // Restore the Firebase session when the app opens.
  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        void setupUser(firebaseUser);
      }
    );

    return unsubscribe;
  }, []);

  // Login: call after the phone OTP has been verified.
  const Login = async ({ phoneNumber, accountType }: LoginInput): Promise<AuthResponse> => {
    try {
      const firebaseUser = getAuth().currentUser;

      if (!firebaseUser) {
        return {
          success: false,
          message: "Please verify your phone number first.",
        };
      }

      if (firebaseUser.phoneNumber && firebaseUser.phoneNumber !== phoneNumber) {
        return { success: false, message: "The verified phone number does not match." };
      }

      await setupUser(firebaseUser, accountType);

      return {
        success: true,
        message: "Login successful.",
      };
    } catch (error: any) {
      console.error("Murimi login failed:", error);

      return {
        success: false,
        message: error?.message ?? "Login failed.",
      };
    }
  };

  // Signup: call after phone OTP verification.
  const signUp = async ({ displayName, phoneNumber, accountType }: SignUpInput): Promise<AuthResponse> => {
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;

      if (!firebaseUser) {
        return {
          success: false,
          message: "Please verify your phone number first.",
        };
      }

      if (firebaseUser.phoneNumber && firebaseUser.phoneNumber !== phoneNumber) {
        return { success: false, message: "The verified phone number does not match." };
      }

      const name = displayName.trim();

      if (!name) {
        return {
          success: false,
          message: "Please enter your name.",
        };
      }

      await updateProfile(firebaseUser, {
        displayName: name,
      });

      await setupUser(auth.currentUser, accountType);

      return {
        success: true,
        message: "Murimi signup successful.",
      };
    } catch (error: any) {
      console.error("Murimi signup failed:", error);

      return {
        success: false,
        message: error?.message ?? "Signup failed.",
      };
    }
  };

  const createAccount = async (accountName: string): Promise<SavedAccount | null> => {
    if (!user) return null;
    if (accounts.length >= 10) return null;
    const name = accountName.trim();
    if (!name || name.length > 40 || accounts.some((account) => account.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return null;
    const usedNumbers = new Set(accounts.map((account) => account.number));
    const accountNumber = Array.from({ length: 10 }, (_, index) => index + 1).find((number) => !usedNumbers.has(number));
    if (!accountNumber) return null;
    const account: SavedAccount = {
      id: String(accountNumber),
      number: accountNumber,
      name,
      currentRole: { ...currentRole },
    };
    const nextAccounts = [...accounts, account];
    try {
      await AsyncStorage.setItem(accountsStorageKey(user.uid), JSON.stringify(nextAccounts));
      await AsyncStorage.setItem(currentRoleStorageKey(user.uid), JSON.stringify(account.currentRole));
      await AsyncStorage.setItem(activeAccountStorageKey(user.uid), account.id);
      try { await saveFarmAccountMetadata(user.uid, account); } catch (error) { console.warn("Farm account was saved on this device but its cloud metadata could not sync yet.", error); }
      setAccounts(nextAccounts);
      setCurrentRole(account.currentRole);
      setActiveAccountId(account.id);
      return account;
    } catch (error) {
      console.error("Failed to save account:", error);
      return null;
    }
  };

  const switchAccount = async (accountId: string): Promise<boolean> => {
    if (!user) return false;
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return false;
    try {
      await AsyncStorage.setItem(currentRoleStorageKey(user.uid), JSON.stringify(account.currentRole));
      await AsyncStorage.setItem(activeAccountStorageKey(user.uid), account.id);
      setCurrentRole(account.currentRole);
      setActiveAccountId(account.id);
      return true;
    } catch (error) {
      console.error("Failed to switch account:", error);
      return false;
    }
  };

  const removeFarmAccount = async (accountId: string): Promise<boolean> => {
    if (!user) return false;
    const nextAccounts = accounts.filter((account) => account.id !== accountId);
    if (nextAccounts.length === accounts.length) return false;
    const nextActive = activeAccountId === accountId ? nextAccounts[0] : nextAccounts.find((account) => account.id === activeAccountId);
    try {
      await AsyncStorage.setItem(accountsStorageKey(user.uid), JSON.stringify(nextAccounts));
      if (nextActive) {
        await AsyncStorage.setItem(activeAccountStorageKey(user.uid), nextActive.id);
        await AsyncStorage.setItem(currentRoleStorageKey(user.uid), JSON.stringify(nextActive.currentRole));
      } else {
        await AsyncStorage.multiRemove([activeAccountStorageKey(user.uid), currentRoleStorageKey(user.uid)]);
      }
      setAccounts(nextAccounts);
      setActiveAccountId(nextActive?.id ?? null);
      setCurrentRole(nextActive?.currentRole ?? defaultRole());
      return true;
    } catch (error) {
      console.error("Failed to remove farm account:", error);
      return false;
    }
  };

  const updateUserProfile = async (
    displayName: string
  ): Promise<boolean> => {
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      const name = displayName.trim();

      if (!firebaseUser || !name) {
        return false;
      }

      await updateProfile(firebaseUser, {
        displayName: name,
      });

      await setupUser(auth.currentUser);

      return true;
    } catch (error) {
      console.error("Profile update failed:", error);
      return false;
    }
  };

  const Logout = async (): Promise<boolean> => {
    try {
      await signOut(getAuth());

      setUser(null);
      setIsSignedIn(false);
      setAccounts([]);
      setCurrentRole(defaultRole());
      setActiveAccountId(null);

      return true;
    } catch (error) {
      console.error("Murimi logout failed:", error);
      return false;
    }
  };

  const clearDeletedUserData = async (): Promise<void> => {
    const uid = user?.uid;
    if (uid) await AsyncStorage.multiRemove([accountsStorageKey(uid), currentRoleStorageKey(uid), activeAccountStorageKey(uid)]);
    setUser(null);
    setIsSignedIn(false);
    setAccounts([]);
    setCurrentRole(defaultRole());
    setActiveAccountId(null);
    try { await signOut(getAuth()); } catch { /* The server may already have invalidated this user. */ }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isSignedIn,
        isLoading,
        currentRole,
        accounts,
        activeAccountId,
        activeAccountName: accounts.find((account) => account.id === activeAccountId)?.name ?? null,
        createAccount,
        switchAccount,
        removeFarmAccount,
        Login,
        signUp,
        setupUser,
        updateUserProfile,
        Logout,
        clearDeletedUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside an AuthProvider"
    );
  }

  return context;
}
