import { ApiError, api } from "./api";
import type { Session } from "../types";

export const login = (email: string, password: string) =>
  api<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email: email.trim(), password }) });

export const logout = () => api<void>("/auth/logout", { method: "POST" });

/** Restores the session from the HttpOnly cookie after a refresh. Returns null when nobody is signed in. */
export async function getSession(): Promise<Session | null> {
  try { return await api<Session>("/auth/me"); }
  catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; }
}
