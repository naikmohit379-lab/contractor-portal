"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { hasPermission, type LoginInput, type Permission, type RegisterInput, type SessionUser } from "@roofdesk/shared";
import { api, post, refreshSession, setAccessToken } from "./api";

type Status = "loading" | "authed" | "anon";
interface AuthValue {
  user: SessionUser | null;
  status: Status;
  can: (p: Permission) => boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  // Access token lives in memory only; the httpOnly refresh cookie restores the session on reload.
  useEffect(() => {
    (async () => {
      if (await refreshSession()) {
        try {
          const { user } = await api<{ user: SessionUser }>("/auth/me");
          setUser(user);
          setStatus("authed");
          return;
        } catch {}
      }
      setStatus("anon");
    })();
  }, []);

  const startSession = (res: { accessToken: string; user: SessionUser }) => {
    setAccessToken(res.accessToken);
    setUser(res.user);
    setStatus("authed");
  };

  const login = useCallback(async (input: LoginInput) => startSession(await post("/auth/login", input)), []);
  const register = useCallback(async (input: RegisterInput) => startSession(await post("/auth/register", input)), []);
  const logout = useCallback(async () => {
    await post("/auth/logout").catch(() => {});
    setAccessToken(null);
    setUser(null);
    setStatus("anon");
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, status, login, register, logout, can: (p) => !!user && hasPermission(user.role, p) }),
    [user, status, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
