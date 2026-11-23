import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authApi } from '../api';

const AuthContext = createContext(null);

// The login is ONE httpOnly cookie for the whole browser. Logging in as another student in a second tab
// replaces it, so the first tab would silently start acting as that student while still showing the old
// name (in chat it then looked as if you were talking to yourself). Every tab therefore announces account
// changes here, and a tab that finds itself on the wrong account reloads.
const ACCOUNT_KEY = 'wereuse:account';

function announceAccount(user) {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: user ? user.id : null, at: Date.now() }));
  } catch {
    /* private mode / storage blocked: the focus check below still catches it */
  }
}

function reloadPage() {
  window.location.reload();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until we know if a session exists

  // On every page load, ask the server who we are (the httpOnly cookie is sent automatically)
  useEffect(() => {
    let active = true;
    authApi
      .me()
      .then((res) => active && setUser(res.data.data.user))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // ---- keep every tab on the account that the cookie really belongs to ----
  const userIdRef = useRef(null);
  useEffect(() => {
    userIdRef.current = user ? user.id : null;
  }, [user]);

  /** Asks the server who the cookie belongs to; reloads this tab if that is not who it shows. */
  const syncAccount = useCallback(async () => {
    let serverId = null;
    try {
      const res = await authApi.me();
      serverId = res.data.data.user.id;
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 401 && status !== 403) return; // offline etc.: decide later
    }
    if (serverId !== userIdRef.current) reloadPage();
  }, []);

  useEffect(() => {
    if (loading) return undefined;
    // another tab logged in / out
    const onStorage = (e) => {
      if (e.key !== ACCOUNT_KEY || !e.newValue) return;
      try {
        const { id } = JSON.parse(e.newValue);
        if ((id || null) !== userIdRef.current) reloadPage();
      } catch {
        /* ignore */
      }
    };
    // coming back to this tab (also catches a login in another browser window without storage events)
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncAccount();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loading, syncAccount]);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password });
    userIdRef.current = res.data.data.user.id;
    setUser(res.data.data.user);
    announceAccount(res.data.data.user);
    return res.data.data.user;
  }, []);

  // Registration is two steps. This is step 1: it only e-mails a code ({ email, expiresInMinutes,
  // resendAfterSeconds }) - there is no account and no login yet.
  const register = useCallback(async (formData) => {
    const res = await authApi.register(formData);
    return res.data.data;
  }, []);

  // Step 2: the right code creates the account and logs the student in
  const verifyEmail = useCallback(async (email, code) => {
    const res = await authApi.verifyEmail(email, code);
    userIdRef.current = res.data.data.user.id;
    setUser(res.data.data.user);
    announceAccount(res.data.data.user);
    return res.data.data.user;
  }, []);

  // Returns how many seconds the "resend" button must wait
  const resendCode = useCallback(async (email) => {
    const res = await authApi.resendCode(email);
    return res.data.data?.resendAfterSeconds;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      userIdRef.current = null;
      setUser(null);
      announceAccount(null);
    }
  }, []);

  // Re-reads the user, e.g. to pick up an admin's decision
  const refreshUser = useCallback(async () => {
    try {
      const res = await authApi.me();
      setUser(res.data.data.user);
      return res.data.data.user;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) setUser(null); // session ended or account blocked
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, verifyEmail, resendCode, logout, refreshUser, setUser, syncAccount }),
    [user, loading, login, register, verifyEmail, resendCode, logout, refreshUser, syncAccount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
