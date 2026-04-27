/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import client from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("claims_token") || "");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("claims_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);

  function clearAuth() {
    setToken("");
    setUser(null);
    localStorage.removeItem("claims_token");
    localStorage.removeItem("claims_user");
  }

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    client
      .get("/auth/me")
      .then((res) => {
        if (!cancelled) setUser(res.data);
      })
      .catch(() => {
        if (!cancelled) clearAuth();
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function saveAuth(nextToken, nextUser) {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem("claims_token", nextToken);
    localStorage.setItem("claims_user", JSON.stringify(nextUser));
  }

  async function login(email, password) {
    setLoading(true);
    try {
      const res = await client.post("/auth/login", { email, password });
      saveAuth(res.data.token, res.data.user);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.response?.data?.message || "Login failed" };
    } finally {
      setLoading(false);
    }
  }

  async function bootstrapAdmin(name, email, password) {
    setLoading(true);
    try {
      const res = await client.post("/auth/bootstrap-admin", { name, email, password });
      saveAuth(res.data.token, res.data.user);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.response?.data?.message || "Failed to create admin" };
    } finally {
      setLoading(false);
    }
  }

  async function resetAdminPassword(email, newPassword, resetKey) {
    setLoading(true);
    try {
      await client.post("/auth/reset-admin-password", { email, newPassword, resetKey });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error.response?.data?.message || "Failed to reset admin password",
      };
    } finally {
      setLoading(false);
    }
  }

  async function changePassword(currentPassword, newPassword) {
    setLoading(true);
    try {
      await client.post("/auth/change-password", { currentPassword, newPassword });
      const me = await client.get("/auth/me");
      setUser(me.data);
      localStorage.setItem("claims_user", JSON.stringify(me.data));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error.response?.data?.message || "Failed to change password",
      };
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearAuth();
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        loading,
        login,
        logout,
        bootstrapAdmin,
        resetAdminPassword,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
