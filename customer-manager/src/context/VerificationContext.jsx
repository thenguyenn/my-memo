import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, clearAccessToken } from '../services/api';

const VerificationContext = createContext(null);

export function VerificationProvider({ children }) {
  const [user, setUser] = useState(null);
  const [googleClientId, setGoogleClientId] = useState(
    () => (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
  );
  const [authLoading, setAuthLoading] = useState(true);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const pendingRef = useRef(null);

  const isVerified = !!user;

  // Khôi phục phiên đăng nhập từ HttpOnly refreshToken cookie (không lưu localStorage)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const session = await api.refreshSession();
        if (mounted) {
          if (session?.googleClientId) {
            setGoogleClientId(session.googleClientId);
          }
          if (session?.user) {
            setUser(session.user);
          }
        }
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Làm mới accessToken định kỳ trong bộ nhớ trước khi hết hạn (12 phút/lần)
  useEffect(() => {
    if (!isVerified) return undefined;
    const timer = setInterval(async () => {
      const session = await api.refreshSession();
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
      }
    }, 12 * 60 * 1000);
    return () => clearInterval(timer);
  }, [isVerified]);

  const loginWithGoogle = useCallback(async (payload) => {
    const data = await api.loginWithGoogle(payload);
    setUser(data.user || null);
    setShowVerifyModal(false);
    const action = pendingRef.current;
    pendingRef.current = null;
    if (action) action();
    return data;
  }, []);

  const clearVerification = useCallback(async () => {
    clearAccessToken();
    setUser(null);
    await api.logout();
  }, []);

  const requireVerification = useCallback(
    (action) => {
      if (isVerified) {
        if (typeof action === 'function') action();
      } else {
        pendingRef.current = typeof action === 'function' ? action : null;
        setShowVerifyModal(true);
      }
    },
    [isVerified]
  );

  const cancelVerification = useCallback(() => {
    setShowVerifyModal(false);
    pendingRef.current = null;
  }, []);

  const value = {
    user,
    googleClientId,
    isVerified,
    authLoading,
    showVerifyModal,
    loginWithGoogle,
    verify: loginWithGoogle,
    requireVerification,
    cancelVerification,
    clearVerification,
  };

  return <VerificationContext.Provider value={value}>{children}</VerificationContext.Provider>;
}

export function useVerification() {
  const ctx = useContext(VerificationContext);
  if (!ctx) throw new Error('useVerification phải nằm trong <VerificationProvider>');
  return ctx;
}
