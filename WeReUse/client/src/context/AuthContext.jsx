import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api';

const AuthContext = createContext(null);

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

  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password });
    setUser(res.data.data.user);
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
    setUser(res.data.data.user);
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
      setUser(null);
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
    () => ({ user, loading, login, register, verifyEmail, resendCode, logout, refreshUser, setUser }),
    [user, loading, login, register, verifyEmail, resendCode, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
