import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  getAuth,
  signOut,
  updateProfile,
} from "@react-native-firebase/auth";

export type AuthUser = {
  uid: string;
  phoneNumber?: string | null;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
};

export type AuthContextValue = {
  user: AuthUser | null;
  isSignedIn: boolean;
  isLoading: boolean;

  setupUser: (firebaseUser: any | null) => Promise<void>;

  updateUserProfile: (displayName: string) => Promise<boolean>;

  Logout: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Convert Firebase user into a simple app user.
   *
   * This function deliberately contains no project-specific
   * database, role, referral, notification or analytics logic.
   */
  const setupUser = async (firebaseUser: any | null) => {
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

  /**
   * Listen for Firebase authentication changes.
   *
   * This automatically handles:
   * - app startup
   * - login
   * - logout
   * - Firebase session restoration
   */
  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      void setupUser(firebaseUser);
    });

    return unsubscribe;
  }, []);

  /**
   * Update the Firebase user's display name.
   */
  const updateUserProfile = async (
    displayName: string
  ): Promise<boolean> => {
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;

      if (!firebaseUser) {
        return false;
      }

      await updateProfile(firebaseUser, {
        displayName: displayName.trim(),
      });

      await setupUser(auth.currentUser);

      return true;
    } catch (error) {
      console.error("Failed to update user profile:", error);
      return false;
    }
  };

  /**
   * Sign out of Firebase.
   */
  const Logout = async (): Promise<boolean> => {
    try {
      await signOut(getAuth());

      setUser(null);
      setIsSignedIn(false);

      return true;
    } catch (error) {
      console.error("Logout failed:", error);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isSignedIn,
        isLoading,
        setupUser,
        updateUserProfile,
        Logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Access authentication anywhere in the application.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside an AuthProvider"
    );
  }

  return context;
}