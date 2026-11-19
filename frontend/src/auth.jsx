import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

/*
 * Session state. Tokens and the user object live in localStorage under the same keys the
 * API client (services/api.js) reads: "access", "refresh", "user".
 */
const AuthContext = createContext(null);

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);

  const signIn = useCallback(({ access, refresh, user: signedInUser }) => {
    localStorage.setItem("access", access);
    localStorage.setItem("refresh", refresh);
    localStorage.setItem("user", JSON.stringify(signedInUser));
    setUser(signedInUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, setUser, signIn, logout }), [user, signIn, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export const ROLE_LABELS = {
  ADMIN: "Administrator",
  AP_CLERK: "AP Clerk",
  APPROVER: "Approver",
  ACCOUNTANT: "Accountant",
  AUDITOR: "Auditor",
};
