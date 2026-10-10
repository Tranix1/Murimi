
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  getAuth,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "@react-native-firebase/auth";
import type { AccountType } from "@/types/types";

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

  // Called after Firebase phone OTP authentication succeeds.
  Login: (input: LoginInput) => Promise<AuthResponse>;

  // Creates the basic Murimi user profile after OTP verification.
  signUp: (input: SignUpInput) => Promise<AuthResponse>;

  setupUser: (firebaseUser: { uid: string; phoneNumber: string | null; displayName: string | null; email: string | null; photoURL: string | null } | null) => Promise<void>;

  updateUserProfile: (displayName: string) => Promise<boolean>;

  Logout: () => Promise<boolean>;
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

  const setupUser = async (firebaseUser: { uid: string; phoneNumber: string | null; displayName: string | null; email: string | null; photoURL: string | null } | null) => {
    if (!firebaseUser) {
      setUser(null);
      setIsSignedIn(false);
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

      await setupUser(firebaseUser);

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
  const signUp = async ({ displayName, phoneNumber }: SignUpInput): Promise<AuthResponse> => {
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

      await setupUser(auth.currentUser);

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

      return true;
    } catch (error) {
      console.error("Murimi logout failed:", error);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isSignedIn,
        isLoading,
        Login,
        signUp,
        setupUser,
        updateUserProfile,
        Logout,
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
